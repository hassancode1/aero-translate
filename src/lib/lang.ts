export const LANGUAGE_OPTIONS: { code: string; name: string; flag: string }[] = [
  { code: "tr", name: "Turkish", flag: "🇹🇷" },
  { code: "ja", name: "Japanese", flag: "🇯🇵" },
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "es", name: "Spanish", flag: "🇪🇸" },
  { code: "fr", name: "French", flag: "🇫🇷" },
  { code: "de", name: "German", flag: "🇩🇪" },
  { code: "it", name: "Italian", flag: "🇮🇹" },
  { code: "pt", name: "Portuguese", flag: "🇵🇹" },
  { code: "ar", name: "Arabic", flag: "🇸🇦" },
  { code: "zh", name: "Chinese", flag: "🇨🇳" },
  { code: "ko", name: "Korean", flag: "🇰🇷" },
  { code: "ru", name: "Russian", flag: "🇷🇺" },
  { code: "hi", name: "Hindi", flag: "🇮🇳" },
  { code: "ha", name: "Hausa", flag: "🇳🇬" },
];

const FLAGS: Record<string, string> = Object.fromEntries(LANGUAGE_OPTIONS.map((l) => [l.code, l.flag]));
const NAMES: Record<string, string> = Object.fromEntries(LANGUAGE_OPTIONS.map((l) => [l.code, l.name]));

export function flagFor(lang: string): string {
  return FLAGS[lang] ?? "";
}

export function nameFor(lang: string): string {
  return NAMES[lang] ?? lang.toUpperCase();
}
