import { Link } from "react-router-dom";
import { LANGUAGE_OPTIONS } from "../lib/lang";

const TICKER_PAIRS = LANGUAGE_OPTIONS.map((lang, i) => {
  const other = LANGUAGE_OPTIONS[(i + 5) % LANGUAGE_OPTIONS.length];
  return `${lang.flag} ${lang.name} ⇄ ${other.flag} ${other.name}`;
});

const STEPS = [
  {
    step: "01",
    title: "Staff speaks naturally",
    body: "Tap once, talk like normal — no scripts, no menus, no waiting for a translator to be free.",
    icon: (
      <>
        <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
        <path d="M5 11a1 1 0 0 1 2 0 5 5 0 0 0 10 0 1 1 0 1 1 2 0 7 7 0 0 1-6 6.93V21a1 1 0 1 1-2 0v-3.07A7 7 0 0 1 5 11z" />
      </>
    ),
  },
  {
    step: "02",
    title: "Translated instantly — shown and spoken",
    body: "The passenger sees the translation on their phone and hears it spoken aloud in their own language, seconds later.",
    icon: (
      <>
        <path d="M4 7h10M4 7l3-3M4 7l3 3M20 17H10M20 17l-3-3M20 17l-3 3" />
      </>
    ),
  },
  {
    step: "03",
    title: "Passenger replies the same way",
    body: "They tap their mic and answer back — translated into staff's language, read aloud right there on the tablet.",
    icon: (
      <>
        <path d="M11 5 6 9H3v6h3l5 4V5z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18.8 6a8.5 8.5 0 0 1 0 12" />
      </>
    ),
  },
];

function GroundStripe() {
  return (
    <div
      className="h-1.5 w-full flex-none"
      style={{
        backgroundImage: "repeating-linear-gradient(135deg, #e81932 0 14px, #fbeaec 14px 28px)",
      }}
    />
  );
}

