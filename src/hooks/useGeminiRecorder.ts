import { useCallback, useRef, useState } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const SAMPLE_RATE = 16000;

function floatTo16BitPCM(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function bufferToBase64(buf: ArrayBufferLike): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// Tap-to-start/tap-to-stop recording, replacing the old Live-streaming
// approach (see deleted useGeminiLive.ts): that one streamed audio over a
// WebSocket and guessed an utterance was done via a silence timer, since
// Gemini Live's own `finished`/`turnComplete` signals were unreliable for
// some languages. Recording a complete clip and sending it once removes
// that guesswork entirely — the user defines the utterance boundary by
// tapping again. The spoken language is always auto-detected from the
// audio (see convex/gemini.ts transcribeAndTranslate) rather than assumed,
// for both staff and passenger.
//
// The response side IS streamed, though: stop() creates a message row up
// front (messages.startMessage) and the transcribe/translate action writes
// partial transcript and per-sentence audio into it as it streams — the
// caller doesn't get a result back here, it just reactively subscribes to
// that message row and its audio chunks.
export function useGeminiRecorder() {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const startMessage = useMutation(api.messages.startMessage);
  const transcribeAndTranslate = useAction(api.gemini.transcribeAndTranslate);

  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Int16Array[]>([]);
  const sessionIdRef = useRef<Id<"sessions"> | null>(null);
  const speakerRef = useRef<"staff" | "passenger">("staff");
  const toLangRef = useRef("");

  const supported =
    typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof AudioContext !== "undefined";

  const teardownAudio = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const start = useCallback(
    async (sessionId: Id<"sessions">, speaker: "staff" | "passenger", toLang: string) => {
      if (!supported || recording || !toLang) return;
      sessionIdRef.current = sessionId;
      speakerRef.current = speaker;
      toLangRef.current = toLang;
      chunksRef.current = [];
      setRecording(true);

      // Explicit constraints rather than bare `audio: true` — browser/device
      // defaults for these vary, and consistent capture quality matters for
      // transcription accuracy, especially on harder audio (accents, noisy
      // gate environments).
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;
      const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE });
      audioContextRef.current = audioContext;
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;
      // ScriptProcessorNode only fires while connected to a destination; route
      // through a silent gain node so we don't echo the mic back out loud.
      const silentGain = audioContext.createGain();
      silentGain.gain.value = 0;
      processor.onaudioprocess = (e) => {
        chunksRef.current.push(floatTo16BitPCM(e.inputBuffer.getChannelData(0)));
      };
      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(audioContext.destination);
    },
    [supported, recording],
  );

  const stop = useCallback(async () => {
    if (!recording) return;
    teardownAudio();
    setRecording(false);

    const totalLen = chunksRef.current.reduce((n, c) => n + c.length, 0);
    const merged = new Int16Array(totalLen);
    let offset = 0;
    for (const chunk of chunksRef.current) {
      merged.set(chunk, offset);
      offset += chunk.length;
    }
    chunksRef.current = [];
    if (totalLen === 0 || !sessionIdRef.current) return;

    setProcessing(true);
    try {
      const { messageId } = await startMessage({
        sessionId: sessionIdRef.current,
        speaker: speakerRef.current,
      });
      await transcribeAndTranslate({
        messageId,
        audio: bufferToBase64(merged.buffer),
        sampleRate: SAMPLE_RATE,
        toLang: toLangRef.current,
      });
    } finally {
      setProcessing(false);
    }
  }, [recording, teardownAudio, startMessage, transcribeAndTranslate]);

  return { supported, recording, processing, start, stop };
}
