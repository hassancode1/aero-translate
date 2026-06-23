import { useParams } from "react-router-dom";
import { StaffTablet } from "../components/StaffTablet";
import { StatusScreen } from "../components/StatusScreen";
import { useSessionByCode } from "../lib/useSession";

export function StaffPage() {
  const { code } = useParams<{ code: string }>();
  const { session, messages } = useSessionByCode(code);

  if (session === null) {
    return <StatusScreen title="Session not found" subtitle={`No session with code "${code}"`} />;
  }
  if (!session || !messages) {
    return <StatusScreen title="Connecting…" />;
  }

  return <StaffTablet session={session} messages={messages} fullscreen />;
}
