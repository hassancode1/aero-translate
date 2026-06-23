import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

function randomCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I ambiguity
  let out = "";
  for (let i = 0; i < 6; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

export const create = mutation({
  args: {
    fromLang: v.optional(v.string()),
    toLang: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let code = randomCode();
    // Extremely unlikely to collide, but guard anyway.
    while (await ctx.db.query("sessions").withIndex("by_code", (q) => q.eq("code", code)).unique()) {
      code = randomCode();
    }
    const sessionId = await ctx.db.insert("sessions", {
      code,
      fromLang: args.fromLang ?? "tr",
      // Left empty until the passenger speaks — their language is detected
      // live from their speech rather than preset (see convex/messages.ts).
      toLang: args.toLang ?? "",
    });

    return { sessionId, code };
  },
});

export const setFromLang = mutation({
  args: { sessionId: v.id("sessions"), fromLang: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.sessionId, { fromLang: args.fromLang });
  },
});

// Called once when the passenger's page first loads, so staff don't have to
// wait for the passenger to actually speak before they can start talking —
// their browser's own locale is a reasonable first guess at their language.
// Only applied if the language hasn't been confirmed yet: a passenger
// reopening/refreshing the page after their language was already detected
// from real speech must not clobber that with a locale guess.
export const connectPassenger = mutation({
  args: { sessionId: v.id("sessions"), guessLang: v.string() },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (session && !session.toLangConfirmed) {
      await ctx.db.patch(args.sessionId, { toLang: args.guessLang });
    }
  },
});

export const getByCode = query({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("sessions")
      .withIndex("by_code", (q) => q.eq("code", args.code.toUpperCase()))
      .unique();
  },
});
