#!/usr/bin/env node
// Generates a 1024x1024 PNG icon for Origin using pure Node.js (no dependencies)
// Uses a simple terminal-prompt-inspired design: "> _" on a dark gradient background

const { createCanvas } = (() => {
  // Try to use canvas if available, otherwise fall back to SVG → sips pipeline
  try {
    return require('canvas');
  } catch {
    return { createCanvas: null };
  }
})();

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const size = 1024;
const outDir = path.join(__dirname, '..', 'assets');

// Generate SVG icon
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a1b26"/>
      <stop offset="100%" stop-color="#24283b"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#7aa2f7"/>
      <stop offset="100%" stop-color="#bb9af7"/>
    </linearGradient>
  </defs>
  <!-- Background rounded rect -->
  <rect width="${size}" height="${size}" rx="220" ry="220" fill="url(#bg)"/>
  <!-- Border glow -->
  <rect x="8" y="8" width="${size - 16}" height="${size - 16}" rx="212" ry="212" fill="none" stroke="#33467c" stroke-width="4"/>
  <!-- Terminal prompt: >_ -->
  <text x="220" y="640" font-family="SF Mono, Menlo, Monaco, monospace" font-size="480" font-weight="bold" fill="url(#accent)">&gt;_</text>
</svg>`;

fs.writeFileSync(path.join(outDir, 'icon.svg'), svg);
console.log('Created assets/icon.svg');

// Convert SVG to PNG using sips (macOS)
const svgPath = path.join(outDir, 'icon.svg');
const pngPath = path.join(outDir, 'icon.png');

// Use built-in macOS tools: first create a simple PNG with the SVG
// sips can't convert SVG, so we'll use a different approach with qlmanage or just ship the SVG
// For Electron Forge on macOS, we need a .icns file

// Create iconset directory
const iconsetDir = path.join(outDir, 'icon.iconset');
if (!fs.existsSync(iconsetDir)) fs.mkdirSync(iconsetDir, { recursive: true });

// We need a base PNG. Let's create one using the `convert` approach with a basic bitmap
// Since we don't have ImageMagick, let's create a minimal PNG using Node's built-in capabilities

// Create a simple PNG file header + IHDR + IDAT with solid background and text
// Actually, let's use a simpler approach: write an HTML file, use Electron to screenshot,
// or just use the SVG directly for now and create PNGs with sips from a TIFF

// Simplest approach: create colored PNG using sips from a raw bitmap
// We'll create PPM (Portable Pixmap) format which sips can read

function createPPM(w, h) {
  const header = `P6\n${w} ${h}\n255\n`;
  const pixels = Buffer.alloc(w * h * 3);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 3;
      // Gradient from #1a1b26 to #24283b
      const t = (x + y) / (w + h);
      pixels[idx] = Math.round(0x1a + t * (0x24 - 0x1a));     // R
      pixels[idx + 1] = Math.round(0x1b + t * (0x28 - 0x1b)); // G
      pixels[idx + 2] = Math.round(0x26 + t * (0x3b - 0x26)); // B

      // Draw ">_" text area (rough block rendering)
      const cx = x / w;
      const cy = y / h;

      // ">" chevron: roughly at x: 0.20-0.38, y: 0.40-0.68
      if (cy >= 0.40 && cy <= 0.68 && cx >= 0.20 && cx <= 0.40) {
        const chevMid = 0.54; // vertical middle
        const yRel = cy - 0.40;
        const halfH = 0.14;
        let expectedX;
        if (cy < chevMid) {
          // top half: line goes from left to right
          expectedX = 0.20 + (yRel / halfH) * 0.18;
        } else {
          // bottom half: line goes from right to left
          expectedX = 0.20 + ((0.28 - yRel) / halfH) * 0.18;
        }
        if (Math.abs(cx - expectedX) < 0.035) {
          // Gradient accent color: #7aa2f7 to #bb9af7
          const gt = (cx - 0.20) / 0.50;
          pixels[idx] = Math.round(0x7a + gt * (0xbb - 0x7a));
          pixels[idx + 1] = Math.round(0xa2 + gt * (0x9a - 0xa2));
          pixels[idx + 2] = 0xf7;
        }
      }

      // "_" underscore: roughly at x: 0.44-0.66, y: 0.60-0.68
      if (cy >= 0.61 && cy <= 0.68 && cx >= 0.44 && cx <= 0.66) {
        const gt = (cx - 0.20) / 0.50;
        pixels[idx] = Math.round(0x7a + gt * (0xbb - 0x7a));
        pixels[idx + 1] = Math.round(0xa2 + gt * (0x9a - 0xa2));
        pixels[idx + 2] = 0xf7;
      }
    }
  }

  return Buffer.concat([Buffer.from(header, 'ascii'), pixels]);
}

// Generate PPM and convert to PNG via sips
const ppmPath = path.join(outDir, 'icon.ppm');
fs.writeFileSync(ppmPath, createPPM(size, size));
execSync(`sips -s format png "${ppmPath}" --out "${pngPath}"`, { stdio: 'pipe' });
fs.unlinkSync(ppmPath);
console.log('Created assets/icon.png (1024x1024)');

// Generate iconset sizes
const iconSizes = [16, 32, 64, 128, 256, 512, 1024];
for (const s of iconSizes) {
  const outFile = path.join(iconsetDir, `icon_${s}x${s}.png`);
  execSync(`sips -z ${s} ${s} "${pngPath}" --out "${outFile}"`, { stdio: 'pipe' });
  if (s <= 512) {
    // Also create @2x variant for the size below
    const outFile2x = path.join(iconsetDir, `icon_${s / 2}x${s / 2}@2x.png`);
    if (s / 2 >= 16) {
      execSync(`cp "${outFile}" "${outFile2x}"`, { stdio: 'pipe' });
    }
  }
}

// Create .icns
const icnsPath = path.join(outDir, 'icon.icns');
execSync(`iconutil -c icns "${iconsetDir}" -o "${icnsPath}"`, { stdio: 'pipe' });
console.log('Created assets/icon.icns');

// Cleanup iconset
fs.rmSync(iconsetDir, { recursive: true });
console.log('Done!');
