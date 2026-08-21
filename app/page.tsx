"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "connecting" | "ready" | "listening" | "thinking" | "speaking" | "offline" | "error";
type Mode = "local" | "meta";
const API = "/api";
const copy: Record<Phase, [string, string]> = {
  connecting: ["Connecting to local models", "Please wait"], ready: ["Ready when you are", "Start conversation"],
  listening: ["I’m listening", "Finish speaking"], thinking: ["Thinking locally", "Processing your request"],
  speaking: ["Responding", "Tap to stop"], offline: ["Local service is offline", "Check connection"],
  error: ["Something needs attention", "Try again"],
};

export default function Home() {
  const [phase, setPhase] = useState<Phase>("connecting");
  const [message, setMessage] = useState("Checking the private local connection…");
  const [userText, setUserText] = useState("");
  const [assistantText, setAssistantText] = useState("");
  const [latency, setLatency] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("local");
  const [metaAvailable, setMetaAvailable] = useState(false);
  const [localModels, setLocalModels] = useState("Granite 4.1 3B · Whisper Small · Kokoro 82M");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const player = useRef<HTMLAudioElement | null>(null);

  const health = useCallback(async () => {
    try {
      const response = await fetch(`${API}/health`, { signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setLocalModels(data.models?.join(" · ") || "Granite 4.1 3B · Whisper Small · Kokoro 82M");
      setMetaAvailable(Boolean(data.modes?.meta?.ready));
      setPhase("ready"); setMessage("Your conversation stays on this Mac.");
    } catch { setPhase("offline"); setMessage("The interface is ready. Start the local model service to begin."); }
  }, []);

  useEffect(() => {
    const healthCheck = window.setTimeout(() => void health(), 0);
    return () => {
      window.clearTimeout(healthCheck);
      stream.current?.getTracks().forEach(t => t.stop());
    };
  }, [health]);

  async function submit(audio: Blob) {
    setPhase("thinking");
    setMessage(mode === "meta" ? "Transcribing locally, then asking Muse Spark…" : "Transcribing and preparing a local answer…");
    const started = performance.now();
    try {
      const form = new FormData();
      form.append("audio", audio, audio.type.includes("mp4") ? "turn.mp4" : "turn.webm");
      form.append("mode", mode);
      const response = await fetch(`${API}/api/conversation`, { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "The local assistant could not process that turn.");
      setUserText(data.transcript); setAssistantText(data.reply); setLatency((performance.now() - started) / 1000);
      setPhase("speaking"); setMessage("Playing the response from your local voice model.");
      const bytes = Uint8Array.from(atob(data.audio_base64), c => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
      player.current = new Audio(url);
      player.current.onended = () => { URL.revokeObjectURL(url); setPhase("ready"); setMessage("Ready for your next turn."); };
      player.current.onerror = () => { setPhase("error"); setMessage("The answer was created, but audio playback was blocked."); };
      await player.current.play();
    } catch (error) { setPhase("error"); setMessage(error instanceof Error ? error.message : "The turn could not be completed."); }
  }

  async function listen() {
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      stream.current = media; chunks.current = [];
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/mp4";
      recorder.current = new MediaRecorder(media, { mimeType });
      recorder.current.ondataavailable = event => event.data.size > 0 && chunks.current.push(event.data);
      recorder.current.onstop = () => { media.getTracks().forEach(t => t.stop()); void submit(new Blob(chunks.current, { type: mimeType })); };
      recorder.current.start(250); setPhase("listening"); setMessage("Speak naturally, then tap once when you’re finished.");
      window.setTimeout(() => recorder.current?.state === "recording" && recorder.current.stop(), 30000);
    } catch { setPhase("error"); setMessage("Microphone access was denied. Allow it in browser settings, then try again."); }
  }

  async function act() {
    if (phase === "offline" || phase === "error") { setPhase("connecting"); return health(); }
    if (phase === "listening") return recorder.current?.stop();
    if (phase === "speaking") { player.current?.pause(); setPhase("ready"); setMessage("Response stopped. Ready for your next turn."); return; }
    if (phase === "ready") await listen();
  }

  function selectMode(next: Mode) {
    if (phase !== "ready" || (next === "meta" && !metaAvailable)) return;
    setMode(next);
    setUserText("");
    setAssistantText("");
    setLatency(null);
    setMessage(next === "meta"
      ? "Audio stays local. This mode sends the transcript and its separate history to Meta."
      : "Your conversation stays on this Mac.");
  }

  const disabled = phase === "connecting" || phase === "thinking";
  const activeCopy = phase === "thinking" && mode === "meta"
    ? ["Thinking with Muse Spark", "Processing in Meta cloud"]
    : copy[phase];
  const models = mode === "meta"
    ? "Muse Spark 1.2 · Whisper Small · Kokoro 82M"
    : localModels;
  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#top"><span className="brand-mark"><i/><i/><i/></span><span>Luma</span></a>
        <div className={`privacy-pill ${phase === "offline" ? "muted" : ""} ${mode === "meta" ? "cloud" : ""}`}>
          <span className="status-dot"/>{mode === "meta" ? "Meta cloud mode" : "Local & private"}
        </div>
      </header>
      <section className="conversation" id="top">
        <div className="eyebrow">Your private voice assistant</div>
        <h1>Just talk. I’m here.</h1>
        <p className="intro">Choose private local speed or optional frontier reasoning. Speech always stays on your Mac.</p>
        <div className="mode-selector" role="group" aria-label="Answer model">
          <button className={`mode-option ${mode === "local" ? "active" : ""}`} type="button" onClick={() => selectMode("local")} disabled={phase !== "ready"} aria-pressed={mode === "local"}>
            <span>Granite Local</span><small>Fast · fully private</small>
          </button>
          <button className={`mode-option meta ${mode === "meta" ? "active" : ""}`} type="button" onClick={() => selectMode("meta")} disabled={phase !== "ready" || !metaAvailable} aria-pressed={mode === "meta"} title={metaAvailable ? "Use Meta frontier reasoning" : "Add MODEL_API_KEY to enable"}>
            <span>Muse Frontier</span><small>{metaAvailable ? "Smarter · transcript cloud" : "MODEL_API_KEY needed"}</small>
          </button>
        </div>
        <button className={`voice-orb ${phase} ${mode === "meta" ? "cloud" : ""}`} type="button" onClick={act} disabled={disabled} aria-label={activeCopy[1]}>
          <span className="orb-glow"/><span className="wave" aria-hidden="true">{Array.from({length:17},(_,i)=><i key={i}/>)}</span>
        </button>
        <div className="phase-label">{activeCopy[0]}</div>
        <button className="primary-action" onClick={act} disabled={disabled}>{activeCopy[1]}</button>
        <p className={`helper ${phase === "error" ? "danger" : ""}`}>{message}</p>
      </section>
      <section className="transcript-card" aria-live="polite">
        <div className="card-head"><span>Conversation</span>{latency !== null && <span className="latency">{latency.toFixed(1)}s response</span>}</div>
        {!userText && !assistantText ? <div className="empty-state"><span>“</span><p>Your transcript will appear here after the first turn.</p></div> :
          <div className="turns"><div className="turn"><span>You</span><p>{userText}</p></div><div className="turn assistant"><span>Luma</span><p>{assistantText}</p></div></div>}
      </section>
      <footer><span>{models}</span><b>•</b><span>{mode === "meta" ? "Transcript sent to Meta" : "No cloud AI"}</span><b>•</b><span>Audio is not saved</span></footer>
    </main>
  );
}
