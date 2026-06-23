// Minimal WAV/RIFF header builder, shared by useGeminiSpeech (which wraps
// real PCM16 TTS output) and the silent unlock clip below (a zero-length
// clip used purely to satisfy mobile browsers' "needs a real gesture-driven
// play() on this exact element" autoplay rule).
export function buildWavHeader(dataLength: number): string {
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);
  const writeString = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataLength, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, 24000, true);
  view.setUint32(28, 24000 * 2, true); // byte rate (16-bit mono)
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeString(36, "data");
  view.setUint32(40, dataLength, true);
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return binary;
}

// A single silent frame, just enough for unlock() to get a real play() call
// in under the user gesture without making any sound.
export const SILENT_WAV_DATA_URL = "data:audio/wav;base64," + btoa(buildWavHeader(0));
