# Local Auto-Apply Automation Service

LLM-driven browser automation (via [browser-use](https://github.com/browser-use/browser-use))
that fills and submits job applications using your saved Personal Details.
Runs **locally** — the deployed site's serverless functions can't launch a
browser, so the "AI Apply" auto-apply button talks to this service on your
machine at `http://localhost:8765`.

## One-time setup (already done if `.venv` exists)

```powershell
cd automation-service
python -m venv .venv
.venv\Scripts\python -m pip install browser-use fastapi "uvicorn[standard]"
```

Requires Python 3.11+ and Google Chrome installed.

## Start the service (every time you want to auto-apply)

```powershell
cd automation-service
.venv\Scripts\python -m uvicorn main:app --port 8765
```

Leave the window open. The web app's Auto Apply button will now work; a
Chrome window opens so you can watch the agent and step in for CAPTCHAs.

## Configuration (optional env vars)

| Variable | Default | Meaning |
|---|---|---|
| `CLAUDE_API_KEY` | read from `../.env.local` | Anthropic API key |
| `BROWSER_LLM_MODEL` | `claude-haiku-4-5` | Cheapest capable model; set `claude-sonnet-4-6` if a portal proves too tricky |
| `BROWSER_MAX_STEPS` | `80` | Hard cap on agent steps per application (cost guard) |

## Notes

- Set an **Automation Email** and **Automation Password** in Personal Details —
  used to create/sign into portal accounts (e.g. Workday). Use a unique
  password, not one you use anywhere else.
- The password is passed to the browser via browser-use's `sensitive_data`
  mechanism: the LLM never sees the actual value.
- CAPTCHAs / email OTPs are never bypassed — the run stops with
  `needs_human` and you finish that step manually in the open Chrome window.
