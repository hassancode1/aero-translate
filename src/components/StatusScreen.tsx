export function StatusScreen({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-rose-50/50">
      <div className="text-center text-zinc-950">
        <div className="font-display text-lg font-semibold mb-1.5 tracking-tight">{title}</div>
        {subtitle && <div className="text-sm text-gray-500">{subtitle}</div>}
      </div>
    </div>
  );
}
