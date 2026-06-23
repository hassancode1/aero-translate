import { query } from "./_generated/server";

// Canned aviation phrases for the staff tablet's quick-reply chips. Each
// already carries its own translation, so pressing one never needs a
// translation API call.
const aviationChips: { label: string; tr: string; jp: string }[] = [
  { label: "Gate Change", tr: "Biniş kapınız B12 olarak değiştirildi.", jp: "搭乗ゲートがB12に変更されました。" },
  { label: "Boarding Pass", tr: "Lütfen biniş kartınızı gösterin.", jp: "搭乗券をご提示ください。" },
  { label: "Baggage Claim", tr: "Bagajınızı 5 numaralı bantan alabilirsiniz.", jp: "お荷物は5番のベルトでお受け取りいただけます。" },
  {
    label: "Connecting Flight",
    tr: "Bağlantı uçuşunuz kapı A20'den kalkacaktır.",
    jp: "乗り継ぎ便はA20ゲートから出発いたします。",
  },
];

export const list = query({
  args: {},
  handler: async () => aviationChips,
});
