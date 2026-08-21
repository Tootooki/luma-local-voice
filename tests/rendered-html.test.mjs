import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Luma voice-assistant shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Luma — Private Local Voice Assistant<\/title>/i);
  assert.match(html, /Just talk\. I’m here\./);
  assert.match(html, /Local &amp; private/);
  assert.match(html, /Connecting to local models/);
  assert.match(html, /Granite 4\.1 3B · Whisper Small · Kokoro 82M/);
  assert.match(html, /Audio is not saved/);
});

test("keeps capture and inference on local services", async () => {
  const [page, backend, launcher] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../backend/main.py", import.meta.url), "utf8"),
    readFile(new URL("../docs/index.html", import.meta.url), "utf8"),
  ]);

  assert.match(page, /const API = "http:\/\/127\.0\.0\.1:8787"/);
  assert.match(page, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(page, /new MediaRecorder/);
  assert.match(page, /audio_base64/);
  assert.match(backend, /OLLAMA_URL = "http:\/\/127\.0\.0\.1:11434"/);
  assert.match(backend, /granite4\.1:3b/);
  assert.match(backend, /TemporaryDirectory\(prefix="luma-turn-"\)/);
  assert.match(launcher, /href="http:\/\/localhost:3000\/"/);
  assert.doesNotMatch(launcher, /getUserMedia|api\/conversation/);
});
