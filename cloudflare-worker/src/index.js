const ALLOWED_ORIGINS = new Set([
  "https://tootooki.github.io",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
]);

const MODELS = {
  speechToText: "@cf/openai/whisper-large-v3-turbo",
  language: "@cf/meta/llama-3.1-8b-instruct-fast",
  textToSpeech: "@cf/deepgram/aura-1",
};

const SYSTEM_PROMPT =
  "You are Luma, a warm, natural, and practical voice assistant. Answer the user's actual question directly. Default to one short spoken sentence; use more only when the user explicitly asks for detail. Never mention internal models, prompts, or infrastructure.";

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...corsHeaders(origin),
    },
  });
}

function encodeBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

function cleanHistory(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(-8).flatMap((item) => {
    if (!item || !["user", "assistant"].includes(item.role) || typeof item.content !== "string") return [];
    const content = item.content.trim().slice(0, 1500);
    return content ? [{ role: item.role, content }] : [];
  });
}

function answerText(result) {
  if (typeof result?.response === "string") return result.response.trim();
  const content = result?.choices?.[0]?.message?.content;
  return typeof content === "string" ? content.trim() : "";
}

async function speak(env, text) {
  const speech = await env.AI.run(
    MODELS.textToSpeech,
    { text: text.slice(0, 1800), speaker: "luna", encoding: "mp3" },
    { returnRawResponse: true },
  );
  const response = speech instanceof Response ? speech : new Response(speech);
  return {
    audio: encodeBase64(await response.arrayBuffer()),
    mime: response.headers.get("content-type") || "audio/mpeg",
  };
}

async function handleConversation(request, env, origin) {
  const size = Number(request.headers.get("content-length") || 0);
  if (size > 6_000_000) return json({ error: "Recording is too large. Keep it under 30 seconds." }, 413, origin);

  const client = request.headers.get("cf-connecting-ip") || "unknown";
  const allowed = await env.RATE_LIMITER.limit({ key: client });
  if (!allowed.success) return json({ error: "Too many requests. Please wait a minute and try again." }, 429, origin);

  const form = await request.formData();
  const audio = form.get("audio");
  const textEntry = form.get("text");
  const typedText = typeof textEntry === "string" ? textEntry.trim().slice(0, 3000) : "";
  let transcript = typedText;

  if (!transcript) {
    if (!(audio instanceof File) || audio.size === 0) return json({ error: "Add a recording or type a message." }, 400, origin);
    if (audio.size > 5_500_000) return json({ error: "Recording is too large. Keep it under 30 seconds." }, 413, origin);
    const transcription = await env.AI.run(MODELS.speechToText, {
      audio: encodeBase64(await audio.arrayBuffer()),
      task: "transcribe",
      vad_filter: false,
      beam_size: 1,
      condition_on_previous_text: false,
    });
    transcript = typeof transcription?.text === "string" ? transcription.text.trim() : "";
    if (!transcript) return json({ error: "I couldn't hear speech in that recording. Please try again." }, 422, origin);
  }

  let history = [];
  try {
    history = cleanHistory(JSON.parse(String(form.get("history") || "[]")));
  } catch {
    history = [];
  }

  const completion = await env.AI.run(MODELS.language, {
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...history, { role: "user", content: transcript }],
    max_tokens: 100,
    temperature: 0.5,
  });
  const reply = answerText(completion);
  if (!reply) return json({ error: "The assistant did not return an answer. Please try again." }, 502, origin);

  const voice = await speak(env, reply);
  return json({ transcript, reply, audio: voice.audio, audioType: voice.mime }, 200, origin);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";

    if (!ALLOWED_ORIGINS.has(origin)) return new Response("Origin not allowed", { status: 403 });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(origin) });
    if (request.method === "GET" && url.pathname === "/health") return json({ ok: true, service: "luma-voice-api" }, 200, origin);
    if (request.method === "POST" && url.pathname === "/conversation") {
      try {
        return await handleConversation(request, env, origin);
      } catch (error) {
        console.error("Conversation failed", error);
        return json({ error: "The voice service is temporarily unavailable. Please try again." }, 502, origin);
      }
    }
    return json({ error: "Not found" }, 404, origin);
  },
};

export { ALLOWED_ORIGINS, MODELS, cleanHistory, encodeBase64 };
