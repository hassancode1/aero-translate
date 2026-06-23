import { useCallback, useRef, useState } from "react";
import { useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import { buildWavHeader, SILENT_WAV_DATA_URL } from "../lib/silentWav";

// Wraps Gemini's raw PCM16 bytes (24kHz, mono, 16-bit — see convex/gemini.ts)
// in a minimal WAV/RIFF header so the browser can play it through a standard
// <audio> element — unlike the Web Audio API,
// <audio> playback respects the device's hardware mute switch on iOS.
function pcm16ToWavBlob(base64: string): Blob {
  const pcmBinary = atob(base64);
  const headerBinary = buildWavHeader(pcmBinary.length);
  const bytes = new Uint8Array(headerBinary.length + pcmBinary.length);
  for (let i = 0; i < headerBinary.length; i++) bytes[i] = headerBinary.charCodeAt(i);
  for (let i = 0; i < pcmBinary.length; i++) bytes[headerBinary.length + i] = pcmBinary.charCodeAt(i);
  return new Blob([bytes], { type: "audio/wav" });
}

export function useGeminiSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const synthesize = useAction(api.gemini.synthesizeSpeech);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const unlockedRef = useRef(false);
  // Bumped on every speak() call so an in-flight TTS fetch that's superseded
  // by a newer one can detect it's stale and skip playback instead of
  // playing an old translation after (or on top of) a fresher one.
  const requestIdRef = useRef(0);

  const supported = typeof window !== "undefined" && typeof Audio !== "undefined";

  function getAudioEl(): HTMLAudioElement {
    if (!audioElRef.current) audioElRef.current = new Audio();
    return audioElRef.current;
  }

  // Mobile browsers only allow audio to play without a user gesture once a
  // real, gesture-driven play() has already succeeded on that same element.
  // The translation that's spoken back arrives later over the network with
  // no gesture at all, so call this once from a tap handler (e.g. the mic
  // button) to unlock the shared <audio> element up front. This must reuse
  // the exact element speak() plays through later — the unlock is tied to
  // that element instance, not the page. It only needs to run once: callers
  // fire it on every tap (any tap on the screen, including taps that land
  // while a translation is actively playing), and re-priming on each one
  // would stomp on whatever's currently playing through the same element.
  const unlock = useCallback(() => {
    if (!supported || unlockedRef.current) return;
    unlockedRef.current = true;
    const el = getAudioEl();
    el.src = SILENT_WAV_DATA_URL;
    void el.play().then(() => el.pause()).catch(() => {});
  }, [supported]);

  const speak = useCallback(
    async (text: string, lang: string) => {
      if (!supported || !text) return;
      const id = ++requestIdRef.current;

      const { audio } = await synthesize({ text, lang });
      if (!audio) return;
      // A newer speak() call started while this fetch was in flight — drop
      // this stale response instead of playing an out-of-date translation.
      if (id !== requestIdRef.current) return;

      const blob = pcm16ToWavBlob(audio);
      const url = URL.createObjectURL(blob);
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = url;

      const el = getAudioEl();
      el.onended = () => setSpeaking(false);
      el.src = url;
      setSpeaking(true);
      await el.play();
    },
    [supported, synthesize],
  );

  // Plays audio that's already been synthesized and stored server-side (see
  // convex/gemini.ts's synthesizeAndAttach), instead of making a fresh TTS
  // call. Shares requestIdRef with speak() so whichever of "on-demand TTS
  // finished" or "pre-synthesized URL arrived" wins the race, the other is
  // dropped automatically — no separate staleness logic needed here.
  const speakFromUrl = useCallback(
    (url: string) => {
      if (!supported) return;
      requestIdRef.current++;

      const el = getAudioEl();
      el.onended = () => setSpeaking(false);
      el.src = url;
      setSpeaking(true);
      void el.play();
    },
    [supported],
  );

  // Silences whatever's audibly playing right now, for a "pause/stop"
  // control — bumping requestIdRef alone only stops a stale async response
  // from later starting playback, it doesn't pause an element already
  // making sound.
  const stop = useCallback(() => {
    requestIdRef.current++;
    setSpeaking(false);
    if (audioElRef.current) audioElRef.current.pause();
  }, []);

  return { supported, speaking, speak, speakFromUrl, unlock, stop };
}
