import { useParams } from "react-router-dom";
import { PassengerPhone } from "../components/PassengerPhone";
import { StatusScreen } from "../components/StatusScreen";
import { useSessionByCode } from "../lib/useSession";

export function PassengerPage() {
  const { code } = useParams<{ code: string }>();
  const { session, messages } = useSessionByCode(code);

  if (session === null) {
    return <StatusScreen title="Session not found" subtitle={`No session with code "${code}"`} />;
  }
  if (!session || !messages) {
    return <StatusScreen title="Connecting…" />;
  }

  return <PassengerPhone session={session} messages={messages} />;
}
