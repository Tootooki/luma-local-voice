"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Phase = "connecting" | "ready" | "listening" | "thinking" | "speaking" | "offline" | "error";
const API = "http://127.0.0.1:8787";
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
  const [models, setModels] = useState("Qwen · Whisper · Kokoro");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const player = useRef<HTMLAudioElement | null>(null);

  const health = useCallback(async () => {
    setPhase("connecting");
    try {
      const response = await fetch(`${API}/health`, { signal: AbortSignal.timeout(2500) });
      if (!response.ok) throw new Error();
      const data = await response.json();
      setModels(data.models?.join(" · ") || models);
      setPhase("ready"); setMessage("Your conversation stays on this Mac.");
    } catch { setPhase("offline"); setMessage("The interface is ready. Start the local model service to begin."); }
  }, [models]);

  useEffect(() => { void health(); return () => stream.current?.getTracks().forEach(t => t.stop()); }, [health]);

  async function submit(audio: Blob) {
    setPhase("thinking"); setMessage("Transcribing and preparing a concise answer…");
    const started = performance.now();
    try {
      const form = new FormData(); form.append("audio", audio, audio.type.includes("mp4") ? "turn.mp4" : "turn.webm");
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
    if (phase === "offline" || phase === "error") return health();
    if (phase === "listening") return recorder.current?.stop();
    if (phase === "speaking") { player.current?.pause(); setPhase("ready"); setMessage("Response stopped. Ready for your next turn."); return; }
    if (phase === "ready") await listen();
  }

  const disabled = phase === "connecting" || phase === "thinking";
  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="#top"><span className="brand-mark"><i/><i/><i/></span><span>Luma</span></a>
        <div className={`privacy-pill ${phase === "offline" ? "muted" : ""}`}><span className="status-dot"/>Local &amp; private</div>
      </header>
      <section className="conversation" id="top">
        <div className="eyebrow">Your private voice assistant</div>
        <h1>Just talk. I’m here.</h1>
        <p className="intro">Fast, natural conversation powered entirely by the models on your Mac.</p>
        <button className={`voice-orb ${phase}`} type="button" onClick={act} disabled={disabled} aria-label={copy[phase][1]}>
          <span className="orb-glow"/><span className="wave" aria-hidden="true">{Array.from({length:17},(_,i)=><i key={i}/>)}</span>
        </button>
        <div className="phase-label">{copy[phase][0]}</div>
        <button className="primary-action" onClick={act} disabled={disabled}>{copy[phase][1]}</button>
        <p className={`helper ${phase === "error" ? "danger" : ""}`}>{message}</p>
      </section>
      <section className="transcript-card" aria-live="polite">
        <div className="card-head"><span>Conversation</span>{latency !== null && <span className="latency">{latency.toFixed(1)}s response</span>}</div>
        {!userText && !assistantText ? <div className="empty-state"><span>“</span><p>Your transcript will appear here after the first turn.</p></div> :
          <div className="turns"><div className="turn"><span>You</span><p>{userText}</p></div><div className="turn assistant"><span>Luma</span><p>{assistantText}</p></div></div>}
      </section>
      <footer><span>{models}</span><b>•</b><span>No cloud AI</span><b>•</b><span>Audio is not saved</span></footer>
    </main>
  );
}
