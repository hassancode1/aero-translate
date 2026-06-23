import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { useGeminiRecorder } from "../hooks/useGeminiRecorder";
import { useGeminiSpeech } from "../hooks/useGeminiSpeech";
import { useChunkPlayback } from "../hooks/useChunkPlayback";
import { flagFor, nameFor } from "../lib/lang";

interface PassengerPhoneProps {
  session: Doc<"sessions">;
  messages: Doc<"messages">[];
  fullscreen?: boolean;
}

function useClock() {
  const [time, setTime] = useState(() => formatNow());
  useEffect(() => {
    const id = setInterval(() => setTime(formatNow()), 30_000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function formatNow(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function PassengerPhone({ session, messages, fullscreen }: PassengerPhoneProps) {
  const connectPassenger = useMutation(api.sessions.connectPassenger);
  const recog = useGeminiRecorder();
  const synth = useGeminiSpeech();
  const playback = useChunkPlayback();
  const time = useClock();

  // The moment the passenger's page loads, give staff a language to speak
  // into right away instead of making them wait for the passenger's first
  // utterance — the browser's own locale is a reasonable first guess. Real
  // speech later still overrides this via the streaming pipeline's
  // detectedLang lock-in, so a wrong guess self-corrects as soon as they
  // actually talk.
  const hasConnectedRef = useRef(false);
  useEffect(() => {
    if (hasConnectedRef.current) return;
    hasConnectedRef.current = true;
    const guessLang = navigator.language.split("-")[0]?.toLowerCase();
    if (guessLang) void connectPassenger({ sessionId: session._id, guessLang });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lastStaffMessage = [...messages].reverse().find((m) => m.speaker === "staff");

  // The fallback timer below fires several seconds after it's scheduled, by
  // which point lastStaffMessage/session may have moved on (more translated
  // text streamed in, toLang locked in from real detection) — refs mirrored
  // on every render let its setTimeout callback read the current values
  // instead of the stale ones captured when the effect was set up.
  const lastStaffMessageRef = useRef(lastStaffMessage);
  lastStaffMessageRef.current = lastStaffMessage;
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const chunks = useQuery(
    api.messages.listAudioChunks,
    lastStaffMessage ? { messageId: lastStaffMessage._id } : "skip",
  );

  // Which staff message's audio has already been (auto-)played, whichever
  // of the two paths below got there first — so the slow fallback never
  // double-speaks something the streamed chunks already played, and vice
  // versa. Keyed by the message's immutable _id rather than its (now
  // incrementally-growing) translated text.
  const playedForMessageIdRef = useRef<string | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fallback: the streaming pipeline starts synthesizing audio chunks the
  // moment translated sentences are available, concurrently with delivery,
  // so the chunk-ingest effect below is the common path. This is the safety
  // net for when that's slow or fails — give it a few seconds before
  // falling back to a single on-demand TTS call for whatever text has
  // accumulated. Never on mount, since the session may already have a
  // translation from a prior exchange. Also resets the chunk-playback queue
  // for the new message.
  const hasMountedRef = useRef(false);
  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return;
    }
    playback.reset();
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    if (!lastStaffMessage) return;
    const messageId = lastStaffMessage._id;
    fallbackTimerRef.current = setTimeout(() => {
      if (playedForMessageIdRef.current === messageId) return; // the chunk path already played it
      const text = lastStaffMessageRef.current?.translated ?? "";
      if (!text.trim()) return; // nothing streamed in yet — leave it for the chunk path to handle
      playedForMessageIdRef.current = messageId;
      void synth.speak(text, sessionRef.current.toLang).catch((err) => console.error("speak failed:", err));
    }, 4000);
    return () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastStaffMessage?._id]);

  // Primary path: feed audio chunks into the playback queue as soon as
  // they're synthesized — no fresh TTS call needed. Never on mount,
  // mirroring the fallback effect above.
  const chunksHasMountedRef = useRef(false);
  useEffect(() => {
    if (!chunksHasMountedRef.current) {
      chunksHasMountedRef.current = true;
      return;
    }
    if (!chunks || chunks.length === 0 || !lastStaffMessage) return;
    if (playedForMessageIdRef.current === lastStaffMessage._id) return; // the fallback already spoke this one
    playedForMessageIdRef.current = lastStaffMessage._id;
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    playback.ingest(chunks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunks]);

  function replay() {
    if (chunks && chunks.length > 0) {
      playback.replay();
      return;
    }
    if (lastStaffMessage?.translated) {
      void synth.speak(lastStaffMessage.translated, session.toLang).catch((err) => console.error("speak failed:", err));
    }
  }

  function passengerMic() {
    if (recog.processing) return;
    if (recog.recording) {
      void recog.stop();
      return;
    }
    // Unlock audio playback here, on a real tap — the translation spoken
    // back later arrives from a Convex update with no user gesture at all,
    // which mobile browsers otherwise leave permanently silent. Both audio
    // elements (synth's on-demand TTS and playback's chunk queue) need their
    // own unlock since each owns a separate <audio> instance.
    synth.unlock();
    playback.unlock();
    void recog.start(session._id, "passenger", session.fromLang);
  }

  const speaking = synth.speaking || playback.speaking;

  const content = (
    <div
      onPointerDown={() => {
        synth.unlock();
        playback.unlock();
      }}
      className={`bg-gradient-to-br from-slate-50 via-white to-rose-50/50 overflow-hidden flex flex-col relative ${
        fullscreen ? "w-screen h-screen" : "w-full h-full rounded-[44px]"
      }`}
    >
      <div className="h-13 flex-none flex items-center justify-between px-7.5 relative">
        <span className="text-sm font-semibold text-zinc-950 tracking-tight">{time}</span>
        <div className="absolute left-1/2 top-2.75 -translate-x-1/2 w-27 h-7.5 bg-neutral-950 rounded-full" />
        <div className="flex items-center gap-1.5">
          <svg width="17" height="12" viewBox="0 0 17 12" fill="#0A0A0A">
            <rect x="0" y="7" width="3" height="5" rx="1"></rect>
            <rect x="4.5" y="4.5" width="3" height="7.5" rx="1"></rect>
            <rect x="9" y="2" width="3" height="10" rx="1"></rect>
            <rect x="13.5" y="0" width="3" height="12" rx="1" opacity=".3"></rect>
          </svg>
          <svg width="16" height="12" viewBox="0 0 16 12" fill="#0A0A0A">
            <path d="M8 2.5c2.1 0 4 .8 5.4 2.1l1.1-1.2A9.5 9.5 0 0 0 8 1 9.5 9.5 0 0 0 1.5 3.4l1.1 1.2A7.9 7.9 0 0 1 8 2.5zm0 3c1.2 0 2.3.5 3.1 1.2l1.1-1.2A6 6 0 0 0 8 4 6 6 0 0 0 3.8 5.5l1.1 1.2A4.4 4.4 0 0 1 8 5.5zm0 3c.5 0 1 .2 1.4.6L8 10.5 6.6 9.1c.4-.4.9-.6 1.4-.6z"></path>
          </svg>
          <svg width="26" height="13" viewBox="0 0 26 13" fill="none">
            <rect x="1" y="1" width="21" height="11" rx="3" stroke="#0A0A0A" strokeOpacity=".35"></rect>
            <rect x="3" y="3" width="16" height="7" rx="1.5" fill="#0A0A0A"></rect>
            <rect x="23.5" y="4" width="1.8" height="5" rx=".9" fill="#0A0A0A" fillOpacity=".4"></rect>
          </svg>
        </div>
      </div>

      <div className="flex-none flex justify-center pt-4.5">
        <div className="bg-gray-100 rounded-full px-3.75 py-2 text-[13px] font-semibold text-neutral-700 flex items-center gap-1.5">
          <span className="text-gray-500">Detected:</span>{" "}
          {session.toLang ? (
            <>
              {nameFor(session.toLang)} <span className="text-[15px]">{flagFor(session.toLang)}</span>
            </>
          ) : (
            "Detecting…"
          )}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center px-9 py-6 min-h-0 overflow-y-auto">
        {recog.recording ? (
          <div className="text-[17px] font-medium text-gray-500 text-center leading-relaxed">Recording…</div>
        ) : recog.processing ? (
          <div className="text-[17px] font-medium text-gray-500 text-center leading-relaxed">Translating…</div>
        ) : lastStaffMessage?.translated ? (
          <div className="flex flex-col items-center gap-3">
            <div
              className={`font-display font-semibold text-zinc-950 text-center leading-snug tracking-tight animate-[aeroRise_0.42s_ease_both] ${
                lastStaffMessage.translated.length > 120 ? "text-[20px]" : "text-[30px]"
              }`}
            >
              {lastStaffMessage.translated}
            </div>
            <button
              className="w-9 h-9 rounded-full bg-white shadow-sm flex items-center justify-center cursor-pointer transition-transform duration-150 active:scale-[0.93] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={replay}
              disabled={!synth.supported}
              title={synth.supported ? "Replay translation" : "Speech synthesis isn't supported in this browser"}
              aria-label="Replay translation"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={speaking ? "#E81932" : "#9CA3AF"} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5 6 9H3v6h3l5 4V5z"></path>
                <path d="M15.5 8.5a5 5 0 0 1 0 7"></path>
                <path d="M18.8 6a8.5 8.5 0 0 1 0 12"></path>
              </svg>
            </button>
          </div>
        ) : (
          <div className="text-[17px] font-medium text-gray-500 text-center leading-relaxed">Press the mic to speak</div>
        )}
      </div>

      <div className="flex-none flex items-center justify-center px-9 pb-9.5">
        <div className="relative w-20 h-20">
          {recog.recording && (
            <div className="absolute inset-0 border-2 border-aero-red/45 rounded-full animate-[aeroPing_1.4s_ease-out_infinite]" />
          )}
          <button
            className="absolute inset-0 w-20 h-20 border-none bg-gradient-to-br from-aero-red to-aero-red-pressed rounded-full flex items-center justify-center cursor-pointer transition-transform duration-150 active:scale-[0.92] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={passengerMic}
            disabled={!recog.supported || recog.processing}
            title={
              !recog.supported
                ? "Speech recognition isn't supported in this browser"
                : recog.recording
                  ? "Press to stop and send"
                  : "Press to respond"
            }
            aria-label={recog.recording ? "Press to stop and send" : "Press to respond"}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="#FFFFFF">
              <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path>
              <path d="M5 11a1 1 0 0 1 2 0 5 5 0 0 0 10 0 1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V21a1 1 0 1 1-2 0v-3.07A7 7 0 0 1 5 11z"></path>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );

  if (fullscreen) return content;

  return (
    <div className="flex-none w-104 h-209 bg-neutral-950 rounded-[56px] p-3 shadow-[0_2px_6px_rgba(0,0,0,0.18),0_24px_48px_-12px_rgba(0,0,0,0.4)] relative">
      {content}
    </div>
  );
}
