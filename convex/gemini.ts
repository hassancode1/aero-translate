"use node";

import { action, internalAction, env, type ActionCtx } from "./_generated/server";
import { v } from "convex/values";
import { GoogleGenAI } from "@google/genai";
import { internal } from "./_generated/api";

// Batch transcription+translation: the caller records a complete utterance
// locally (tap-to-start/tap-to-stop, see src/hooks/useGeminiRecorder.ts)
// and sends the whole clip here in one shot, rather than streaming partial
// audio over a Live WebSocket and guessing when the utterance is done via a
// silence timer. The Live approach's per-chunk language tagging was also
// unreliable for some languages (e.g. Hausa never set it) and forcing a
// fixed "expected" source language onto it sometimes made transcription
// worse, not better — so this never takes a fromLang hint at all and always
// auto-detects the spoken language fresh from the audio.
//
// The RESPONSE, however, is streamed: rather than waiting for one whole JSON
// blob and then one whole TTS clip, the model's text streams in, and each
// completed sentence of the translation is synthesized and played as soon
// as it's available (see synthesizeChunk below) while later sentences are
// still being translated.
const TRANSCRIBE_MODEL = "gemini-3.1-flash-lite";
const TTS_MODEL = "gemini-3.1-flash-tts-preview";
const TTS_SAMPLE_RATE = 24000; // Gemini TTS output: mono, 16-bit PCM, 24kHz
// Gemini's prebuilt TTS voices are language-agnostic — the same voice
// speaks any supported language — so one consistent, professional-sounding
// pick is used everywhere rather than varying by language.
const TTS_VOICE = "Charon";

function client(): GoogleGenAI {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured. Run `npx convex env set GEMINI_API_KEY <key>`.");
  }
  return new GoogleGenAI({ apiKey });
}

// Headerless PCM passed as inlineData with an "audio/l16" mime type is
// silently NOT understood by generateContent — the model doesn't error, it
// just hallucinates plausible-sounding but unrelated text (confirmed by
// testing the same clip both ways). Wrapping the same bytes in a minimal
// WAV header and sending "audio/wav" instead makes it transcribe correctly,
// so the raw PCM16 the recorder hook sends is wrapped here before the call.
function pcm16ToWavBase64(pcmBase64: string, sampleRate: number): string {
  const pcm = Buffer.from(pcmBase64, "base64");
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // byte rate (16-bit mono)
  header.writeUInt16LE(2, 32); // block align
  header.writeUInt16LE(16, 34); // bits per sample
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]).toString("base64");
}

// Gemini returns BCP-47 tags like "ja-JP"; the app's schema only stores the
// short subtag ("ja") to match how languages are keyed elsewhere.
function shortLangCode(bcp47: string): string {
  return bcp47.split("-")[0]?.toLowerCase() ?? bcp47;
}

function systemInstruction(toLang: string): string {
  return (
    `You are transcribing speech from AeroTranslate, a live interpreter app used at an airport ` +
    `gate/check-in counter between airline staff and a passenger. Use that setting only as a tie` +
    `breaker between two SIMILAR-SOUNDING readings of the same unclear word in whatever language ` +
    `is actually being spoken — e.g. if an accented or mumbled word could plausibly be either an ` +
    `airline/travel term (boarding pass, gate, seat, baggage, flight, delay, layover, passport, ` +
    `visa, customs, connection, lounge, check-in, carry-on) or an equally-plausible unrelated word ` +
    `in that SAME language, prefer the airline/travel reading. This is a narrow disambiguation aid, ` +
    `not a content source: never let it change which language you detect, never substitute an ` +
    `English loanword for a word actually spoken in another language, and never produce a fluent ` +
    `English sentence (or any sentence) that isn't a faithful transcript of the actual audio. If ` +
    `the audio is too unclear to make out, transcribe your best literal guess in the language it ` +
    `was spoken in — do not fall back to a plausible-sounding airport sentence in English.\n` +
    `Automatically detect whichever language is being spoken in the audio — do not assume any ` +
    `particular language, and do not let how common a language is in your training data bias ` +
    `detection toward it. The speaker may be using any of: tr, ja, en, es, fr, de, it, pt, ar, zh, ` +
    `ko, ru, hi, ha — including lower-resource languages like Hausa (ha), which deserve the same ` +
    `transcription effort and care as higher-resource ones, not a lower-effort best-guess. Respond ` +
    `with EXACTLY this structure, in EXACTLY this order, and nothing else — no markdown, no ` +
    `commentary, no code fences:\n` +
    `<lang>ISO 639-1 code of the detected source language</lang>` +
    `<original>verbatim transcript in the source language</original>` +
    `<translated>translation into language code "${toLang}"</translated>\n` +
    `Do not emit any other angle-bracket tags. Output the three tags back to back, in that order, ` +
    `with no text before, between, or after them.`
  );
}

