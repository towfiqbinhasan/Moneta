// Prints public/manual/index.html to public/manual/Moneta-User-Manual.pdf.
//   node scripts/manual/pdf.mjs        (run shots.mjs first to refresh the pictures)
import { statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const SRC = ROOT + 'public/manual/index.html';
const OUT = ROOT + 'public/manual/Moneta-User-Manual.pdf';
const CHROME = process.env.CHROME_PATH || '/usr/bin/google-chrome';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox', '--allow-file-access-from-files'] });
const page = await browser.newPage();
await page.goto(pathToFileURL(SRC).href, { waitUntil: 'networkidle0' });
await page.emulateMediaType('print');
await page.pdf({
  path: OUT,
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
  displayHeaderFooter: true,
  headerTemplate: '<span></span>',
  footerTemplate: `<div style="width:100%;font:8px system-ui,sans-serif;color:#8a90a8;padding:0 13mm;display:flex;justify-content:space-between">
    <span>Moneta User Manual · MD. Towfiq Bin Hasan · TH Team · towfiqbinhasan.com</span>
    <span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`,
  tagged: true,
  outline: true,
});
await browser.close();
console.log(`✓ ${OUT} (${(statSync(OUT).size / 1024 / 1024).toFixed(1)} MB)`);
