/**
 * Records demo/demo.html to demo/origin-demo.webm using Playwright.
 * Run: node demo/record-demo.mjs
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demoHtml = path.join(__dirname, 'demo.html');
const outputDir = path.join(__dirname, 'output');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const WIDTH = 1280;
const HEIGHT = 720;
const DEMO_DURATION_MS = 48000;

console.log('Launching browser for demo recording...');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 1,
  recordVideo: {
    dir: outputDir,
    size: { width: WIDTH, height: HEIGHT },
  },
});

const page = await context.newPage();
const demoUrl = `file:///${demoHtml.replace(/\\/g, '/')}`;

console.log(`Loading ${demoUrl}`);
await page.goto(demoUrl, { waitUntil: 'load' });
await page.waitForTimeout(DEMO_DURATION_MS + 2000);

const video = page.video();
await context.close();
await browser.close();

if (video) {
  const videoPath = await video.path();
  const finalPath = path.join(outputDir, 'origin-demo.webm');
  fs.renameSync(videoPath, finalPath);
  console.log(`\nDemo video saved to: ${finalPath}`);
} else {
  console.error('No video was recorded.');
  process.exit(1);
}
