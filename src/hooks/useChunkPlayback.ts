import { useCallback, useRef, useState } from "react";
import { SILENT_WAV_DATA_URL } from "../lib/silentWav";

interface AudioChunk {
  index: number;
  url: string;
}

// Plays an ordered sequence of per-sentence audio chunks back-to-back as
// they arrive (see convex/gemini.ts synthesizeChunk), instead of waiting
// for one full clip the way useGeminiSpeech's speak()/speakFromUrl do.
// Chunks can arrive out of order (concurrent TTS calls racing each other),
// so playback always waits for the next *index* rather than just playing
// whatever shows up first.
export function useChunkPlayback() {
  const [speaking, setSpeaking] = useState(false);

  // Bumped by reset() whenever a new utterance starts, so a chunk that
  // arrives late for a superseded message can never play over a new one —
  // mirrors useGeminiSpeech's requestIdRef staleness pattern.
  const requestIdRef = useRef(0);
  const queueRef = useRef<Map<number, string>>(new Map());
  const nextIndexRef = useRef(0);
  const playingRef = useRef(false);

  const mainElRef = useRef<HTMLAudioElement | null>(null);
  const preloadElRef = useRef<HTMLAudioElement | null>(null);
  const unlockedRef = useRef(false);

  const supported = typeof window !== "undefined" && typeof Audio !== "undefined";

  function getMainEl(): HTMLAudioElement {
    if (!mainElRef.current) mainElRef.current = new Audio();
    return mainElRef.current;
  }

  // This hook owns its own <audio> element, separate from useGeminiSpeech's
  // — mobile browsers tie the "needs a real gesture-driven play()" autoplay
  // exemption to the specific element instance, not the page, so each one
  // needs its own unlock() call from a tap handler (see useGeminiSpeech.ts).
  const unlock = useCallback(() => {
    if (!supported || unlockedRef.current) return;
    unlockedRef.current = true;
    const el = getMainEl();
    el.src = SILENT_WAV_DATA_URL;
    void el.play().then(() => el.pause()).catch(() => {});
  }, [supported]);

  function getPreloadEl(): HTMLAudioElement {
    if (!preloadElRef.current) preloadElRef.current = new Audio();
    return preloadElRef.current;
  }

  // Warms the browser's HTTP cache for the next chunk via a throwaway
  // element, so by the time pump() advances to it, the main element's
  // el.play() starts with no network wait.
  function preloadNext() {
    const url = queueRef.current.get(nextIndexRef.current + 1);
    if (!url) return;
    const preloadEl = getPreloadEl();
    if (preloadEl.src !== url) {
      preloadEl.src = url;
      preloadEl.load();
    }
  }

  // A hoisted function declaration (not useCallback) so its onended handler
  // can recurse into the next chunk by name without a "used before
  // declared" self-reference.
  function pump(id: number) {
    if (!supported || id !== requestIdRef.current || playingRef.current) return;
    const url = queueRef.current.get(nextIndexRef.current);
    if (!url) return; // waiting for this index to arrive

    playingRef.current = true;
    const el = getMainEl();
    el.onended = () => {
      if (id !== requestIdRef.current) return;
      playingRef.current = false;
      nextIndexRef.current++;
      if (!queueRef.current.has(nextIndexRef.current)) setSpeaking(false);
      pump(id);
    };
    el.src = url;
    setSpeaking(true);
    el.play().catch((err) => {
      console.error("[useChunkPlayback] play() failed:", err);
      if (id !== requestIdRef.current) return; // superseded by a newer utterance
      playingRef.current = false;
      setSpeaking(false);
      // Deliberately leave nextIndexRef/queueRef untouched: once unlock() has
      // actually run, the next ingest() or a replay() tap resumes from this
      // same chunk instead of skipping it or staying stuck forever.
    });
    preloadNext();
  }

  // Merges newly-seen chunks (e.g. from a useQuery result) into the queue
  // and resumes playback if it was waiting on one of them.
  const ingest = useCallback((chunks: AudioChunk[]) => {
    const id = requestIdRef.current;
    for (const c of chunks) {
      if (!queueRef.current.has(c.index)) queueRef.current.set(c.index, c.url);
    }
    pump(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pump only reads/writes refs, identical behavior every render
  }, []);

  // Abandons the current queue and starts fresh for a new utterance.
  const reset = useCallback(() => {
    requestIdRef.current++;
    queueRef.current = new Map();
    nextIndexRef.current = 0;
    playingRef.current = false;
    setSpeaking(false);
  }, []);

  // Replays the full sequence from the start (e.g. a "replay" button).
  const replay = useCallback(() => {
    if (queueRef.current.size === 0) return;
    playingRef.current = false;
    nextIndexRef.current = 0;
    pump(requestIdRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pump only reads/writes refs, identical behavior every render
  }, []);

  return { supported, speaking, ingest, reset, replay, unlock };
}
