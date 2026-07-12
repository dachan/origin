/**
 * Records demo/demo.html via PNG frame capture (accurate sRGB colors)
 * and exports mp4 + gif. Run: npm run demo:video
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
const FPS = 25;
const FRAME_MS = 1000 / FPS;
const DEMO_DURATION_MS = 48000;
const RECORD_MS = DEMO_DURATION_MS + 2000;

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
  ],
});

const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: SCALE,
  colorScheme: "dark",
});

const page = await context.newPage();
const demoUrl = `file:///${demoHtml.replace(/\\/g, "/")}`;

console.log(`Loading ${demoUrl}`);
await page.goto(demoUrl, { waitUntil: "load" });

const totalFrames = Math.ceil(RECORD_MS / FRAME_MS);
console.log(
  `Capturing ${totalFrames} PNG frames at ${FPS}fps (${OUTPUT_WIDTH}x${OUTPUT_HEIGHT})...`
);

const startedAt = Date.now();
for (let i = 0; i < totalFrames; i++) {
  const targetTime = startedAt + i * FRAME_MS;
  const now = Date.now();
  if (now < targetTime) {
    await page.waitForTimeout(targetTime - now);
  }

  await page.screenshot({
    path: path.join(framesDir, padFrame(i)),
    type: "png",
    animations: "disabled",
  });

  if (i > 0 && i % 125 === 0) {
    console.log(`  ${i}/${totalFrames} frames...`);
  }
}

await context.close();
await browser.close();

const mp4Path = path.join(outputDir, "origin-demo.mp4");
const gifPath = path.join(__dirname, "demo.gif");
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
  // PNG frames are full-range sRGB; convert to limited-range YUV for correct
  // playback in QuickTime and other players (avoids washed blacks/colors).
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
  "17",
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
  `scale=in_range=full:out_range=full,fps=15,scale=${WIDTH}:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=256:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle`,
  "-loop",
  "0",
  gifPath,
]);
console.log(`GIF saved to: ${gifPath}`);

console.log("Cleaning up frame cache...");
rmrf(framesDir);

console.log("Done.");
