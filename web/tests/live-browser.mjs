import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
const root = fileURLToPath(new URL('../../', import.meta.url));
const dist = resolve(root, 'dist');
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = resolve(dist, path.slice('/preview/'.length) || 'index.html');
  if (!path.startsWith('/preview/') || !file.startsWith(dist + '/') || !existsSync(file)) { res.writeHead(404).end(); return; }
  res.writeHead(200, { 'Content-Type': { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2' }[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const executablePath = process.env.CHROMIUM_PATH ?? (existsSync('/opt/ms-playwright/chromium_headless_shell-1246/chrome-headless-shell-linux64/chrome-headless-shell') ? '/opt/ms-playwright/chromium_headless_shell-1246/chrome-headless-shell-linux64/chrome-headless-shell' : undefined);
const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
const report = { checkedAt: new Date().toISOString(), mocked: false, transactionsSent: 0, errors: [], requests: [] };
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('requestfailed', r => report.errors.push(`${r.url()}: ${r.failure()?.errorText}`));
  page.on('request', r => { if (r.method() === 'POST') report.requests.push({ url: r.url(), method: r.postDataJSON()?.method }); });
  await page.goto(`http://127.0.0.1:${server.address().port}/preview/`);
  await page.getByRole('button', { name: 'Refresh oracle data' }).waitFor();
  await page.waitForFunction(() => !document.querySelector('[aria-label="Refresh oracle data"]')?.disabled, { timeout: 55000 });
  report.state = await page.locator('main').innerText();
  report.fontLoaded = await page.evaluate(() => document.fonts.check('16px "DM Sans Variable"'));
  report.outcome = /Block [\d,]+/.test(report.state) ? 'live reads rendered' : 'read failure rendered';
  for (const label of ['1h', '6h', '24h']) {
    await page.getByRole('button', { name: label, exact: true }).click();
    report[label] = await page.locator('.chart-empty h3, #chart-title').textContent();
  }
  await page.getByRole('button', { name: '1h', exact: true }).click();
  await page.screenshot({ path: resolve(root, 'docs/frontend/live-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: resolve(root, 'docs/frontend/live-mobile.png'), fullPage: true });
  report.noHorizontalOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  if (report.requests.some(r => /send|sign|wallet/.test(r.method))) throw Error('Live validation attempted a wallet operation');
  console.log(JSON.stringify({ outcome: report.outcome, windows: [report['1h'], report['6h'], report['24h']], errors: report.errors, fontLoaded: report.fontLoaded }, null, 2));
} catch (e) { report.outcome = 'failed'; report.errors.push(e.message); process.exitCode = 1; }
finally { writeFileSync(resolve(root, 'docs/frontend/live-browser.json'), JSON.stringify(report, null, 2) + '\n'); await browser.close(); await new Promise(resolve => server.close(resolve)); }
