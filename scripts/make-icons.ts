// Renders public/icon.svg to the PNG sizes the web app manifest and iOS need.
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const SIZES: [string, number][] = [
  ['public/icon-192.png', 192],
  ['public/icon-512.png', 512],
  ['public/apple-touch-icon.png', 180],
];

const svg = readFileSync('public/icon.svg', 'utf8');
const browser = await chromium.launch();
try {
  for (const [path, size] of SIZES) {
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
