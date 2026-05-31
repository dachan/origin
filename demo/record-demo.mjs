/**
 * Records demo/demo.html and exports webm, mp4, and gif for README embedding.
 * Run: npm run demo:video
 */
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { execFileSync } from 'child_process';
import ffmpegPath from 'ffmpeg-static';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demoHtml = path.join(__dirname, 'demo.html');
const outputDir = path.join(__dirname, 'output');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const WIDTH = 1280;
const HEIGHT = 720;
const DEMO_DURATION_MS = 48000;

function runFfmpeg(args) {
  execFileSync(ffmpegPath, args, { stdio: 'inherit' });
}

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

if (!video) {
  console.error('No video was recorded.');
  process.exit(1);
}

const webmPath = path.join(outputDir, 'origin-demo.webm');
fs.renameSync(await video.path(), webmPath);
console.log(`\nDemo video saved to: ${webmPath}`);

const mp4Path = path.join(outputDir, 'origin-demo.mp4');
const gifPath = path.join(__dirname, 'demo.gif');

console.log('Converting to MP4...');
runFfmpeg([
  '-y',
  '-i', webmPath,
  '-c:v', 'libx264',
  '-pix_fmt', 'yuv420p',
  '-crf', '28',
  '-preset', 'fast',
  mp4Path,
]);
console.log(`MP4 saved to: ${mp4Path}`);

console.log('Generating GIF for README...');
runFfmpeg([
  '-y',
  '-i', mp4Path,
  '-vf', 'fps=8,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=5',
  '-loop', '0',
  gifPath,
]);
console.log(`GIF saved to: ${gifPath}`);
