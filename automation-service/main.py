"""
Local auto-apply automation service.

Runs browser-use (LLM-driven browser automation) against job application
portals (Workday, Greenhouse, Lever, ...) using the signed-in user's saved
profile from the Next.js app. This runs LOCALLY on the user's machine —
Netlify serverless functions cannot launch a browser, which is why the old
in-app Playwright auto-apply never worked in production.

Start:  .venv/Scripts/python -m uvicorn main:app --port 8765
The "AI Apply" section of the web app talks to http://localhost:8765.
"""
import asyncio
import base64
import json
import os
import re
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Config — CLAUDE_API_KEY is reused from the Next.js app's .env.local so the
# user doesn't maintain the same secret in two places.
# ---------------------------------------------------------------------------

def _load_env_file(path: Path) -> dict[str, str]:
    values: dict[str, str] = {}
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        values[key.strip()] = value.strip()
    return values

_PARENT_ENV = _load_env_file(Path(__file__).resolve().parent.parent / ".env.local")

def _env(name: str, default: str = "") -> str:
    return os.environ.get(name) or _PARENT_ENV.get(name, "") or default

ANTHROPIC_API_KEY = _env("CLAUDE_API_KEY") or _env("ANTHROPIC_API_KEY")
# Haiku 4.5 by default: browser-use steps are mostly input tokens (page
# structure) with tiny outputs, and form-filling is well within Haiku's
# capability — ~3x cheaper than Sonnet. Override for tricky portals:
#   set BROWSER_LLM_MODEL=claude-sonnet-4-6
LLM_MODEL = _env("BROWSER_LLM_MODEL", "claude-haiku-4-5")
MAX_STEPS = int(_env("BROWSER_MAX_STEPS", "80"))

app = FastAPI(title="Job AI local automation service")

app.add_middleware(
    CORSMiddleware,
    # The deployed app and local dev both need to reach this localhost service
    # from the browser.
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://jobapai.netlify.app",
    ],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Run registry (in-memory; this is a single-user local tool)
# ---------------------------------------------------------------------------

RUNS: dict[str, dict[str, Any]] = {}

class ApplyRequest(BaseModel):
    jobUrl: str
    profile: dict[str, Any]
    resumePdfBase64: Optional[str] = None
    autoSubmit: bool = True

def _now() -> str:
    return datetime.now(timezone.utc).isoformat()

def _profile_for_prompt(profile: dict[str, Any]) -> str:
    """Drop empty fields and the password (which goes via sensitive_data,
    never through the LLM) before embedding the profile in the task text."""
    cleaned = {
        k: v for k, v in profile.items()
        if v not in ("", None, [], {}) and k not in ("automationPassword", "baseResume", "projects")
    }
    return json.dumps(cleaned, indent=2, ensure_ascii=False)

def _build_task(job_url: str, profile: dict[str, Any], resume_path: Optional[str], auto_submit: bool) -> str:
    submit_instruction = (
        "If every required field is filled and there is no CAPTCHA, email "
        "verification, or OTP blocking you, SUBMIT the application fully — "
        "click through every remaining step including the final Submit/Apply "
        "button, and only finish after you see a confirmation."
        if auto_submit
        else "Fill everything but STOP before the final Submit button and finish, describing what is ready."
    )
    resume_instruction = (
        f"The candidate's resume PDF is available at this local file path for upload fields: {resume_path}"
        if resume_path
        else "No resume file is available; skip resume upload fields if optional, or note it if required."
    )
    return f"""You are applying to a job on behalf of a candidate. Complete the job application at:
{job_url}

CANDIDATE PROFILE (use these values to fill every form field; leave optional fields blank if no value is given):
{_profile_for_prompt(profile)}

ACCOUNT HANDLING:
- Many portals (especially Workday) require an account. If a sign-in is required, first try to sign in with email "{profile.get('automationEmail') or profile.get('email', '')}" and the password (use the secret x_automation_password — never type it visibly into non-password fields).
- If no account exists, CREATE one with that same email and the secret x_automation_password.
- If the portal asks to verify the email with a code/link (OTP), you cannot complete that — finish with success=false and the message "needs_human: email verification required".

HARD RULES:
- If you hit a CAPTCHA or any bot check you cannot pass, do NOT attempt to bypass it. Finish with success=false and the message "needs_human: captcha".
- Never invent information not in the profile. For required questions with no profile answer, choose the most reasonable neutral/honest option (e.g. "No" for veteran status questions if unspecified is not an option, "Prefer not to say" where offered).
- {resume_instruction}
- Answer standard screening questions truthfully from the profile (work authorization, relocation, notice period, expected salary).
- {submit_instruction}

When finished, summarize what you did: whether the application was submitted, and anything left for the candidate to do."""

