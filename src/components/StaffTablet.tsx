import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { useGeminiRecorder } from "../hooks/useGeminiRecorder";
import { useGeminiSpeech } from "../hooks/useGeminiSpeech";
import { useChunkPlayback } from "../hooks/useChunkPlayback";
import { flagFor, LANGUAGE_OPTIONS, nameFor } from "../lib/lang";

function LangTag({ lang, className }: { lang: string; className: string }) {
  if (!lang) return null;
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wide mr-1.5 ${className}`}>
      {flagFor(lang)} {lang}
    </span>
  );
}

// Small inline play button attached to a single past message bubble in the
// conversation log, so any prior utterance can be replayed — not just the
// current turn's dedicated card above. Reuses the same synth/playback
// instances as the rest of the component: starting a replay here naturally
// supersedes (and is superseded by) whatever else those were doing, via
// their existing requestId-staleness handling.
function BubblePlayButton({
  active,
  disabled,
  onClick,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="w-4.5 h-4.5 rounded-full bg-white/70 hover:bg-white flex items-center justify-center cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      onClick={onClick}
      disabled={disabled}
      title={active ? "Stop" : "Play"}
      aria-label={active ? "Stop playback" : "Replay this message"}
    >
      {active ? (
        <svg width="7" height="7" viewBox="0 0 24 24" fill="#E81932">
          <rect x="4" y="4" width="16" height="16" rx="2"></rect>
        </svg>
      ) : (
        <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M11 5 6 9H3v6h3l5 4V5z"></path>
          <path d="M15.5 8.5a5 5 0 0 1 0 7"></path>
        </svg>
      )}
    </button>
  );
}

interface StaffTabletProps {
  session: Doc<"sessions">;
  messages: Doc<"messages">[];
  fullscreen?: boolean;
  onNewConversation?: () => void;
}

export function StaffTablet({ session, messages, fullscreen, onNewConversation }: StaffTabletProps) {
  const convex = useConvex();
  const chips = useQuery(api.chips.list);
  const sendInstant = useMutation(api.messages.sendInstant);
  const setFromLang = useMutation(api.sessions.setFromLang);
  const recog = useGeminiRecorder();
  const synth = useGeminiSpeech();
  const playback = useChunkPlayback();
  const logRef = useRef<HTMLDivElement>(null);

  // Which message's audio (if any) is currently playing, for highlighting
  // the right bubble's play button — cleared once both playback paths fall
  // silent, regardless of which one was driving it.
  const [playingMessageId, setPlayingMessageId] = useState<Id<"messages"> | null>(null);
  useEffect(() => {
    if (!synth.speaking && !playback.speaking) setPlayingMessageId(null);
  }, [synth.speaking, playback.speaking]);

  // Replays one specific message from the log on demand: fetches its audio
  // chunks fresh (a one-off query, not a standing subscription — the log can
  // be long and most messages are never replayed) and falls back to a
  // one-shot TTS call from its translated text if no chunks exist (e.g. a
  // canned chip message sent before chunked synthesis, or synthesis that
  // never completed).
  async function replayMessage(message: Doc<"messages">, lang: string) {
    if (playingMessageId === message._id) {
      synth.stop();
      playback.stop();
      return;
    }
    setPlayingMessageId(message._id);
    const chunks = await convex.query(api.messages.listAudioChunks, { messageId: message._id });
    if (chunks.length > 0) {
      playback.unlock();
      playback.reset();
      playback.ingest(chunks);
    } else if (message.translated.trim()) {
      synth.unlock();
      void synth.speak(message.translated, lang).catch((err) => console.error("speak failed:", err));
    } else {
      setPlayingMessageId(null);
    }
  }

  // useLayoutEffect (not useEffect) so the scroll position is corrected
  // before the browser paints — otherwise a slow-arriving message can
  // briefly flash the old scroll position (an older bubble's edge peeking
  // above the new ones) for one frame before it snaps to the bottom.
  useLayoutEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const lastPassengerMessage = [...messages].reverse().find((m) => m.speaker === "passenger");

  // The fallback timer below fires several seconds after it's scheduled, by
  // which point lastPassengerMessage/session may have moved on (more
  // translated text streamed in, fromLang changed) — refs mirrored on every
  // render let its setTimeout callback read the current values instead of
  // the stale ones captured when the effect was set up.
  const lastPassengerMessageRef = useRef(lastPassengerMessage);
  lastPassengerMessageRef.current = lastPassengerMessage;
  const sessionRef = useRef(session);
  sessionRef.current = session;

  const chunks = useQuery(
    api.messages.listAudioChunks,
    lastPassengerMessage ? { messageId: lastPassengerMessage._id } : "skip",
  );

  // Let staff hear the passenger's translated reply too — the mirror image
  // of PassengerPhone.tsx's auto-speak. Keyed off the passenger message's
  // own _id (a stable, unique key) rather than a mutable "current
  // translation" field, since staff's UI already derives from the message
  // list directly (lastPassengerMessage above) instead of a single session
  // field the way the passenger side does.
  // Two distinct refs, not one shared one: each path needs to check whether
  // the OTHER path already claimed this message, without being blocked by
  // its own prior writes — chunks legitimately arrive in several batches
  // (one per sentence) for the same message, so the chunk path must be free
  // to re-enter for message X after it already claimed message X once.
  const fallbackSpokeIdRef = useRef<string | null>(null);
  const chunkPathStartedIdRef = useRef<string | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fallback: the streaming pipeline starts synthesizing audio chunks the
  // moment a passenger message's translated sentences are available,
  // concurrently with delivery, so the chunk-ingest effect below is the
  // common path. This is the safety net for when that's slow or fails.
  // Never on mount, since the session may already have history from a
  // prior exchange/reconnect. Also resets the chunk-playback queue for the
  // new message.
  const fallbackHasMountedRef = useRef(false);
  useEffect(() => {
    if (!fallbackHasMountedRef.current) {
      fallbackHasMountedRef.current = true;
      return;
    }
    playback.reset();
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    if (!lastPassengerMessage) return;
    const messageId = lastPassengerMessage._id;
    fallbackTimerRef.current = setTimeout(() => {
      if (chunkPathStartedIdRef.current === messageId) return; // the chunk path already claimed it
      const text = lastPassengerMessageRef.current?.translated ?? "";
      if (!text.trim()) return; // nothing streamed in yet — leave it for the chunk path to handle
      fallbackSpokeIdRef.current = messageId;
      void synth.speak(text, sessionRef.current.fromLang).catch((err) => console.error("speak failed:", err));
    }, 4000);
    return () => {
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastPassengerMessage?._id]);

  // Primary path: feed audio chunks into the playback queue as soon as
  // they're synthesized — no fresh TTS call needed. Guarded by message id,
  // not a "first render" flag: `chunks` itself starts as `undefined` while
  // the query loads and only resolves to real data a moment after mount,
  // which is a SECOND distinct value for this effect's dependency even when
  // it's for the same old message that was already there before the page
  // loaded — a "skip just the first call" flag gets fooled by that and
  // auto-plays whatever the last message already was on every reload.
  // Comparing against the id snapshotted at mount instead correctly tells
  // "stale history" apart from "a new message arrived after I mounted." It
  // legitimately re-enters once per arriving batch of chunks (one per
  // streamed sentence) for a genuinely new message, so it must keep
  // ingesting on every call, not just the first.
  const initialMessageIdRef = useRef(lastPassengerMessage?._id);
  useEffect(() => {
    if (!chunks || chunks.length === 0 || !lastPassengerMessage) return;
    if (lastPassengerMessage._id === initialMessageIdRef.current) return; // already existed when this page loaded — don't auto-replay history
    if (fallbackSpokeIdRef.current === lastPassengerMessage._id) return; // the fallback already spoke this one
    chunkPathStartedIdRef.current = lastPassengerMessage._id;
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
    playback.ingest(chunks);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chunks]);

  // Toggle: if something's audibly playing, this tap means "stop it" rather
  // than "restart it" — there was previously no way to silence playback
  // once started short of leaving the page.
  function replayPassenger() {
    if (synth.speaking || playback.speaking) {
      synth.stop();
      playback.stop();
      return;
    }
    if (chunks && chunks.length > 0) {
      playback.replay();
      return;
    }
    if (lastPassengerMessage?.translated) {
      void synth.speak(lastPassengerMessage.translated, session.fromLang).catch((err) => console.error("speak failed:", err));
    }
  }

  // The "current turn" card is what staff actually needs to act on: while
  // they're recording/translating, a status label; otherwise the
  // passenger's last utterance plus its translation, not staff's own
  // previous line which they already know they said.
  const showingOwnTurn = recog.recording || recog.processing;
  const originalText = showingOwnTurn ? "" : lastPassengerMessage?.original ?? "";
  const staffWords = originalText ? originalText.split(" ") : [];
  const translation = showingOwnTurn ? "" : lastPassengerMessage?.translated ?? "";

  function micPress() {
    if (recog.processing || !session.toLang) return;
    if (recog.recording) {
      void recog.stop();
      return;
    }
    void recog.start(session._id, "staff", session.toLang);
  }

  function chipPress(tr: string, jp: string) {
    if (recog.recording || recog.processing) return;
    void sendInstant({ sessionId: session._id, speaker: "staff", original: tr, translated: jp });
  }

  return (
    <div
      onPointerDown={() => {
        synth.unlock();
        playback.unlock();
      }}
      className={`flex flex-col bg-gradient-to-br from-slate-50 via-white to-rose-50/50 ${fullscreen ? "w-screen h-screen" : "w-full h-full"}`}
    >
      <div className="flex-none flex items-center justify-between px-7 py-4 border-b border-gray-100 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="w-2.75 h-2.75 rounded-full bg-gradient-to-br from-aero-red to-aero-red-pressed" />
          <span className="font-display text-lg font-semibold text-zinc-950 tracking-tight">AeroTranslate</span>
        </div>
        <div className="flex items-center gap-3.5">
          <select
            className="bg-gray-100 border-none rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-zinc-900 cursor-pointer"
            value={session.fromLang}
            onChange={(e) => void setFromLang({ sessionId: session._id, fromLang: e.target.value })}
            title="Your language"
            aria-label="Your language"
          >
            {LANGUAGE_OPTIONS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.flag} {l.name}
              </option>
            ))}
          </select>
          <div className="bg-gray-100 rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-zinc-900">
            &rarr;&nbsp;&nbsp;{session.toLang ? nameFor(session.toLang) : "Detecting…"}
          </div>
          <div className="flex items-center gap-1.75">
            <div className="w-2 h-2 rounded-full bg-aero-green animate-[aeroLive_1.6s_ease-in-out_infinite]" />
            <span className="text-[13px] font-semibold text-aero-green">Live</span>
          </div>
          {onNewConversation && (
            <button
              className="bg-gray-100 hover:bg-gray-200 rounded-full px-3.5 py-1.5 text-[13px] font-semibold text-zinc-900 cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => {
                if (messages.length > 0 && !window.confirm("Start a new conversation? This abandons the current one.")) return;
                onNewConversation();
              }}
              disabled={recog.recording || recog.processing}
              title="Start a new conversation with a fresh QR code"
            >
              New conversation
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 flex gap-4 p-4">
        <div className="flex-1 min-w-0 bg-white rounded-3xl shadow-sm flex flex-col overflow-hidden">
          <div className="flex-none px-5 py-3 border-b border-gray-100 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-aero-red" />
            <span className="font-display text-xs font-semibold uppercase tracking-widest text-gray-500">
              Conversation
            </span>
          </div>
          <div ref={logRef} className="flex-1 min-h-0 overflow-y-auto px-6 py-5 flex flex-col gap-4">
            {messages.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-sm text-gray-500">
                No messages yet — press the mic to start the conversation.
              </div>
            ) : (
              messages.map((m) =>
                m.speaker === "staff" ? (
                  <div
                    key={m._id}
                    className="self-start max-w-[460px] bg-gray-100 rounded-tl-[4px] rounded-tr-2xl rounded-br-2xl rounded-bl-2xl px-4 py-3"
                  >
                    <div className="text-[15px] font-semibold text-zinc-900 leading-snug">
                      <LangTag lang={session.fromLang} className="text-gray-400" />
                      {m.original}
                    </div>
                    <div className="text-[13px] text-gray-500 leading-snug mt-1">
                      <LangTag lang={session.toLang} className="text-gray-400" />
                      {m.translated}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5">
                      <span className="text-[11px] text-gray-400">{m.time}</span>
                      {m.translated.trim() && (
                        <BubblePlayButton
                          active={playingMessageId === m._id}
                          disabled={!synth.supported}
                          onClick={() => void replayMessage(m, session.toLang)}
                        />
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    key={m._id}
                    className="self-end text-right max-w-[460px] bg-[#fbeaec] rounded-tr-[4px] rounded-tl-2xl rounded-br-2xl rounded-bl-2xl px-4 py-3"
                  >
                    <div className="text-[15px] font-semibold text-zinc-900 leading-snug">
                      <LangTag lang={session.toLang} className="text-[#b98a90]" />
                      {m.original}
                    </div>
                    <div className="text-[13px] leading-snug mt-1 text-[#8a5a61]">
                      <LangTag lang={session.fromLang} className="text-[#b98a90]" />
                      {m.translated}
                    </div>
                    <div className="flex items-center justify-end gap-1.5 mt-1.5">
                      {m.translated.trim() && (
                        <BubblePlayButton
                          active={playingMessageId === m._id}
                          disabled={!synth.supported}
                          onClick={() => void replayMessage(m, session.fromLang)}
                        />
                      )}
                      <span className="text-[11px] text-[#b98a90]">{m.time}</span>
                    </div>
                  </div>
                ),
              )
            )}
          </div>
        </div>

        <div className="w-96 flex-none flex flex-col gap-4">
          <div className="bg-white rounded-3xl shadow-sm flex flex-col items-center gap-6 px-6 py-7">
            <div className="relative w-24 h-24 flex-none">
              <div className="absolute -inset-2.25 border border-aero-red/16 rounded-full" />
              {recog.recording && (
                <div className="absolute inset-0 border-2 border-aero-red/55 rounded-full animate-[aeroPing_1.6s_ease-out_infinite]" />
              )}
              {recog.recording && (
                <div className="absolute inset-0 border-2 border-aero-red/55 rounded-full animate-[aeroPing_1.6s_ease-out_infinite] [animation-delay:0.8s]" />
              )}
              <button
                className="absolute inset-0 w-24 h-24 border-none rounded-full bg-gradient-to-br from-aero-red to-aero-red-pressed flex items-center justify-center cursor-pointer transition-transform duration-150 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={micPress}
                disabled={!recog.supported || !session.toLang || recog.processing}
                title={
                  !recog.supported
                    ? "Speech recognition isn't supported in this browser"
                    : !session.toLang
                      ? "Waiting for the passenger to open their phone"
                      : recog.recording
                        ? "Press to stop and send"
                        : "Press to speak"
                }
                aria-label={recog.recording ? "Press to stop and send" : "Press to speak"}
              >
                <svg width="36" height="36" viewBox="0 0 24 24" fill="#FFFFFF" aria-hidden="true">
                  <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                  <path d="M5 11a1 1 0 0 1 2 0 5 5 0 0 0 10 0 1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V21a1 1 0 1 1-2 0v-3.07A7 7 0 0 1 5 11z" />
                </svg>
              </button>
            </div>

            <div className="flex flex-col items-center gap-1.5 w-full">
              <LangTag lang={session.fromLang} className="text-gray-400" />
              <div className="h-14 overflow-hidden text-center w-full">
                {recog.recording ? (
                  <span className="text-lg leading-relaxed text-gray-500 font-normal">Recording…</span>
                ) : recog.processing ? (
                  <span className="text-lg leading-relaxed text-gray-500 font-normal">Translating…</span>
                ) : (
                  <span className="text-lg leading-relaxed text-gray-500 font-normal line-clamp-2">
                    {staffWords.join(" ")}
                  </span>
                )}
              </div>
            </div>

            <div className="w-15 h-px bg-gray-200" />

            <div className="flex flex-col items-center gap-1.5 w-full">
              {translation && (
                <div className="flex items-center gap-1.5">
                  <LangTag lang={session.toLang} className="text-gray-400" />
                  <button
                    className="w-5 h-5 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center cursor-pointer transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={replayPassenger}
                    disabled={!synth.supported}
                    title={!synth.supported ? "Speech synthesis isn't supported in this browser" : synth.speaking || playback.speaking ? "Stop" : "Replay"}
                    aria-label={synth.speaking || playback.speaking ? "Stop playback" : "Replay passenger's translated speech"}
                  >
                    {synth.speaking || playback.speaking ? (
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="#E81932">
                        <rect x="4" y="4" width="16" height="16" rx="2"></rect>
                      </svg>
                    ) : (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 5 6 9H3v6h3l5 4V5z"></path>
                        <path d="M15.5 8.5a5 5 0 0 1 0 7"></path>
                      </svg>
                    )}
                  </button>
                </div>
              )}
              <div className="h-16 overflow-hidden flex items-center justify-center w-full">
                {translation && (
                  <div className="font-display text-xl font-semibold text-zinc-950 text-center leading-snug tracking-tight line-clamp-2 animate-[aeroRise_0.42s_ease_both]">
                    {translation}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 bg-white rounded-3xl shadow-sm p-4 flex flex-col overflow-hidden">
            <div className="flex-none flex items-center gap-2 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-aero-red" />
              <span className="font-display text-xs font-semibold uppercase tracking-widest text-gray-500">
                Quick phrases
              </span>
            </div>
            <div className="flex-1 overflow-y-auto flex flex-col gap-2">
              {(chips ?? []).map((c) => (
                <button
                  key={c.label}
                  className="w-full text-left px-3.5 py-2.5 rounded-2xl bg-gray-50 hover:bg-gray-100 text-gray-600 text-sm font-medium transition-colors cursor-pointer"
                  onClick={() => chipPress(c.tr, c.jp)}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
