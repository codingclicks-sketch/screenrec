// Renders the live VeoRec app in headless Chrome and saves store screenshots.
// Uses the owner's session token (passed via SR_TOKEN) so authed pages load.
// Captured at 1280x800 CSS @2x density -> 2560x1600 raw, downscaled later.
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const TOKEN = process.env.SR_TOKEN
  || (fs.existsSync(path.join(__dirname, '_token.txt')) && fs.readFileSync(path.join(__dirname, '_token.txt'), 'utf8').trim());
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const OUT = path.join(__dirname, '_raw');
fs.mkdirSync(OUT, { recursive: true });

const shots = [
  { name: '1-library',   url: 'https://veorec.com/',         wait: 5000 },
  { name: '2-watch',     url: 'https://veorec.com/watch/3947ddab-e002-4233-955b-e8ce6826c5ac', wait: 5500, tab: 'Transcript' },
  { name: '3-pricing',   url: 'https://veorec.com/pricing',  wait: 4000 },
  { name: '4-analytics', url: 'https://veorec.com/analytics', wait: 4500 },
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--hide-scrollbars', '--disable-blink-features=AutomationControlled'],
    defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 2 },
  });
  const page = await browser.newPage();

  // Seed the auth token on the origin, then navigate to each target.
  await page.goto('https://veorec.com/', { waitUntil: 'domcontentloaded' }).catch(() => {});
  await page.evaluate((t) => localStorage.setItem('sr_token', t), TOKEN);

  for (const s of shots) {
    try {
      await page.goto(s.url, { waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {});
      await new Promise((r) => setTimeout(r, s.wait));
      if (s.tab) {
        // Click a sidebar tab by its visible text (best-effort).
        await page.evaluate((label) => {
          const el = [...document.querySelectorAll('button, [role="tab"]')]
            .find((b) => b.textContent && b.textContent.trim().toLowerCase().includes(label.toLowerCase()));
          if (el) el.click();
        }, s.tab).catch(() => {});
        await new Promise((r) => setTimeout(r, 1500));
      }
      await page.screenshot({ path: path.join(OUT, s.name + '.png') });
      console.log('captured', s.name);
    } catch (e) {
      console.log('FAILED', s.name, e.message);
    }
  }
  await browser.close();
  console.log('done');
})();
