import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

export function useSessionByCode(code: string | undefined) {
  const session = useQuery(api.sessions.getByCode, code ? { code } : "skip");
  const messages = useQuery(api.messages.list, session ? { sessionId: session._id } : "skip");
  return { session, messages };
}
