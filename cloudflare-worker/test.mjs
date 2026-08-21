import test from "node:test";
import assert from "node:assert/strict";
import worker, { cleanHistory, encodeBase64 } from "./src/index.js";

const origin = "https://tootooki.github.io";

function environment({ rateAllowed = true } = {}) {
  const calls = [];
  return {
    calls,
    AI: {
      async run(model, input) {
        calls.push({ model, input });
        if (model.includes("whisper")) return { text: "What is the capital of France?" };
        if (model.includes("llama")) return { response: "Paris is the capital of France." };
        return new Response(new Uint8Array([73, 68, 51]), { headers: { "content-type": "audio/mpeg" } });
      },
    },
    RATE_LIMITER: { async limit() { return { success: rateAllowed }; } },
  };
}

test("utility functions constrain untrusted input", () => {
  assert.equal(encodeBase64(new Uint8Array([1, 2, 3]).buffer), "AQID");
  assert.deepEqual(cleanHistory([{ role: "system", content: "bad" }, { role: "user", content: " hi " }]), [{ role: "user", content: "hi" }]);
});

test("rejects every unapproved web origin", async () => {
  const response = await worker.fetch(new Request("https://worker.test/health", { headers: { Origin: "https://example.com" } }), environment());
  assert.equal(response.status, 403);
});

test("health endpoint enables GitHub Pages CORS", async () => {
  const response = await worker.fetch(new Request("https://worker.test/health", { headers: { Origin: origin } }), environment());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("access-control-allow-origin"), origin);
  assert.equal((await response.json()).ok, true);
});

test("typed conversation generates an answer and voice", async () => {
  const env = environment();
  const form = new FormData();
  form.set("text", "Hello");
  form.set("history", "[]");
  const response = await worker.fetch(new Request("https://worker.test/conversation", { method: "POST", headers: { Origin: origin }, body: form }), env);
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.transcript, "Hello");
  assert.equal(body.reply, "Paris is the capital of France.");
  assert.equal(body.audio, "SUQz");
  assert.equal(env.calls.length, 2);
  assert.match(env.calls[0].input.messages[0].content, /AI executive assistant calling FedEx/);
  assert.match(env.calls[0].input.messages[0].content, /Dispute Resolution Team/);
  assert.match(env.calls[0].input.messages[0].content, /human speaking with you is the FedEx representative/);
});

test("voice conversation transcribes before answering", async () => {
  const env = environment();
  const form = new FormData();
  form.set("audio", new File([new Uint8Array([1, 2, 3])], "voice.webm", { type: "audio/webm" }));
  const response = await worker.fetch(new Request("https://worker.test/conversation", { method: "POST", headers: { Origin: origin }, body: form }), env);
  assert.equal(response.status, 200);
  assert.equal(env.calls.length, 3);
  assert.match(env.calls[0].model, /whisper/);
  assert.equal(env.calls[0].input.beam_size, 1);
  assert.equal(env.calls[1].input.max_tokens, 100);
});

test("rate limiting happens before AI usage", async () => {
  const env = environment({ rateAllowed: false });
  const form = new FormData();
  form.set("text", "Hello");
  const response = await worker.fetch(new Request("https://worker.test/conversation", { method: "POST", headers: { Origin: origin }, body: form }), env);
  assert.equal(response.status, 429);
  assert.equal(env.calls.length, 0);
});
