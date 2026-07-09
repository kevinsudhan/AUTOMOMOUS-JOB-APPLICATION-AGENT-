"""Harmless end-to-end smoke test: launches the browser, runs a 2-step agent
task against example.com with the configured LLM, and prints the result.
Verifies Chrome + browser-use + Anthropic wiring without touching any real
job portal. Costs a fraction of a cent."""
import asyncio

from main import ANTHROPIC_API_KEY, LLM_MODEL


async def main() -> None:
    from browser_use import Agent, BrowserProfile, ChatAnthropic

    agent = Agent(
        task="Go to https://example.com and tell me the exact text of the main heading, then finish.",
        llm=ChatAnthropic(model=LLM_MODEL, api_key=ANTHROPIC_API_KEY),
        browser_profile=BrowserProfile(headless=True),
        use_vision=False,
    )
    history = await agent.run(max_steps=5)
    print("SUCCESS:", history.is_successful())
    print("RESULT:", history.final_result())


if __name__ == "__main__":
    asyncio.run(main())
