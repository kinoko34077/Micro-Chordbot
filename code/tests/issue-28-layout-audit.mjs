import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outputDir = path.join(repoRoot, "artifacts/issue-28-layout-audit");
await mkdir(outputDir, { recursive: true });

const viewports = [
  [320, 700], [375, 812], [390, 844], [430, 932], [667, 375],
  [768, 1024], [834, 1194], [1024, 768], [1280, 800], [1440, 900], [1920, 1080]
];
const browser = await chromium.launch({ headless: true });
const measurements = [];

try {
  for (const [width, height] of viewports) {
    const page = await browser.newPage({
      viewport: { width, height },
      deviceScaleFactor: 1,
      isMobile: width <= 430,
      hasTouch: width <= 430
    });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:4173/", { waitUntil: "networkidle" });
    await page.waitForTimeout(250);
    if (await page.locator("#pwaPromptCloseBtn").isVisible().catch(() => false)) {
      await page.locator("#pwaPromptCloseBtn").click();
    }

    for (const view of ["pitch", "progression"]) {
      await page.locator(`[data-view="${view}"]`).click();
      await page.waitForTimeout(100);
      const geometry = await page.evaluate(() => {
        const box = (selector) => {
          const node = document.querySelector(selector);
          if (!node) return null;
          const rect = node.getBoundingClientRect();
          const style = getComputedStyle(node);
          return {
            x: Math.round(rect.x), y: Math.round(rect.y),
            width: Math.round(rect.width), height: Math.round(rect.height),
            display: style.display, overflowX: style.overflowX, overflowY: style.overflowY,
            scrollWidth: node.scrollWidth, clientWidth: node.clientWidth,
            scrollHeight: node.scrollHeight, clientHeight: node.clientHeight
          };
        };
        const grid = document.querySelector(".progression-chunk-grid");
        const pitchRows = document.querySelectorAll("#pitchPresetList tbody tr").length;
        const chordRows = document.querySelectorAll("#chordPresetList tbody tr").length;
        return {
          viewport: {
            width: innerWidth, height: innerHeight,
            documentWidth: document.documentElement.scrollWidth,
            documentHeight: document.documentElement.scrollHeight
          },
          currentView: document.body.dataset.currentView,
          topbar: box(".topbar"),
          pitchToolbar: box(".pitch-toolbar"),
          pitchLine: box(".line-wrap"),
          activeNotes: box(".active-notes-panel"),
          activeNotesSearch: box("#activeNotesFilterInput"),
          pitchPresetSearch: box("#pitchPresetFilterInput"),
          pitchPresets: box("#pitchPresetList"),
          progressionToolbar: box(".progression-toolbar"),
          progressionGrid: box("#progressionGrid"),
          progressionEditor: box(".progression-editor"),
          progressionChoiceTools: box(".progression-choice-tools"),
          firstChordChoice: box("#progChordButtonGrid button[data-chord-id]"),
          chordLibrary: box(".chord-library-panel"),
          renderedPitchPresetRows: pitchRows,
          renderedChordPresetRows: chordRows,
          progressionColumns: grid ? getComputedStyle(grid).gridTemplateColumns : null
        };
      });
      const screenshot = `${view}_${width}x${height}.png`;
      await page.screenshot({ path: path.join(outputDir, screenshot), fullPage: false });
      measurements.push({ viewport: `${width}x${height}`, selectedView: view, screenshot, ...geometry, pageErrors: [...errors] });
    }
    await page.close();
  }
} finally {
  await browser.close();
}

assert.equal(measurements.length, viewports.length * 2, "each viewport must record both workspace views");
assert.ok(measurements.every((entry) => entry.pageErrors.length === 0), "layout audit must not produce browser runtime errors");
await writeFile(path.join(outputDir, "measurements.json"), `${JSON.stringify(measurements, null, 2)}\n`);
console.log(JSON.stringify({ count: measurements.length, outputDir, viewports: viewports.map(([w, h]) => `${w}x${h}`) }, null, 2));
