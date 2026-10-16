// Renders public/icon.svg to the PNG sizes the web app manifest and iOS need, and
// public/icon-maskable.svg, whose mark sits inside the circle Android may cut the icon to.
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const SIZES: [string, string, number][] = [
  ['public/icon.svg', 'public/icon-192.png', 192],
  ['public/icon.svg', 'public/icon-512.png', 512],
  ['public/icon.svg', 'public/apple-touch-icon.png', 180],
  ['public/icon-maskable.svg', 'public/icon-maskable-512.png', 512],
];

const browser = await chromium.launch();
try {
  for (const [source, path, size] of SIZES) {
    const svg = readFileSync(source, 'utf8');
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    await page.screenshot({ path, omitBackground: true });
    await page.close();
    console.log(`${path} (${size}x${size})`);
  }
} finally {
  await browser.close();
}
