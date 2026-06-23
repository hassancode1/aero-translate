import { useEffect, useState } from "react";
import { useMutation } from "convex/react";
import { QRCodeSVG } from "qrcode.react";
import { api } from "../../convex/_generated/api";
import { StaffTablet } from "../components/StaffTablet";
import { StatusScreen } from "../components/StatusScreen";
import { useSessionByCode } from "../lib/useSession";

const STORAGE_KEY = "aerotranslate-demo-code";

export function Home() {
  const [code, setCode] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));
  const createSession = useMutation(api.sessions.create);

  useEffect(() => {
    if (code) return;
    let cancelled = false;
    void createSession({}).then((res) => {
      if (cancelled) return;
      localStorage.setItem(STORAGE_KEY, res.code);
      setCode(res.code);
    });
    return () => {
      cancelled = true;
    };
  }, [code, createSession]);

  const { session, messages } = useSessionByCode(code ?? undefined);

  // A cached code can point to a session that no longer exists (e.g. the
  // dev database was cleared) — recover by dropping the stale code so the
  // effect above creates a fresh one, instead of getting stuck on "Setting
  // up session…" forever. `session === null` means the query resolved and
  // found nothing; `undefined` still means "loading," so this only fires
  // once that distinction is known.
  useEffect(() => {
    if (code && session === null) {
      localStorage.removeItem(STORAGE_KEY);
      setCode(null);
    }
  }, [code, session]);

  if (!session || !messages) {
    return <StatusScreen title="Setting up session…" />;
  }

  const passengerUrl = `${window.location.origin}/passenger/${session.code}`;

  return (
    <div className="h-screen overflow-hidden flex flex-col bg-gray-50">
      <div className="flex-1 min-h-0">
        <StaffTablet session={session} messages={messages} />
      </div>
      <div className="flex-none mx-auto mt-8 mb-12 w-[min(1080px,calc(100vw-120px))] max-w-[calc(100%-64px)] bg-white shadow-sm rounded-3xl px-6.5 py-5.5 flex items-center justify-between gap-6">
        <div className="flex flex-col gap-1.5">
          <span className="font-display text-sm font-semibold text-zinc-950 tracking-tight">
            Session {session.code}
          </span>
          <span className="text-[13px] text-gray-500 max-w-110 leading-relaxed">
            Scan this code with a phone to open the passenger view and join this session live.
          </span>
          <a className="text-[13px] font-medium text-aero-red no-underline hover:underline break-all" href={passengerUrl}>
            {passengerUrl}
          </a>
        </div>
        <div className="flex-none bg-white shadow-sm rounded-2xl p-2 flex">
          <QRCodeSVG value={passengerUrl} size={96} />
        </div>
      </div>
    </div>
  );
}
