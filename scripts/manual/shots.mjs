// Takes the screenshots used in the user manual.
//   npm run build && node scripts/manual/shots.mjs
// Starts `vite preview`, walks through setup with demo data in a phone-sized
// Chrome window, and saves JPEGs to public/manual/img/.
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OUT = ROOT + 'public/manual/img/';
const PORT = 4317;
const BASE = `http://localhost:${PORT}`;
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';
mkdirSync(OUT, { recursive: true });

const server = spawn(process.execPath, [ROOT + 'node_modules/vite/bin/vite.js', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
const stop = () => { try { server.kill(); } catch { /* ignore */ } };
process.on('exit', stop);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(BASE)).ok) return; } catch { /* not up yet */ }
    await sleep(500);
  }
  throw new Error('vite preview did not start');
}

const browser = await (async () => {
  await waitForServer();
  return puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--lang=en-US'] });
})();
const page = await browser.newPage();
// Desktop Chrome UA (no "Android"), so the web "Get the Android app" banner stays hidden.
await page.setUserAgent('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36');
const phone = { width: 390, height: 844, deviceScaleFactor: 600 / 390, isMobile: true, hasTouch: true };
await page.setViewport(phone);
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }, { name: 'prefers-reduced-motion', value: 'reduce' }]);

const shot = async (name, opts = {}) => {
  await sleep(opts.wait ?? 700);
  await page.screenshot({ path: `${OUT}${name}.jpg`, type: 'jpeg', quality: 74, ...opts.shot });
  console.log('✓', name);
};
/** Click the first visible button/link whose text contains `text`. */
const click = async (text, sel = 'button, a, [role="switch"]') => {
  const ok = await page.evaluate((text, sel) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.textContent?.trim().includes(text) && e.getClientRects().length);
    if (el) { el.scrollIntoView({ block: 'center' }); el.click(); }
    return !!el;
  }, text, sel);
  if (!ok) throw new Error(`Nothing to click: "${text}"`);
  await sleep(450);
};
const go = async (path, hash) => {
  await page.goto(BASE + path, { waitUntil: 'networkidle0' });
  await sleep(900);
  if (hash) {
    await page.evaluate((h) => document.getElementById(h)?.scrollIntoView({ block: 'start' }), hash);
    await page.evaluate(() => window.scrollBy(0, -70));
  }
};
const top = () => page.evaluate(() => window.scrollTo(0, 0));

/* ---------------- First start / setup ---------------- */
await page.goto(BASE, { waitUntil: 'networkidle0' });
await sleep(3200); // splash
await shot('01-welcome');
await click('English');
await click('Continue');
await page.type('input', 'Bangladesh');
await sleep(300);
await click('Bangladesh');
await shot('02-country');
await click('Continue');
await shot('03-currency');
await click('Continue');
await page.type('input', 'Rahim');
await click('Load demo data', '[role="switch"]');
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await shot('04-start');
await click('Start using Moneta');
await sleep(2500);

/* ---------------- Main screens ---------------- */
await top();
await shot('05-home', { wait: 1500 });
await page.evaluate(() => window.scrollBy(0, 700));
await shot('06-home-more');
await top();

await page.click('button[aria-label="Add entry"]');
await sleep(800);
for (const k of '250') await page.keyboard.press(k);
await shot('07-add');
await page.keyboard.press('Escape');
await sleep(600);

await go('/transactions');
await shot('08-transactions');
await go('/reports');
await shot('09-reports', { wait: 1500 });
await go('/more');
await shot('10-more');
await go('/accounts');
await shot('11-accounts');
await go('/categories');
await shot('12-categories');
await go('/budgets');
await shot('13-budgets');
await go('/goals');
await shot('14-goals');
await go('/debts');
await shot('15-debts');
await go('/split');
await shot('16-split');
await go('/bills');
await shot('17-bills');
await go('/recurring');
await shot('18-recurring');
await go('/trips');
await shot('19-trips');
await go('/settings');
await shot('20-settings');
await go('/settings', 'appearance');
await shot('21-settings-look');
await go('/settings', 'security');
await shot('22-settings-lock');
await go('/settings', 'data');
await shot('23-settings-data');
await go('/settings', 'sync');
await shot('24-settings-sync');
await go('/auth');
await shot('25-signin', { wait: 1200 });

/* ---------------- Computer (wide screen) ---------------- */
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await go('/');
await shot('26-desktop', { wait: 1500 });

/* ---------------- Dark mode ---------------- */
await page.setViewport(phone);
await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'dark' }]);
await go('/settings', 'appearance');
await click('Dark').catch(() => {});
await go('/');
await shot('27-dark', { wait: 1200 });

await browser.close();
stop();
process.exit(0);