async def _run_apply(run_id: str, req: ApplyRequest) -> None:
    run = RUNS[run_id]
    run["status"] = "running"
    resume_path: Optional[str] = None
    try:
        from browser_use import Agent, BrowserProfile, ChatAnthropic

        if req.resumePdfBase64:
            fd, resume_path = tempfile.mkstemp(suffix=".pdf", prefix="resume_")
            with os.fdopen(fd, "wb") as f:
                f.write(base64.b64decode(req.resumePdfBase64))

        task = _build_task(req.jobUrl, req.profile, resume_path, req.autoSubmit)

        sensitive: dict[str, str] = {}
        password = (req.profile or {}).get("automationPassword") or ""
        if password:
            # browser-use substitutes this when typing; the LLM only ever
            # sees the placeholder name, never the actual password.
            sensitive["x_automation_password"] = password

        llm = ChatAnthropic(model=LLM_MODEL, api_key=ANTHROPIC_API_KEY)

        async def on_step_end(agent: "Agent") -> None:
            try:
                history = agent.history
                last = history.history[-1] if history.history else None
                if last and last.model_output:
                    for action in last.model_output.action:
                        dumped = action.model_dump(exclude_none=True)
                        for name, params in dumped.items():
                            run["steps"].append(f"{name}: {json.dumps(params, default=str)[:200]}")
                run["stepCount"] = len(history.history)
            except Exception:
                pass  # progress reporting must never kill the run

        agent = Agent(
            task=task,
            llm=llm,
            browser_profile=BrowserProfile(headless=False, keep_alive=False),
            sensitive_data=sensitive or None,
            available_file_paths=[resume_path] if resume_path else None,
            use_vision=False,  # DOM mode: no screenshot tokens, much cheaper
            max_failures=3,
        )
        history = await agent.run(max_steps=MAX_STEPS)

        final = history.final_result() or ""
        success = bool(history.is_successful())
        needs_human = "needs_human" in final.lower()
        run["result"] = final
        run["status"] = "needs_human" if needs_human else ("completed" if success else "failed")
        if not success and not needs_human and not final:
            run["error"] = "Agent stopped without completing (step limit or repeated failures)."
    except Exception as exc:  # noqa: BLE001
        run["status"] = "failed"
        run["error"] = f"{type(exc).__name__}: {exc}"
    finally:
        run["finishedAt"] = _now()
        if resume_path:
            try:
                os.unlink(resume_path)
            except OSError:
                pass

# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "model": LLM_MODEL,
        "hasApiKey": bool(ANTHROPIC_API_KEY),
        "maxSteps": MAX_STEPS,
    }

@app.post("/apply")
async def apply(req: ApplyRequest) -> dict[str, str]:
    if not ANTHROPIC_API_KEY:
        raise HTTPException(500, "CLAUDE_API_KEY not found (set it in the app's .env.local or the environment).")
    if not re.match(r"^https?://", req.jobUrl or ""):
        raise HTTPException(400, "jobUrl must be a valid http(s) URL — auto-apply needs the job posting link, not a pasted description.")
    run_id = uuid.uuid4().hex[:12]
    RUNS[run_id] = {
        "id": run_id,
        "status": "queued",
        "jobUrl": req.jobUrl,
        "steps": [],
        "stepCount": 0,
        "result": None,
        "error": None,
        "startedAt": _now(),
        "finishedAt": None,
    }
    asyncio.get_event_loop().create_task(_run_apply(run_id, req))
    return {"runId": run_id}

@app.get("/status/{run_id}")
def status(run_id: str) -> dict[str, Any]:
    run = RUNS.get(run_id)
    if not run:
        raise HTTPException(404, "Unknown run id")
    return run
