import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // One session = one staff device paired with one passenger device.
  // Both clients subscribe to the same row and see updates in real time.
  sessions: defineTable({
    code: v.string(), // short shareable code, e.g. "7K2QXR"
    fromLang: v.string(), // staff's spoken language, e.g. "tr"
    toLang: v.string(), // passenger's language, e.g. "ja"
    // True once toLang came from a real detected utterance rather than a
    // browser-locale guess — see convex/sessions.ts connectPassenger and
    // convex/messages.ts patchTranscript.
    toLangConfirmed: v.optional(v.boolean()),
  }).index("by_code", ["code"]),

  messages: defineTable({
    sessionId: v.id("sessions"),
    speaker: v.union(v.literal("staff"), v.literal("passenger")),
    original: v.string(), // empty until the stream fills it in
    translated: v.string(), // grows incrementally as sentence chunks stream in
    time: v.string(), // "HH:MM" display string, formatted at write time
    // Optional so pre-existing rows from before this field existed still
    // satisfy the schema — absent means "done" (the only status that
    // existed before streaming was introduced).
    status: v.optional(v.union(v.literal("pending"), v.literal("streaming"), v.literal("done"), v.literal("error"))),
    // Only meaningful for passenger messages — locks sessions.toLang once known.
    detectedLang: v.optional(v.string()),
  }).index("by_session", ["sessionId"]),

  // One row per synthesized sentence chunk, in playback order. Both the
  // streaming path (gemini.synthesizeChunk) and the instant/canned-phrase
  // path (messages.sendInstant) write into this table, so client playback
  // is uniform regardless of source. A child table rather than an array
  // field on `messages` since a long utterance can have many chunks.
  audioChunks: defineTable({
    messageId: v.id("messages"),
    index: v.number(),
    url: v.string(),
  }).index("by_message", ["messageId"]),
});