// Sentence-ending punctuation across scripts, so a translation with no
// Latin-style periods (e.g. some romanized or punctuation-light text) still
// gets split into playable chunks instead of waiting on one giant run.
const SENTENCE_TERMINATORS = [".", "!", "?", "。", "！", "？", "．", "؟", "۔", "।", "॥", "\n"];
// If no terminator shows up within this many UTF-16 units, force a cut at
// the nearest preceding whitespace so TTS never stalls indefinitely.
const MAX_CHUNK_LEN = 120;

type StreamEvent =
  | { type: "lang"; value: string }
  | { type: "original"; value: string }
  | { type: "sentence"; value: string };

function findFirstTerminator(s: string): number {
  let best = -1;
  for (const t of SENTENCE_TERMINATORS) {
    const idx = s.indexOf(t);
    if (idx !== -1 && (best === -1 || idx < best)) best = idx + t.length;
  }
  return best;
}

// Incremental parser for the tag format above, fed one text delta at a time
// as the Gemini stream produces it. Emits each field as soon as it's known
// (lang/original once their closing tag appears; translated incrementally,
// sentence by sentence) rather than waiting for the whole response.
function createStreamParser() {
  let buffer = "";
  let langEmitted = false;
  let originalEmitted = false;
  let translatedConsumed = 0; // chars of <translated>...'s content already flushed as sentences
  let sawAnyTag = false;

  function translatedContentSoFar(): string | null {
    const openIdx = buffer.indexOf("<translated>");
    if (openIdx === -1) return null;
    const start = openIdx + "<translated>".length;
    const closeIdx = buffer.indexOf("</translated>", start);
    return closeIdx === -1 ? buffer.slice(start) : buffer.slice(start, closeIdx);
  }

  function feed(delta: string): StreamEvent[] {
    if (!delta) return [];
    buffer += delta;
    const events: StreamEvent[] = [];

    if (!langEmitted) {
      const closeIdx = buffer.indexOf("</lang>");
      if (closeIdx !== -1) {
        const openIdx = buffer.indexOf("<lang>");
        if (openIdx !== -1) {
          sawAnyTag = true;
          const value = shortLangCode(buffer.slice(openIdx + "<lang>".length, closeIdx).trim());
          if (value) events.push({ type: "lang", value });
          langEmitted = true;
        }
      }
    }

    if (!originalEmitted) {
      const closeIdx = buffer.indexOf("</original>");
      if (closeIdx !== -1) {
        const openIdx = buffer.indexOf("<original>");
        if (openIdx !== -1) {
          sawAnyTag = true;
          const value = buffer.slice(openIdx + "<original>".length, closeIdx).trim();
          events.push({ type: "original", value });
          originalEmitted = true;
        }
      }
    }

    const translatedSoFar = translatedContentSoFar();
    if (translatedSoFar !== null) {
      sawAnyTag = true;
      let unconsumed = translatedSoFar.slice(translatedConsumed);
      for (;;) {
        const cut = findFirstTerminator(unconsumed);
        if (cut !== -1) {
          const sentence = unconsumed.slice(0, cut);
          if (sentence.trim()) events.push({ type: "sentence", value: sentence });
          translatedConsumed += cut;
          unconsumed = unconsumed.slice(cut);
          continue;
        }
        if (unconsumed.length > MAX_CHUNK_LEN) {
          let breakAt = unconsumed.lastIndexOf(" ", MAX_CHUNK_LEN);
          if (breakAt <= 0) breakAt = MAX_CHUNK_LEN;
          const sentence = unconsumed.slice(0, breakAt);
          if (sentence.trim()) events.push({ type: "sentence", value: sentence });
          translatedConsumed += breakAt;
          unconsumed = unconsumed.slice(breakAt);
          continue;
        }
        break;
      }
    }

    return events;
  }

  // Flushes any trailing unterminated sentence once the stream ends, and
  // falls back to a best-effort JSON parse of the whole buffer if the model
  // ignored the tag format entirely and nothing usable was parsed — keeps
  // today's behavior as a safety net rather than silently producing nothing.
  function finish(): StreamEvent[] {
    const events: StreamEvent[] = [];

    if (!sawAnyTag) {
      try {
        const parsed = JSON.parse(buffer) as { original?: string; translated?: string; detectedLang?: string };
        if (parsed.detectedLang) events.push({ type: "lang", value: shortLangCode(parsed.detectedLang) });
        if (parsed.original) events.push({ type: "original", value: parsed.original.trim() });
        if (parsed.translated?.trim()) events.push({ type: "sentence", value: parsed.translated.trim() });
      } catch {
        // Nothing usable came through at all — give up gracefully.
      }
      return events;
    }

    if (!originalEmitted) {
      const openIdx = buffer.indexOf("<original>");
      if (openIdx !== -1) {
        const value = buffer.slice(openIdx + "<original>".length).replace(/<translated>.*/s, "").trim();
        if (value) events.push({ type: "original", value });
      }
    }

    const translatedSoFar = translatedContentSoFar();
    if (translatedSoFar !== null) {
      const trailing = translatedSoFar.slice(translatedConsumed).trim();
      if (trailing) events.push({ type: "sentence", value: trailing });
    }

    return events;
  }

  return { feed, finish };
}

