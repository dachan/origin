/**
 * Records demo/demo.html via PNG frame capture (accurate sRGB colors)
 * and exports mp4 + gif. Run: npm run demo:video
 *
 * Uses a deterministic demo clock (__setDemoTime) so capture lag cannot
 * desync the script from the exported timeline.
 */
import { chromium } from "playwright";
import { fileURLToPath } from "url";
import path from "path";
import fs from "fs";
import { execFileSync } from "child_process";
import ffmpegPath from "ffmpeg-static";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const demoHtml = path.join(__dirname, "demo.html");
const outputDir = path.join(__dirname, "output");
const framesDir = path.join(outputDir, "frames");

const WIDTH = 1280;
const HEIGHT = 720;
const SCALE = 2;
const OUTPUT_WIDTH = WIDTH * SCALE;
const OUTPUT_HEIGHT = HEIGHT * SCALE;
const FPS = 30;
const FRAME_MS = 1000 / FPS;
const FALLBACK_DURATION_MS = 54000;
const TAIL_MS = 900;

function runFfmpeg(args) {
  execFileSync(ffmpegPath, args, { stdio: "inherit" });
}

function rmrf(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function padFrame(index) {
  return `frame_${String(index).padStart(5, "0")}.png`;
}

console.log("Launching browser for frame capture...");

rmrf(framesDir);
fs.mkdirSync(framesDir, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: [
    "--force-color-profile=srgb",
    "--disable-skia-runtime-opts",
    "--font-render-hinting=none",
  ],
});

const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: SCALE,
  colorScheme: "dark",
  reducedMotion: "no-preference",
});

const page = await context.newPage();
const demoUrl = `file:///${demoHtml.replace(/\\/g, "/")}?record=1`;

console.log(`Loading ${demoUrl}`);
await page.goto(demoUrl, { waitUntil: "load" });

// Warm layout before the first clocked frame.
await page.evaluate(() => window.__setDemoTime(0));
await page.waitForTimeout(50);

const declaredDuration = await page.evaluate(() => window.DEMO_DURATION_MS || null);
const recordMs = (declaredDuration || FALLBACK_DURATION_MS) + TAIL_MS;
const totalFrames = Math.ceil(recordMs / FRAME_MS);

console.log(
  `Capturing ${totalFrames} PNG frames at ${FPS}fps (${OUTPUT_WIDTH}x${OUTPUT_HEIGHT})...`
);

for (let i = 0; i < totalFrames; i++) {
  const demoMs = i * FRAME_MS;
  await page.evaluate((ms) => window.__setDemoTime(ms), demoMs);

  await page.screenshot({
    path: path.join(framesDir, padFrame(i)),
    type: "png",
    animations: "allow",
    caret: "initial",
  });

  if (i > 0 && i % 150 === 0) {
    console.log(`  ${i}/${totalFrames} frames...`);
  }
}

await context.close();
await browser.close();

const mp4Path = path.join(outputDir, "origin-demo.mp4");
const gifPath = path.join(__dirname, "demo.gif");
const posterPath = path.join(__dirname, "demo-poster.png");
const framePattern = path.join(framesDir, "frame_%05d.png");

console.log(`Encoding MP4 (${OUTPUT_WIDTH}x${OUTPUT_HEIGHT})...`);
runFfmpeg([
  "-y",
  "-framerate",
  String(FPS),
  "-i",
  framePattern,
  "-frames:v",
  String(totalFrames),
  "-vf",
  "scale=in_range=full:out_range=tv,format=yuv444p",
  "-c:v",
  "libx264",
  "-pix_fmt",
  "yuv444p",
  "-color_primaries",
  "bt709",
  "-color_trc",
  "bt709",
  "-colorspace",
  "bt709",
  "-color_range",
  "tv",
  "-crf",
  "15",
  "-preset",
  "slow",
  "-tune",
  "animation",
  "-movflags",
  "+faststart",
  mp4Path,
]);
console.log(`MP4 saved to: ${mp4Path}`);

console.log("Generating GIF for README...");
runFfmpeg([
  "-y",
  "-framerate",
  String(FPS),
  "-i",
  framePattern,
  "-frames:v",
  String(totalFrames),
  "-vf",
  `scale=in_range=full:out_range=full,fps=12,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=192:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`,
  "-loop",
  "0",
  gifPath,
]);
console.log(`GIF saved to: ${gifPath}`);

const posterFrame = Math.min(Math.floor((5000 / 1000) * FPS), totalFrames - 1);
fs.copyFileSync(path.join(framesDir, padFrame(posterFrame)), posterPath);
console.log(`Poster saved to: ${posterPath}`);

console.log("Cleaning up frame cache...");
rmrf(framesDir);

console.log("Done.");
