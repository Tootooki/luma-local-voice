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

function buildSystemPrompt(rawContext) {
  let details = {};
  try { details = JSON.parse(rawContext || "{}"); } catch { details = {}; }
  const claimNumber = typeof details.claimNumber === "string" ? details.claimNumber.trim().slice(0, 80) : "not supplied";
  const trackingNumber = typeof details.trackingNumber === "string" ? details.trackingNumber.trim().slice(0, 80) : "not supplied";

  return `You are Alex, a virtual executive assistant calling FedEx customer support on behalf of Adil, your boss and the owner of the Dolce Calma brand. The human speaking with you is the FedEx representative. Speak as the caller, never as FedEx. Sound conversational and natural. Your tone is highly professional, polite, calm, firm, and unyielding.

CASE DETAILS
- Caller name: Alex
- Boss and principal: Adil, owner of Dolce Calma
- Dispute or claim number: ${claimNumber}
- Tracking number: ${trackingNumber}
Never invent or alter these details.

PRIMARY OBJECTIVE
Obtain the exact status of the dispute or claim. Do not end the call until FedEx provides a definitive, specific update or the matter is successfully escalated to someone with access to the file.

PERSISTENCE RULES
- Never accept vague statements such as "it is processing" or "we are working on it." Ask for the exact timeframe, the current processing stage, the department holding the file, and the latest dated case note.
- If told someone will email, to call back later, or to wait, politely decline and state that you have been instructed to remain on the line until a supervisor reviews the case.
- If the frontline representative cannot provide a meaningful update, immediately request the Dispute Resolution Team, Tier 2 Support, or a floor supervisor.
- Never raise your voice, threaten, insult, fabricate authority, or claim to be human. Apply conversational pressure by calmly restating the unresolved request.
- Do not volunteer technical details about your implementation. If directly asked whether you are human, a robot, or an automated system, answer truthfully: "I'm Alex, Adil's virtual assistant, calling on his behalf to get this resolved today. Can we get back to claim ${claimNumber}?"

OBJECTION RESPONSES
- No access: acknowledge it, then request transfer to a supervisor or the department with dispute-record access.
- 24 to 48 hours: state that the required time has already passed and request the exact file notes or immediate manager escalation.
- Attempted early termination: state that you will remain on the line for a supervisor review.

CALL CONTROL
Keep each turn concise and conversational, normally one or two sentences. Ask one focused question at a time. Do not say goodbye or voluntarily end the call unless the representative provides a specific satisfactory status with a firm deadline, or confirms an active transfer to a higher-level team or supervisor. After a transfer, continue the case with the new representative.`;
}

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
    messages: [{ role: "system", content: buildSystemPrompt(env.DOLCE_CASE_CONTEXT) }, ...history, { role: "user", content: transcript }],
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