export const transcribeAndTranslate = action({
  args: {
    messageId: v.id("messages"),
    audio: v.string(), // base64 PCM16 mono, no header
    sampleRate: v.number(),
    toLang: v.string(), // translation target — unrelated to detection
  },
  handler: async (ctx, args) => {
    if (!args.audio) {
      await ctx.runMutation(internal.messages.patchTranscript, { messageId: args.messageId, status: "error" });
      return null;
    }
    const ai = client();
    const wav = pcm16ToWavBase64(args.audio, args.sampleRate);
    const parser = createStreamParser();
    let chunkIndex = 0;

    async function handleEvents(events: StreamEvent[]) {
      for (const ev of events) {
        if (ev.type === "lang") {
          await ctx.runMutation(internal.messages.patchTranscript, {
            messageId: args.messageId,
            detectedLang: ev.value,
            status: "streaming",
          });
        } else if (ev.type === "original") {
          await ctx.runMutation(internal.messages.patchTranscript, { messageId: args.messageId, original: ev.value });
        } else if (ev.type === "sentence") {
          await ctx.runMutation(internal.messages.patchTranscript, {
            messageId: args.messageId,
            translatedAppend: ev.value,
          });
          await ctx.scheduler.runAfter(0, internal.gemini.synthesizeChunk, {
            messageId: args.messageId,
            index: chunkIndex++,
            text: ev.value,
            lang: args.toLang,
          });
        }
      }
    }

    try {
      const stream = await ai.models.generateContentStream({
        model: TRANSCRIBE_MODEL,
        contents: [
          {
            parts: [
              { inlineData: { data: wav, mimeType: "audio/wav" } },
              { text: `Transcribe this spoken audio and translate it to language code "${args.toLang}".` },
            ],
          },
        ],
        config: {
          systemInstruction: systemInstruction(args.toLang),
          temperature: 0, // favor faithful/consistent transcription over creative variation
          // AUTOMATIC: spend more reasoning effort on harder audio (accents, lower-resource
          // languages, background noise) and less on easy/clear audio, rather than a fixed
          // budget that either wastes latency or shortchanges the hard cases either way.
          thinkingConfig: { thinkingBudget: -1 },
        },
      });

      for await (const chunk of stream) {
        await handleEvents(parser.feed(chunk.text ?? ""));
      }
      await handleEvents(parser.finish());
      await ctx.runMutation(internal.messages.patchTranscript, { messageId: args.messageId, status: "done" });
    } catch (err) {
      console.error("[transcribeAndTranslate] stream failed:", err);
      await ctx.runMutation(internal.messages.patchTranscript, { messageId: args.messageId, status: "error" });
    }
    return null;
  },
});

// Raw PCM, 24kHz, mono, 16-bit — shared by both the on-demand and the
// per-chunk synthesis paths below.
async function synthesizeRawPCM(ai: GoogleGenAI, text: string, lang: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: TTS_MODEL,
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        languageCode: lang,
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: TTS_VOICE },
        },
      },
    },
  });
  const data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  if (!data) throw new Error("Gemini TTS returned no audio");
  return data;
}

// One-shot text-to-speech: the on-demand fallback path, used when streamed
// chunk synthesis hasn't produced anything in time (see
// src/components/PassengerPhone.tsx / StaffTablet.tsx), or for ad-hoc replay.
export const synthesizeSpeech = action({
  args: { text: v.string(), lang: v.string() },
  handler: async (_ctx, args) => {
    if (!args.text.trim()) return { audio: "" };
    const data = await synthesizeRawPCM(client(), args.text, args.lang);
    return { audio: data };
  },
});

// Shared by both per-chunk synthesis below: synthesize, WAV-wrap, and
// store, returning a playable URL (or null if nothing came back).
async function synthesizeAndStore(ctx: ActionCtx, text: string, lang: string): Promise<string | null> {
  const data = await synthesizeRawPCM(client(), text, lang);
  const wavBase64 = pcm16ToWavBase64(data, TTS_SAMPLE_RATE);
  const blob = new Blob([Buffer.from(wavBase64, "base64")], { type: "audio/wav" });
  const storageId = await ctx.storage.store(blob);
  return await ctx.storage.getUrl(storageId);
}

// Scheduled (non-blocking) for each completed sentence chunk — both by the
// streaming parse loop in transcribeAndTranslate above and by
// messages.sendInstant's single-chunk canned-phrase path. Synthesizes just
// that one chunk and appends it to the message's ordered audioChunks list,
// so the client's playback queue can start playing chunk 0 while chunk 1's
// text is still being translated/synthesized.
export const synthesizeChunk = internalAction({
  args: { messageId: v.id("messages"), index: v.number(), text: v.string(), lang: v.string() },
  handler: async (ctx, args) => {
    if (!args.text.trim()) return;
    const url = await synthesizeAndStore(ctx, args.text, args.lang);
    if (!url) return;
    await ctx.runMutation(internal.messages.appendAudioChunk, {
      messageId: args.messageId,
      index: args.index,
      url,
    });
  },
});
