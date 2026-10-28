import { readFile } from "node:fs/promises";
import assert from "node:assert/strict";
import {chromium} from "playwright";

const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,acceptDownloads:true});
  const errors = [];
  page.on("pageerror", e=>errors.push(String(e)));
  await page.goto("http://127.0.0.1:4173/", {waitUntil:"domcontentloaded"});
  const presets = page.locator("#pitchPresetList tbody tr[data-pitch-preset-id]");
  await presets.first().waitFor({state:"visible",timeout:5000});
  const initialPresetCount = await presets.count();
  assert.ok(initialPresetCount > 0,"pitch library seed data not rendered");
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
  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(x+35,y,{steps:8});
  await page.waitForTimeout(100);
  assert.equal(await rows.first().getAttribute("data-note-id"),beforeId,"drag mutated committed note before release");
  await page.mouse.up();
  await page.waitForTimeout(160);
  const afterId = await rows.first().getAttribute("data-note-id");
  assert.notEqual(afterId,beforeId,"drag did not commit changed pitch at pointerup");
  assert.equal(await rows.count(),1,"drag unexpectedly deleted/duplicated notes");

  // Gesture regression: a real touch input emits pointer events, not a guaranteed dblclick.
  const cdp = await page.context().newCDPSession(page);
  const movedX = x+35;
  const touch = async (type,points)=>cdp.send("Input.dispatchTouchEvent",{type,touchPoints:points});
  for(let i=0;i<2;i++){
    await touch("touchStart",[{x:movedX,y,id:1}]);
    await touch("touchEnd",[]);
    await page.waitForTimeout(80);
  }
  await page.waitForTimeout(150);
  assert.equal(await rows.count(),0,"touch double tap did not delete note");

  // Cancelling an in-progress touch drag must not commit a candidate.
  await page.mouse.click(x,y);
  await page.waitForTimeout(120);
  assert.equal(await rows.count(),1,"cancel fixture note missing");
  const cancelledId = await rows.first().getAttribute("data-note-id");
  await touch("touchStart",[{x,y,id:2}]);
  await touch("touchMove",[{x:x+60,y,id:2}]);
  await page.waitForTimeout(60);
  assert.equal(await rows.first().getAttribute("data-note-id"),cancelledId,"touch move wrote committed data");
  await touch("touchCancel",[]);
  await page.waitForTimeout(140);
  assert.equal(await rows.first().getAttribute("data-note-id"),cancelledId,"touch cancel committed pitch");

  // A real touch drag changes an active note only on release and is one undoable action.
  await touch("touchStart",[{x,y,id:3}]);
  await touch("touchMove",[{x:x+35,y,id:3}]);
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

  // Project export/import must preserve the exact active pitch and keep one note.
  await page.setViewportSize({width:1280,height:800});
  await page.evaluate(() => document.querySelector('button[data-view="settings"]')?.click());
  await page.waitForFunction(() => document.querySelector("#view-settings")?.classList.contains("active"));
  const downloadPromise = page.waitForEvent("download");
  await page.locator("#exportBtn").click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const exported = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  assert.equal(exported.exportType, "project", "export control did not create a project file");
  assert.equal(exported.payload.activeNotes.length, 1, "project export omitted the active pitch");
  assert.equal(exported.payload.activeNotes[0].id, touchDraggedId, "project export changed the active pitch");
  await page.locator('button[data-view="pitch"]').click();
  await page.locator("#clearActiveNotesBtn").click();
  assert.equal(await rows.count(), 0, "clear fixture did not remove the active pitch");
  await page.evaluate(() => document.querySelector('button[data-view="settings"]')?.click());
  await page.waitForFunction(() => document.querySelector("#view-settings")?.classList.contains("active"));
  await page.locator("#importFileInput").setInputFiles({
    name: download.suggestedFilename(),
    mimeType: "application/json",
    buffer: Buffer.concat(chunks)
  });
  await page.waitForFunction(() => document.querySelector("#manageStatus")?.textContent.includes("project を読込"),null,{timeout:5000});
  await page.setViewportSize({width:390,height:844});
  await page.locator('button[data-view="pitch"]').click();
  assert.equal(await rows.count(), 1, "project import did not restore exactly one active pitch");
  assert.equal(await rows.first().getAttribute("data-note-id"), touchDraggedId, "project import changed the active pitch");

  assert.deepEqual(errors,[],"pitch view emitted uncaught browser errors");
  await page.close();
}finally{
  await browser.close();
}
