import { chromium } from "playwright";

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on("console", (msg) => { if (msg.type() === "error") errors.push(msg.text()); });
page.on("pageerror", (err) => errors.push(String(err)));

const start = Date.now();
await page.goto("https://chose-assuming-violin-slim.trycloudflare.com", { waitUntil: "networkidle", timeout: 20000 });
await page.waitForSelector("text=AeroTranslate", { timeout: 15000 });
const loadMs = Date.now() - start;
const shareLink = (await page.locator('[class*="shareLink"]').first().textContent())?.trim();

console.log("LOAD_TIME_MS:", loadMs);
console.log("SHARE_LINK:", shareLink);
console.log("ERRORS:", JSON.stringify(errors));

await browser.close();
