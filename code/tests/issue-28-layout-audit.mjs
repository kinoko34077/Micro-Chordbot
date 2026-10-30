import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const outputDir = path.join(repoRoot, "artifacts/issue-28-layout-audit");
await mkdir(outputDir, { recursive: true });

const viewports = [
  [320, 700], [375, 812], [390, 844], [430, 932], [667, 375],
  [768, 1024], [834, 1194], [1024, 768], [1200, 800], [1280, 400], [1280, 650], [1280, 750], [1280, 768], [1280, 800], [1440, 900], [1920, 1080]
];
const browser = await chromium.launch({ headless: true });
const measurements = [];
const liveSettings = [];

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
          progressionView: box("#view-progression"),
          progressionToolbar: box(".progression-toolbar"),
          progressionToolbarControls: [...document.querySelectorAll(".progression-toolbar button, .progression-toolbar select, .progression-toolbar input")].map((node) => {
            const rect=node.getBoundingClientRect();
            return {id:node.id,display:getComputedStyle(node).display,x:Math.round(rect.x),y:Math.round(rect.y),right:Math.round(rect.right),bottom:Math.round(rect.bottom),width:Math.round(rect.width),height:Math.round(rect.height),hidden:node.hidden};
          }),
          progressionGrid: box("#progressionGrid"),
          progressionEditor: box(".progression-editor"),
          progressionEditorBody: box(".progression-editor-body"),
          progressionVoiceEditor: box(".progression-voice-editor"),
          progressionChoiceTools: box(".progression-choice-tools"),
          progressionEditorColumns: getComputedStyle(document.querySelector(".progression-editor-body")).gridTemplateColumns,
          progressionChordChoices: box("#progChordButtonGrid"),
          progressionChoiceKeyboardAccess: document.querySelector("#progChordButtonGrid").tabIndex === 0 &&
            document.querySelector("#progChordButtonGrid").getAttribute("aria-label") === "コード種類の候補",
          progressionVoiceKeyboardAccess: document.querySelector(".progression-popover-row").tabIndex === 0 &&
            document.querySelector(".progression-popover-row").getAttribute("aria-label") === "Bassと転回形の候補",
          progressionKeyboardScrollEnabled:
            document.querySelector("#progChordButtonGrid").tabIndex === 0 &&
            document.querySelector(".progression-popover-row").tabIndex === 0,
          progressionBassInput: box("#progBassInput"),
          progressionInversionButton: box("#progInversionPopoverBtn"),
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
      if (view === "progression" && width <= 430) {
        assert.equal(geometry.progressionKeyboardScrollEnabled,false,
          "phone tab view must not add empty candidate scroll regions to the keyboard tab order");
      }
      if (view === "progression" && width >= 1200 && height <= 768) {
        assert.equal(geometry.progressionView.overflowY,"auto",
          "short desktop workspaces need one vertical scrolling path: "+JSON.stringify(geometry.progressionView));
        const viewBottom=geometry.progressionView.y+geometry.progressionView.height;
        const libraryBottom=geometry.chordLibrary.y+geometry.chordLibrary.height;
        assert.ok(geometry.progressionView.scrollHeight>geometry.progressionView.clientHeight+1||
          libraryBottom<=viewBottom,
          "short desktop chord library must be visible or reachable by workspace scrolling: "+JSON.stringify({view:geometry.progressionView,library:geometry.chordLibrary}));
        assert.ok(geometry.chordLibrary.y>=geometry.progressionEditor.y+geometry.progressionEditor.height-1,
          "short desktop panels must remain in a non-overlapping vertical order: "+JSON.stringify({editor:geometry.progressionEditor,library:geometry.chordLibrary}));
        assert.ok(geometry.progressionBassInput.height>0&&geometry.progressionInversionButton.height>0,
          "short desktop Bass and inversion controls must remain rendered");
      } else if (view === "progression" && width >= 1200) {
        const editorBottom=geometry.progressionEditor.y+geometry.progressionEditor.height;
        assert.ok(geometry.progressionBassInput.y+geometry.progressionBassInput.height<=editorBottom,
          "Bass must be reachable without scrolling the whole editor at "+width+": "+JSON.stringify(geometry));
        assert.ok(geometry.progressionInversionButton.y+geometry.progressionInversionButton.height<=editorBottom,
          "inversion controls must be reachable without scrolling the whole editor at "+width+": "+JSON.stringify(geometry));
        assert.ok(geometry.progressionEditorBody.scrollWidth<=geometry.progressionEditorBody.clientWidth+1,
          "desktop editor body must not overflow horizontally at "+width+": "+JSON.stringify(geometry.progressionEditorBody));
        assert.ok(geometry.progressionBassInput.width>=72&&geometry.progressionInversionButton.width>=60,
          "Bass and inversion actions must retain usable widths at "+width+": "+JSON.stringify(geometry));
        assert.ok(geometry.progressionChoiceKeyboardAccess&&geometry.progressionVoiceKeyboardAccess,
          "choice panes must be named and keyboard-scrollable at "+width);
        assert.ok(geometry.progressionVoiceEditor.x>=geometry.progressionChordChoices.x+geometry.progressionChordChoices.width-1,
          "Bass/inversion zone must sit beside chord choices at "+width+": "+JSON.stringify(geometry));
        assert.ok(geometry.progressionVoiceEditor.height>=100,
          "Bass/inversion zone must retain enough height for its controls at "+width+": "+JSON.stringify(geometry));
        const toolbarRight=geometry.progressionToolbar.x+geometry.progressionToolbar.width;
        const toolbarBottom=geometry.progressionToolbar.y+geometry.progressionToolbar.height;
        assert.ok(geometry.progressionToolbarControls.every(control=>control.hidden||
          control.width>0&&control.height>0&&control.x>=geometry.progressionToolbar.x&&
          control.right<=toolbarRight&&control.y>=geometry.progressionToolbar.y&&control.bottom<=toolbarBottom),
          "desktop progression toolbar controls must stay inside the toolbar at "+width+": "+JSON.stringify({toolbar:geometry.progressionToolbar,controls:geometry.progressionToolbarControls}));
        assert.ok(geometry.progressionChordChoices.height<=240&&geometry.progressionChordChoices.overflowY==="auto",
          "desktop chord choices need their own bounded scroll area at "+width+": "+JSON.stringify(geometry.progressionChordChoices));
      }
    }
    await page.close();
  }

  await writeFile(path.join(outputDir, "measurements.json"), `${JSON.stringify(measurements, null, 2)}\n`);

  const settingsAudit = [];
  const settingsAuditViewports = [[320,800],[390,844],[768,1024],[1440,900]];
  const settingsIds = [
    "runtimeInfoText", "runtimeRefreshBtn", "presetNameWidthInput", "presetCentWidthInput",
    "presetShortWidthInput", "presetTagWidthInput", "presetMemoWidthInput", "progressionCellWidthInput",
    "a4HzInput", "bpmInput", "phaseModeSelect", "roundUnitInput", "roundingModeSelect",
    "exportBtn", "exportLibraryBtn", "importFileInput"
  ];
  for (const [width,height] of settingsAuditViewports) {
    const page = await browser.newPage({viewport:{width,height},deviceScaleFactor:1,isMobile:width<=430,hasTouch:width<=430});
    const errors=[];
    page.on("pageerror",(error)=>errors.push(error.message));
    await page.goto("http://127.0.0.1:4173/",{waitUntil:"networkidle"});
    await page.waitForFunction(()=>document.querySelector("#pitchPresetList")?.children.length > 0);
    if (await page.locator("#pwaPromptCloseBtn").isVisible().catch(()=>false)) await page.locator("#pwaPromptCloseBtn").click();
    await page.locator("#settingsMenuBtn").click();
    await page.waitForFunction(()=>!document.querySelector("#settingsDrawer")?.hidden);
    const geometry=await page.evaluate((ids)=>{
      const box=(node)=>{const r=node.getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height),bottom:Math.round(r.bottom)};};
      const body=document.querySelector("#settingsDrawerBody");
      return {
        body:{...box(body),scrollWidth:body.scrollWidth,clientWidth:body.clientWidth,scrollHeight:body.scrollHeight,clientHeight:body.clientHeight},
        firstPreference:box(document.getElementById("presetNameWidthInput")),
        runtimeInfo:box(document.getElementById("runtimeInfoText")),
        runtimeAction:box(document.getElementById("runtimeRefreshBtn")),
        groups:[...document.querySelectorAll("#settingsDrawerBody > .settings-task-section h3")].map(node=>node.textContent.trim()),
        controls:ids.map(id=>({id,exists:Boolean(document.getElementById(id)),visible:Boolean(document.getElementById(id)?.getClientRects().length)})),
        minInputHeight:Math.min(...[...document.querySelectorAll("#settingsDrawerBody input[type=number],#settingsDrawerBody select")].map(node=>box(node).height))
      };
    },settingsIds);
    const screenshot=`settings-${width}x${height}.png`;
    await page.screenshot({path:path.join(outputDir,screenshot),fullPage:false});
    settingsAudit.push({viewport:`${width}x${height}`,screenshot,...geometry,pageErrors:errors});
    const measurementPath=path.join(outputDir,"settings-measurements.json");
    await writeFile(measurementPath,`${JSON.stringify(settingsAudit,null,2)}\n`);
    JSON.parse(await readFile(measurementPath,"utf8"));
    assert.ok(geometry.firstPreference.y < geometry.runtimeInfo.y,"priority settings must appear before runtime details at "+width);
    assert.deepEqual(geometry.groups,["一覧の幅","進行セル","音と再生","入出力","アプリ状態"],"settings must be grouped by task at "+width);
    assert.equal(geometry.controls.filter(control=>control.exists).length,16,"settings actions and values must remain present at "+width);
    assert.ok(geometry.body.scrollWidth<=geometry.body.clientWidth+1,"settings must not overflow horizontally at "+width);
    assert.ok(geometry.minInputHeight>=40,"settings controls must remain touch-accessible at "+width);
    assert.deepEqual(errors,[],"settings view must not produce browser errors at "+width);
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
    await page.waitForFunction(()=>document.querySelector("#pitchPresetList")?.children.length > 0,{timeout:30000});
    await page.waitForSelector("#settingsMenuBtn",{timeout:10000});
    if (await page.locator("#pwaPromptCloseBtn").isVisible().catch(()=>false)) await page.locator("#pwaPromptCloseBtn").click();
    await page.locator("#settingsMenuBtn").click();
    await page.waitForFunction(()=>!document.querySelector("#settingsDrawer")?.hidden);
    const readGeometry=()=>page.evaluate((ids)=>{
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
    let geometry;
    let recoveredLivePage=false;
    try {
      geometry=await readGeometry();
    } catch(error) {
      recoveredLivePage=true;
      const message=String(error?.message);
      if(!message.includes("Execution context was destroyed")&&!message.includes("Cannot read properties of null")) throw error;
      // Pages may replace the document while a service worker activates; restart the live audit once on a stable document.
      const retryResponse=await page.goto("https://kinoko34077.github.io/Micro-Chordbot/",{waitUntil:"domcontentloaded"});
      assert.equal(retryResponse?.status(),200,"live Pages retry must load at "+width);
      await page.waitForFunction(()=>document.querySelector("#pitchPresetList")?.children.length>0,{timeout:30000});
      await page.waitForFunction(()=>document.querySelector("#settingsDrawer")&&document.querySelector("#settingsDrawerBody"),{timeout:15000});
      if(await page.locator("#pwaPromptCloseBtn").isVisible().catch(()=>false)) await page.locator("#pwaPromptCloseBtn").click();
      if(await page.locator("#settingsDrawer").evaluate(node=>node.hidden)) {
        await page.locator("#settingsMenuBtn").click();
        await page.waitForFunction(()=>!document.querySelector("#settingsDrawer")?.hidden);
      }
      geometry=await readGeometry();
    }
    const screenshot=`live-settings_${width}x${height}.png`;
    await page.screenshot({path:path.join(outputDir,screenshot),fullPage:false});
    liveSettings.push({viewport:`${width}x${height}`,screenshot,httpStatus:response.status(),recoveredLivePage,...geometry,pageErrors:errors});
    await writeFile(path.join(outputDir,"live-settings-measurements.json"), `${JSON.stringify(liveSettings, null, 2)}\n`);
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
