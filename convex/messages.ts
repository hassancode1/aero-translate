import { internalMutation, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";

export const list = query({
  args: { sessionId: v.id("sessions") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("messages")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("asc")
      .collect();
  },
});

export const listAudioChunks = query({
  args: { messageId: v.id("messages") },
  handler: async (ctx, args) => {
    // Chunks can finish synthesizing out of order (concurrent TTS calls
    // racing each other — by_message only indexes messageId, not index), so
    // sort explicitly rather than relying on insertion/creation-time order.
    const chunks = await ctx.db
      .query("audioChunks")
      .withIndex("by_message", (q) => q.eq("messageId", args.messageId))
      .collect();
    return chunks.sort((a, b) => a.index - b.index);
  },
});

function formatTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// Called by useGeminiRecorder.ts the instant recording stops, before any
// Gemini call is made — gives the client a row to subscribe to right away,
// and gives the streaming action in gemini.ts somewhere to write partial
// state as transcription/translation streams in.
export const startMessage = mutation({
  args: {
    sessionId: v.id("sessions"),
    speaker: v.union(v.literal("staff"), v.literal("passenger")),
  },
  handler: async (ctx, args) => {
    const messageId = await ctx.db.insert("messages", {
      sessionId: args.sessionId,
      speaker: args.speaker,
      original: "",
      translated: "",
      time: formatTime(),
      status: "pending",
    });
    return { messageId };
  },
});

// Used only for canned/quick phrases (StaffTablet.tsx's chipPress) where the
// original+translated text is already known up front — no recording, no
// streaming. Schedules a single-chunk synthesis so the result lands in the
// same audioChunks shape the playback hook expects regardless of source.
export const sendInstant = mutation({
  args: {
    sessionId: v.id("sessions"),
    speaker: v.union(v.literal("staff"), v.literal("passenger")),
    original: v.string(),
    translated: v.string(),
    detectedLang: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) throw new Error("Session not found");

    const messageId = await ctx.db.insert("messages", {
      sessionId: args.sessionId,
      speaker: args.speaker,
      original: args.original,
      translated: args.translated,
      time: formatTime(),
      status: "done",
      detectedLang: args.detectedLang,
    });

    if (args.speaker === "passenger" && args.detectedLang && !session.toLangConfirmed) {
      await ctx.db.patch(args.sessionId, { toLang: args.detectedLang, toLangConfirmed: true });
    }

    if (args.translated.trim()) {
      const lang = args.speaker === "staff" ? session.toLang : session.fromLang;
      await ctx.scheduler.runAfter(0, internal.gemini.synthesizeChunk, {
        messageId,
        index: 0,
        text: args.translated,
        lang,
      });
    }

    return { messageId };
  },
});

// Called repeatedly by the streaming action in gemini.ts as transcription
// and translation text streams in. translatedAppend is appended to the
// existing field rather than replacing it, since each sentence chunk lands
// via a separate call.
export const patchTranscript = internalMutation({
  args: {
    messageId: v.id("messages"),
    original: v.optional(v.string()),
    translatedAppend: v.optional(v.string()),
    detectedLang: v.optional(v.string()),
    status: v.optional(v.union(v.literal("streaming"), v.literal("done"), v.literal("error"))),
  },
  handler: async (ctx, args) => {
    const msg = await ctx.db.get(args.messageId);
    if (!msg) return;

    const patch: Record<string, unknown> = {};
    if (args.original !== undefined) patch.original = args.original;
    if (args.translatedAppend) patch.translated = msg.translated + args.translatedAppend;
    if (args.detectedLang !== undefined) patch.detectedLang = args.detectedLang;
    if (args.status !== undefined) patch.status = args.status;
    await ctx.db.patch(args.messageId, patch);

    // The first real detected utterance wins over a stale browser-locale
    // guess and locks in for the rest of the session — once toLangConfirmed
    // is true, later utterances (a one-off code-switch, a misdetection)
    // can no longer flip the whole conversation's target language. This
    // trades "no recovery from a wrong first detection" for "stable for the
    // rest of the conversation," which matters more in practice.
    if (args.detectedLang && msg.speaker === "passenger") {
      const session = await ctx.db.get(msg.sessionId);
      if (session && !session.toLangConfirmed) {
        await ctx.db.patch(msg.sessionId, { toLang: args.detectedLang, toLangConfirmed: true });
      }
    }
  },
});

// Called once per completed sentence chunk by gemini.synthesizeChunk (and
// once for the single chunk in sendInstant above).
export const appendAudioChunk = internalMutation({
  args: { messageId: v.id("messages"), index: v.number(), url: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("audioChunks", { messageId: args.messageId, index: args.index, url: args.url });
  },
});
