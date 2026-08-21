import unittest
from unittest.mock import AsyncMock, patch

from fastapi import HTTPException

import main


class FakeResponse:
    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return {
            "choices": [
                {"message": {"content": "A concise answer from Muse Spark."}}
            ]
        }


class FakeAsyncClient:
    request: dict | None = None

    def __init__(self, **kwargs):
        self.options = kwargs

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    async def post(self, url: str, **kwargs):
        FakeAsyncClient.request = {"url": url, **kwargs}
        return FakeResponse()


class HybridModeTests(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        main.histories["local"].clear()
        main.histories["meta"].clear()
        FakeAsyncClient.request = None

    def test_local_history_is_not_included_in_meta_messages(self) -> None:
        main.histories["local"].append(
            {"role": "user", "content": "private local detail"}
        )

        messages = main.conversation_messages("hello Meta", "meta")

        self.assertNotIn("private local detail", str(messages))
        self.assertEqual(messages[-1], {"role": "user", "content": "hello Meta"})

    async def test_meta_mode_requires_a_key(self) -> None:
        with patch.object(main, "META_API_KEY", ""):
            with self.assertRaises(HTTPException) as raised:
                await main.answer_meta([{"role": "user", "content": "hello"}])

        self.assertEqual(raised.exception.status_code, 503)

    async def test_health_enables_meta_mode_when_key_is_configured(self) -> None:
        with (
            patch.object(main, "META_API_KEY", "LLM|test|secret"),
            patch.object(main, "ollama_ready", AsyncMock(return_value=True)),
        ):
            response = await main.health()

        self.assertTrue(response["modes"]["local"]["ready"])
        self.assertTrue(response["modes"]["meta"]["ready"])
        self.assertEqual(response["modes"]["meta"]["model"], "Muse Spark 1.2")

    async def test_meta_request_uses_official_openai_compatible_endpoint(self) -> None:
        messages = [{"role": "user", "content": "hello"}]
        with (
            patch.object(main, "META_API_KEY", "LLM|test|secret"),
            patch.object(main, "META_BASE_URL", "https://api.meta.ai/v1"),
            patch.object(main, "META_MODEL", "muse-spark-1.2"),
            patch.object(main.httpx, "AsyncClient", FakeAsyncClient),
        ):
            reply = await main.answer_meta(messages)

        self.assertEqual(reply, "A concise answer from Muse Spark.")
        self.assertEqual(
            FakeAsyncClient.request["url"],
            "https://api.meta.ai/v1/chat/completions",
        )
        self.assertEqual(
            FakeAsyncClient.request["headers"]["Authorization"],
            "Bearer LLM|test|secret",
        )
        self.assertEqual(
            FakeAsyncClient.request["json"]["model"], "muse-spark-1.2"
        )


if __name__ == "__main__":
    unittest.main()