export function Landing() {
  return (
    <div className="w-full min-h-screen bg-white">
      {/* Ticker */}
      <div className="bg-zinc-950 overflow-hidden h-9 flex items-center flex-none relative z-10">
        <div
          className="flex items-center gap-10 whitespace-nowrap font-mono text-[11px] tracking-wider uppercase text-zinc-400 animate-[aeroMarquee_38s_linear_infinite]"
          style={{ willChange: "transform" }}
        >
          {[...TICKER_PAIRS, ...TICKER_PAIRS].map((pair, i) => (
            <span key={i} className="flex items-center gap-10">
              <span className="w-1.5 h-1.5 rounded-full bg-aero-green animate-[aeroLive_1.6s_ease-in-out_infinite]" />
              {pair}
            </span>
          ))}
        </div>
      </div>

      {/* Nav */}
      <header className="absolute top-9 left-0 right-0 z-20 flex items-center justify-between px-7 sm:px-10 py-6">
        <div className="flex items-center gap-2.5">
          <div className="w-2.75 h-2.75 rounded-full bg-gradient-to-br from-aero-red to-aero-red-pressed" />
          <span className="font-display text-lg font-semibold text-white tracking-tight">AeroTranslate</span>
        </div>
        <div className="flex items-center gap-3">
          <Link
            to="/pitchdeck"
            className="font-display text-[13px] font-semibold text-zinc-300 hover:text-white transition-colors"
          >
            Pitch deck
          </Link>
          <Link
            to="/demo"
            className="font-display text-[13px] font-semibold text-white border border-white/25 hover:border-white/50 rounded-full px-4.5 py-2 transition-colors"
          >
            Try the demo
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative bg-zinc-950 overflow-hidden pt-32 sm:pt-36 pb-28 sm:pb-36 px-7 sm:px-10">
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,0.06) 1px, transparent 1px)",
            backgroundSize: "26px 26px",
          }}
        />
        <div
          className="absolute -top-40 right-[-10%] w-[640px] h-[640px] rounded-full opacity-[0.18] animate-[aeroRadar_18s_linear_infinite]"
          style={{
            background:
              "conic-gradient(from 0deg, transparent 0deg, #e81932 8deg, transparent 40deg, transparent 360deg)",
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-zinc-950" />

        <div className="relative max-w-6xl mx-auto grid lg:grid-cols-[1.05fr_0.95fr] gap-16 items-center">
          <div className="animate-[aeroRise_0.6s_ease_both]">
            <div className="inline-flex items-center gap-2 rounded-full border border-aero-red/40 bg-aero-red/10 px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-widest text-rose-300 mb-7">
              For ground &amp; cabin crews
            </div>
            <h1 className="font-display text-[40px] sm:text-[54px] leading-[1.05] font-semibold text-white tracking-tight mb-6">
              Say it once.
              <br />
              They hear it in <span className="text-aero-red">their</span> language.
            </h1>
            <p className="text-[17px] leading-relaxed text-zinc-400 max-w-md mb-9">
              AeroTranslate listens to staff and passengers in real time, translates what's said, and speaks the
              reply back out loud — no shared language required, no app for the passenger to install.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <Link
                to="/demo"
                className="font-display text-[15px] font-semibold text-white bg-gradient-to-br from-aero-red to-aero-red-pressed rounded-full px-7 py-3.5 shadow-[0_8px_24px_-8px_rgba(232,25,50,0.6)] transition-transform active:scale-[0.97] hover:scale-[1.02]"
              >
                Try the demo →
              </Link>
              <a
                href="#how-it-works"
                className="font-display text-[15px] font-semibold text-zinc-300 hover:text-white px-2 py-3.5 transition-colors"
              >
                See how it works
              </a>
            </div>
          </div>

          {/* Illustrative device mockup — hardcoded sample content, no live data */}
          <div className="relative h-[360px] sm:h-[420px] animate-[aeroRise_0.7s_ease_0.1s_both]">
            <svg
              className="absolute left-[18%] top-[44%] w-[64%] h-[90px] hidden sm:block"
              viewBox="0 0 220 90"
              fill="none"
            >
              <path
                d="M5 70 C 60 70, 70 10, 215 12"
                stroke="#e81932"
                strokeOpacity="0.55"
                strokeWidth="1.5"
                strokeDasharray="5 6"
                strokeDashoffset="240"
                className="animate-[aeroDash_2.4s_ease-out_0.4s_forwards]"
              />
            </svg>

            <div className="absolute left-0 top-2 w-[230px] sm:w-[250px] bg-white rounded-3xl shadow-[0_24px_60px_-12px_rgba(0,0,0,0.5)] p-4 rotate-[-3deg]">
              <div className="flex items-center gap-1.75 mb-3">
                <div className="w-1.75 h-1.75 rounded-full bg-aero-green animate-[aeroLive_1.6s_ease-in-out_infinite]" />
                <span className="text-[11px] font-semibold text-aero-green tracking-wide">LIVE</span>
                <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-gray-400">🇹🇷 TR</span>
              </div>
              <div className="bg-gray-100 rounded-tl-[4px] rounded-tr-2xl rounded-br-2xl rounded-bl-2xl px-3.5 py-2.5">
                <div className="text-[13px] font-semibold text-zinc-900 leading-snug">
                  Bagajınızı 5 numaralı bantan alabilirsiniz.
                </div>
                <div className="text-[11px] text-gray-500 leading-snug mt-1">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mr-1">🇯🇵 JA</span>
                  お荷物は5番のベルトでお受け取りいただけます。
                </div>
              </div>
            </div>

            <div className="absolute right-0 bottom-2 w-[230px] sm:w-[250px] bg-white rounded-3xl shadow-[0_24px_60px_-12px_rgba(0,0,0,0.5)] p-4 rotate-[2.5deg]">
              <div className="flex items-center gap-1.5 mb-3 justify-end">
                <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400">🇯🇵 JA</span>
                <div className="w-1.75 h-1.75 rounded-full bg-aero-red animate-[aeroLive_1.6s_ease-in-out_infinite]" />
              </div>
              <div className="bg-[#fbeaec] rounded-tr-[4px] rounded-tl-2xl rounded-br-2xl rounded-bl-2xl px-3.5 py-2.5 text-right">
                <div className="text-[13px] font-semibold text-zinc-900 leading-snug">ありがとうございます！</div>
                <div className="text-[11px] text-[#8a5a61] leading-snug mt-1">
                  Thank you so much!
                  <span className="text-[10px] font-bold uppercase tracking-wide text-[#b98a90] ml-1">🇬🇧 EN</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <GroundStripe />

      {/* How it works */}
      <section id="how-it-works" className="bg-white py-24 sm:py-28 px-7 sm:px-10">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <span className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-aero-red">
              How it works
            </span>
            <h2 className="font-display text-[30px] sm:text-[38px] font-semibold text-zinc-950 tracking-tight mt-3">
              Three steps. Zero shared language.
            </h2>
          </div>
          <div className="grid sm:grid-cols-3 gap-6 relative">
            <div className="hidden sm:block absolute top-9 left-[16%] right-[16%] border-t border-dashed border-gray-200" />
            {STEPS.map((s) => (
              <div
                key={s.step}
                className="relative bg-white rounded-3xl shadow-sm border border-gray-100 px-7 py-8 flex flex-col gap-4"
              >
                <div className="flex items-center justify-between">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-aero-red to-aero-red-pressed flex items-center justify-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      {s.icon}
                    </svg>
                  </div>
                  <span className="font-mono text-[12px] text-gray-300 tracking-wider">{s.step}</span>
                </div>
                <h3 className="font-display text-[17px] font-semibold text-zinc-950 tracking-tight">{s.title}</h3>
                <p className="text-[14px] leading-relaxed text-gray-500">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Languages */}
      <section className="bg-gray-50 py-24 sm:py-28 px-7 sm:px-10">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <span className="font-display text-xs font-semibold uppercase tracking-[0.2em] text-aero-red">
              Departures
            </span>
            <h2 className="font-display text-[30px] sm:text-[38px] font-semibold text-zinc-950 tracking-tight mt-3">
              14 languages, one conversation
            </h2>
          </div>
          <div className="bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
              {LANGUAGE_OPTIONS.map((lang, i) => (
                <div
                  key={lang.code}
                  className="flex items-center gap-2.5 px-5 py-4 border-b border-gray-100 [&:nth-child(2n)]:border-l sm:[&:nth-child(3n)]:border-l lg:[&:nth-child(4n)]:border-l border-gray-100 animate-[aeroRise_0.5s_ease_both]"
                  style={{ animationDelay: `${i * 35}ms` }}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-aero-green flex-none" />
                  <span className="text-base flex-none">{lang.flag}</span>
                  <span className="text-[13px] font-semibold text-zinc-800">{lang.name}</span>
                  <span className="font-mono text-[10px] text-gray-300 uppercase ml-auto">{lang.code}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="bg-gradient-to-br from-aero-red to-aero-red-pressed py-24 sm:py-28 px-7 sm:px-10 text-center relative overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage: "radial-gradient(#fff 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        />
        <div className="relative max-w-2xl mx-auto">
          <h2 className="font-display text-[32px] sm:text-[42px] font-semibold text-white tracking-tight mb-5">
            Ready to see it work?
          </h2>
          <p className="text-[16px] text-rose-100 mb-9 leading-relaxed">
            No installation. No account. Scan a code, speak, and hear it translated back in seconds.
          </p>
          <Link
            to="/demo"
            className="inline-block font-display text-[15px] font-semibold text-aero-red bg-white rounded-full px-7 py-3.5 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.3)] transition-transform active:scale-[0.97] hover:scale-[1.02]"
          >
            Try the demo →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white py-10 px-7 sm:px-10 flex items-center justify-center gap-2.5">
        <div className="w-2 h-2 rounded-full bg-gradient-to-br from-aero-red to-aero-red-pressed" />
        <span className="font-display text-sm font-semibold text-zinc-950 tracking-tight">AeroTranslate</span>
        <span className="text-[13px] text-gray-400">— built for ground &amp; cabin crews</span>
      </footer>
    </div>
  );
}
