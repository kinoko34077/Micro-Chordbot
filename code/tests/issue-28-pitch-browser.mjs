import assert from "node:assert/strict";
import {chromium} from "playwright";

const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  const errors = [];
  page.on("pageerror", e=>errors.push(String(e)));
  await page.goto("http://127.0.0.1:4173/", {waitUntil:"domcontentloaded"});
  const presets = page.locator("#pitchPresetList tbody tr[data-pitch-preset-id]");
  await presets.first().waitFor({state:"visible",timeout:5000});
  const initialPresetCount = await presets.count();
  assert.ok(initialPresetCount > 0,"pitch library seed data not rendered");
  const searchText = (await presets.first().locator("td").nth(1).innerText()).trim();
  const search = page.locator("#pitchPresetFilterInput");
  assert.equal(await search.getAttribute("aria-label"),"音高プリセットを検索","pitch preset search needs an accessible name");
  await search.fill(searchText);
  await page.waitForTimeout(100);
  assert.ok(await presets.count() > 0,"pitch library search did not find its selected row");
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

  assert.deepEqual(errors,[],"pitch view emitted uncaught browser errors");
  await page.close();
}finally{
  await browser.close();
}
