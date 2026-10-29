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
          chordFilterSearch: box("#progChordTagFilterInput"),
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

  // Capture the deployed main UI directly so the audit reflects the live site.
  const liveSettingsViewports = [
    [320,800], [390,360], [768,1024], [834,1194], [1024,768],
    [1280,800], [1440,900], [1920,1080]
  ];
  const settingIds = [
    "runtimeInfoText", "runtimeRefreshBtn", "presetNameWidthInput", "presetCentWidthInput",
    "presetShortWidthInput", "presetTagWidthInput", "presetMemoWidthInput", "progressionCellWidthInput",
    "a4HzInput", "bpmInput", "phaseModeSelect", "roundUnitInput", "roundingModeSelect",
    "exportBtn", "exportLibraryBtn", "importFileInput"
  ];
  for (const [width,height] of liveSettingsViewports) {
    const page = await browser.newPage({viewport:{width,height},deviceScaleFactor:1,isMobile:width<=430,hasTouch:width<=430});
    const errors=[];
    page.on("pageerror",(error)=>errors.push(error.message));
    const response=await page.goto("https://kinoko34077.github.io/Micro-Chordbot/",{waitUntil:"domcontentloaded"});
    assert.equal(response?.status(),200,"live Pages must load at "+width);
    await page.waitForFunction(()=>document.querySelectorAll("#pitchPresetList tr").length > 0,{timeout:30000});
    await page.waitForSelector("#settingsMenuBtn",{timeout:10000});
    if (await page.locator("#pwaPromptCloseBtn").isVisible().catch(()=>false)) await page.locator("#pwaPromptCloseBtn").click();
    await page.locator("#settingsMenuBtn").click();
    await page.waitForFunction(()=>!document.querySelector("#settingsDrawer")?.hidden);
    const geometry=await page.evaluate((ids)=>{
      const rect=(selector)=>{const r=document.querySelector(selector).getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),right:Math.round(r.right),bottom:Math.round(r.bottom),width:Math.round(r.width),height:Math.round(r.height)};};
      const body=document.querySelector("#settingsDrawerBody");
      return {
        viewport:{width:innerWidth,height:innerHeight},
        drawer:rect("#settingsDrawer"),
        body:{...rect("#settingsDrawerBody"),scrollWidth:body.scrollWidth,clientWidth:body.clientWidth,scrollHeight:body.scrollHeight,clientHeight:body.clientHeight,scrollTop:body.scrollTop,overflowY:getComputedStyle(body).overflowY},
        panels:[...body.children].filter(node=>!node.hidden).map(node=>({heading:node.querySelector("h3")?.textContent?.trim(),rect:(()=>{const r=node.getBoundingClientRect();return {y:Math.round(r.y),height:Math.round(r.height),bottom:Math.round(r.bottom)}})()})),
        groups:[...document.querySelectorAll(".settings-subgroup h4")].map(node=>node.textContent.trim()),
        controls:ids.map(id=>({id,exists:Boolean(document.getElementById(id)),visible:Boolean(document.getElementById(id)?.getClientRects().length)})),
        menuLinks:[...document.querySelectorAll(".settings-drawer-links button")].map(node=>({text:node.textContent.trim(),rect:(()=>{const r=node.getBoundingClientRect();return {width:Math.round(r.width),height:Math.round(r.height)}})()}))
      };
    },settingIds);
    const screenshot=`live-settings_${width}x${height}.png`;
    await page.screenshot({path:path.join(outputDir,screenshot),fullPage:false});
    liveSettings.push({viewport:`${width}x${height}`,screenshot,httpStatus:response.status(),...geometry,pageErrors:errors});
    assert.equal(geometry.controls.filter(control=>control.exists).length,16,"all deployed settings/actions must exist at "+width);
    assert.ok(geometry.body.scrollWidth<=geometry.body.clientWidth+1,"live settings overflow horizontally at "+width);
    assert.deepEqual(errors,[],"live Pages must not produce browser errors at "+width);
    await page.close();
  }
} finally {
  await browser.close();
}

assert.equal(measurements.length, viewports.length * 2, "each viewport must record both workspace views");
assert.ok(measurements.every((entry) => entry.pageErrors.length === 0), "layout audit must not produce browser runtime errors");
await writeFile(path.join(outputDir, "measurements.json"), `${JSON.stringify(measurements, null, 2)}\n`);
await writeFile(path.join(outputDir,"live-settings-measurements.json"), `${JSON.stringify(liveSettings, null, 2)}\n`);
console.log(JSON.stringify({localViewports:measurements.length,liveSettings,outputDir},null,2));
