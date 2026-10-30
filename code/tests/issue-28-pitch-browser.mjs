import assert from "node:assert/strict";
import {chromium} from "playwright";

const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  const errors = [];
  page.on("pageerror", e=>errors.push(String(e)));
  await page.addInitScript(() => {
    window.__mcFrequencyTargets = [];
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const createOscillator = AudioContextClass.prototype.createOscillator;
    AudioContextClass.prototype.createOscillator = function(...args) {
      const oscillator = createOscillator.apply(this, args);
      const frequency = oscillator.frequency;
      const ramp = frequency.linearRampToValueAtTime.bind(frequency);
      frequency.linearRampToValueAtTime = (value, time) => {
        window.__mcFrequencyTargets.push(Number(value));
        return ramp(value, time);
      };
      const start = oscillator.start.bind(oscillator);
      oscillator.start = (...startArgs) => {
        window.__mcFrequencyTargets.push(Number(frequency.value));
        return start(...startArgs);
      };
      return oscillator;
    };
  });
  await page.goto("http://127.0.0.1:4173/", {waitUntil:"domcontentloaded"});
  const presets = page.locator("#pitchPresetList tbody tr[data-pitch-preset-id]");
  await presets.first().waitFor({state:"visible",timeout:5000});
  const initialPresetCount = await presets.count();
  assert.ok(initialPresetCount > 0,"pitch library seed data not rendered");
  const initialPitchPresetIds = await presets.evaluateAll(rows => rows.map(row => row.getAttribute("data-pitch-preset-id")).sort());
  const pitchLibraryLayout = await page.evaluate(() => {
    const panel = document.querySelector(".active-notes-panel");
    const activeBlock = document.querySelector("#activeNotesList")?.closest(".library-block");
    const presetBlock = document.querySelector("#pitchPresetList")?.closest(".library-block");
    const top = node => node?.getBoundingClientRect().top ?? null;
    return {
      panelTop: top(panel),
      activeSearchTop: top(document.querySelector("#activeNotesFilterInput")),
      presetListTop: top(document.querySelector("#pitchPresetList")),
      clearActionHeight: document.querySelector("#clearActiveNotesBtn")?.getBoundingClientRect().height ?? 0,
      hasWrapperHeading: Boolean(panel?.querySelector(":scope > .panel-heading")),
      clearActionInActiveBlock: document.querySelector("#clearActiveNotesBtn")?.closest(".library-block") === activeBlock,
      summaryInActiveBlock: document.querySelector("#activeNotesSummary")?.closest(".library-block") === activeBlock,
      statusInPresetBlock: document.querySelector("#pitchPresetStatus")?.closest(".library-block") === presetBlock,
      pitchSearchInPresetHeading: document.querySelector("#pitchPresetFilterInput")?.parentElement?.classList.contains("library-block-head")
    };
  });
  assert.equal(pitchLibraryLayout.hasWrapperHeading,false,"pitch lists should not sit under a duplicate library heading");
  assert.equal(pitchLibraryLayout.clearActionInActiveBlock,true,"clear action must stay with the active-note list it affects");
  assert.equal(pitchLibraryLayout.summaryInActiveBlock,true,"active-note count and empty guidance must stay with the active-note list");
  assert.equal(pitchLibraryLayout.statusInPresetBlock,true,"preset status must stay with the preset list");
  assert.equal(pitchLibraryLayout.pitchSearchInPresetHeading,true,"preset search should be placed in its own heading in the document");
  assert.ok(pitchLibraryLayout.clearActionHeight>=40,"moving the clear action must retain a touch-sized target");
  assert.ok(pitchLibraryLayout.activeSearchTop-pitchLibraryLayout.panelTop<72,"active-note controls should start near the library panel edge");
  console.log("PITCH_LIBRARY_DENSITY",JSON.stringify({viewport:"390x844",beforePresetListOffset:249,afterPresetListOffset:Math.round(pitchLibraryLayout.presetListTop-pitchLibraryLayout.panelTop)}));
  assert.ok(pitchLibraryLayout.presetListTop-pitchLibraryLayout.panelTop<180,"the preset list should begin higher after removing the redundant wrapper row");
  const search = page.locator("#pitchPresetFilterInput");
  assert.equal(await search.getAttribute("aria-label"),"音高プリセットを検索","pitch preset search needs an accessible name");
  await search.fill("完全1度");
  await page.waitForTimeout(100);
  assert.equal(await presets.count(),1,"pitch library search did not isolate the known seed preset");
  await search.fill("");
  await page.waitForTimeout(100);
  assert.equal(await presets.count(),initialPresetCount,"clearing pitch library search did not restore all presets");
  await page.locator("#clearActiveNotesBtn").click();
  const canvas = page.locator("#pitchLine");
  const box = await canvas.boundingBox();
  assert.ok(box && box.width > 100,"pitch canvas not rendered");
  const x = box.x + box.width * .40;
  const y = box.y + box.height / 2 - 10;
  await page.mouse.click(x,y);
  await page.waitForTimeout(150);
  const rows = page.locator('#activeNotesList tr[data-note-id]');
  assert.equal(await rows.count(),1,"initial note creation should yield one active note");
  const beforeId = await rows.first().getAttribute("data-note-id");

  // Changing the round unit must immediately move the pitch-line cursor to the
  // audible rounded pitch, while retaining a visible raw-pitch reference.
  await page.locator("#settingsMenuBtn").click();
  const roundUnit = page.locator("#roundUnitInput");
  await roundUnit.fill("100");
  await roundUnit.press("Tab");
  await page.waitForTimeout(100);
  const roundedPreviewFrequency = await page.evaluate(() => window.__mcFrequencyTargets.at(-1) ?? null);
  const expectedRoundedFrequency = 440 * Math.pow(2, (-9 + 500 / 100) / 12);
  assert.ok(Number.isFinite(roundedPreviewFrequency) &&
    Math.abs(roundedPreviewFrequency - expectedRoundedFrequency) < 0.02,
    "changing rounding cents did not retune the active pitch slider preview: " + roundedPreviewFrequency);
  const draftCursorRatio = await canvas.evaluate(element => {
    const context = element.getContext("2d");
    const {width,height} = element;
    const pixels = context.getImageData(0,0,width,height).data;
    let bestX = -1;
    let bestCount = 0;
    for(let x=0;x<width;x++){
      let count = 0;
      for(let y=20;y<height-8;y++){
        const index = (y*width+x)*4;
        if(pixels[index]===34 && pixels[index+1]===211 && pixels[index+2]===238) count++;
      }
      if(count>bestCount){bestX=x;bestCount=count;}
    }
    return {ratio:bestX/width,count:bestCount};
  });
  assert.ok(draftCursorRatio.count > 20,"rounded draft cursor was not drawn on the pitch line");
  assert.ok(Math.abs(draftCursorRatio.ratio-(500/1200))<0.006,
    "pitch line did not move to the configured 100-cent rounding: "+JSON.stringify(draftCursorRatio));
  await page.locator("#settingsDrawerCloseBtn").click();

  const gestureX = box.x + box.width * (500/1200);
  await page.mouse.move(gestureX,y);
  await page.mouse.down();
  await page.mouse.move(gestureX+35,y,{steps:8});
  await page.waitForTimeout(100);
  assert.equal(await rows.first().getAttribute("data-note-id"),beforeId,"drag mutated committed note before release");
  await page.mouse.up();
  await page.waitForTimeout(160);
  const afterId = await rows.first().getAttribute("data-note-id");
  assert.notEqual(afterId,beforeId,"drag did not commit changed pitch at pointerup");
  assert.equal(await rows.count(),1,"drag unexpectedly deleted/duplicated notes");

  // Gesture regression: a real touch input emits pointer events, not a guaranteed dblclick.
  const cdp = await page.context().newCDPSession(page);
  const movedX = gestureX+35;
  const touch = async (type,points)=>cdp.send("Input.dispatchTouchEvent",{type,touchPoints:points});
  for(let i=0;i<2;i++){
    await touch("touchStart",[{x:movedX,y,id:1}]);
    await touch("touchEnd",[]);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(150);
  assert.equal(await rows.count(),0,"touch double tap did not delete note");

  // Cancelling an in-progress touch drag must not commit a candidate.
  await page.mouse.click(gestureX,y);
  await page.waitForTimeout(120);
  assert.equal(await rows.count(),1,"cancel fixture note missing");
  const cancelledId = await rows.first().getAttribute("data-note-id");
  await touch("touchStart",[{x:gestureX,y,id:2}]);
  await touch("touchMove",[{x:gestureX+60,y,id:2}]);
  await page.waitForTimeout(60);
  assert.equal(await rows.first().getAttribute("data-note-id"),cancelledId,"touch move wrote committed data");
  await touch("touchCancel",[]);
  await page.waitForTimeout(140);
  assert.equal(await rows.first().getAttribute("data-note-id"),cancelledId,"touch cancel committed pitch");

  // A real touch drag changes an active note only on release and is one undoable action.
  await touch("touchStart",[{x:gestureX,y,id:3}]);
  await touch("touchMove",[{x:gestureX+35,y,id:3}]);
  await page.waitForTimeout(80);
  assert.equal(await rows.first().getAttribute("data-note-id"),cancelledId,
    "touch drag committed before release");
  await touch("touchEnd",[]);
  await page.waitForTimeout(160);
  const touchDraggedId = await rows.first().getAttribute("data-note-id");
  assert.notEqual(touchDraggedId,cancelledId,"touch drag did not commit after release");
  assert.equal(await rows.count(),1,"touch drag duplicated or removed the active note");
  await page.locator("#undoBtn").click();
  await page.waitForTimeout(100);
  assert.equal(await rows.first().getAttribute("data-note-id"),cancelledId,
    "one undo did not restore the touch-dragged pitch");
  await page.locator("#redoBtn").click();
  await page.waitForTimeout(100);
  assert.equal(await rows.first().getAttribute("data-note-id"),touchDraggedId,
    "redo did not restore the touch-dragged pitch");

  // Export/import the current project through the phone settings drawer.
  await page.locator("#settingsMenuBtn").click();
  assert.equal(await page.locator("#settingsDrawer").isVisible(), true, "settings drawer did not open");
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#exportBtn").click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const buffer = Buffer.concat(chunks);
  const exported = JSON.parse(buffer.toString("utf8"));
  assert.equal(exported.exportType, "project", "project export did not create a project file");
  assert.equal(exported.payload.activeNotes, undefined, "project export should preserve the established transient-note format");
  const pitchPresetCount = exported.payload.pitchPresets.length;
  const chordPresetCount = exported.payload.chordPresets.length;
  assert.equal(pitchPresetCount, initialPresetCount, "project export omitted pitch presets");
  assert.ok(chordPresetCount > 0, "project export omitted chord presets");
  assert.deepEqual(exported.payload.pitchPresets.map(preset => preset.id).sort(), initialPitchPresetIds, "project export changed the pitch preset identities");
  assert.ok(exported.payload.progression && Array.isArray(exported.payload.progression.parts), "project export omitted the progression");
  await page.locator("#settingsDrawerCloseBtn").click();
  await page.locator("#clearActiveNotesBtn").click();
  assert.equal(await rows.count(), 0, "clear fixture did not remove the active pitch");
  await page.locator("#settingsMenuBtn").click();
  await page.locator("#importFileInput").setInputFiles({name:download.suggestedFilename(),mimeType:"application/json",buffer});
  await page.waitForFunction(() => document.querySelector("#manageStatus")?.textContent.includes("project を読込"),null,{timeout:5000});
  await page.locator("#settingsDrawerCloseBtn").click();
  assert.equal(await rows.count(), 0, "project import should retain the established transient-note behavior");
  assert.equal(await presets.count(), pitchPresetCount, "project import did not restore the exported pitch library");
  const restoredPitchPresetIds = await presets.evaluateAll(rows => rows.map(row => row.getAttribute("data-pitch-preset-id")).sort());
  assert.deepEqual(restoredPitchPresetIds, initialPitchPresetIds, "project import changed pitch preset identities");
  const secondDrawer = page.locator("#settingsMenuBtn");
  await secondDrawer.click();
  const roundtripDownloadPromise = page.waitForEvent("download");
  await page.locator("#exportBtn").click();
  const roundtripDownload = await roundtripDownloadPromise;
  const roundtripStream = await roundtripDownload.createReadStream();
  const roundtripChunks = [];
  for await (const chunk of roundtripStream) roundtripChunks.push(chunk);
  const roundtrip = JSON.parse(Buffer.concat(roundtripChunks).toString("utf8"));
  assert.deepEqual(roundtrip.payload, exported.payload, "project import/export changed the established project payload");

  assert.deepEqual(errors,[],"pitch view emitted uncaught browser errors");
  await page.close();
}finally{
  await browser.close();
}
