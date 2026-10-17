// Renders img/icon.svg and img/icon-small.svg to img/{16,32,48,128}.png with headless Chrome
// (transparent background), using a throwaway profile under the given scratch folder.
//   node tools/render-icons.mjs <scratch-folder>
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, openPage } from '../tests/e2e/cdp.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = process.argv[2];
if (!scratch) { console.error('usage: node tools/render-icons.mjs <scratch-folder>'); process.exit(2); }

const big = readFileSync(join(root, 'img/icon.svg'), 'utf8');
const small = readFileSync(join(root, 'img/icon-small.svg'), 'utf8');
const b = await launch({ browser: 'chrome', profileRoot: scratch, headless: true, label: 'icons' });
try {
  const page = await openPage(b.cdp, 'about:blank');
  await page.send('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
  for (const px of [16, 32, 48, 128]) {
    const svg = px <= 32 ? small : big;
    const html = `<html><body style="margin:0;background:transparent">${svg.replace(/width="\d+" height="\d+"/, `width="${px}" height="${px}"`)}</body></html>`;
    await page.send('Page.navigate', { url: 'data:text/html;base64,' + Buffer.from(html).toString('base64') });
    await new Promise((r) => setTimeout(r, 300));
    const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: px, height: px, scale: 1 }, captureBeyondViewport: false });
    writeFileSync(join(root, `img/${px}.png`), Buffer.from(data, 'base64'));
    console.log('wrote', `img/${px}.png`);
  }
} finally {
  console.log('profile removed:', await b.close());
}
