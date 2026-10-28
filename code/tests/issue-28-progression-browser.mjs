import assert from "node:assert/strict";
import {chromium} from "playwright";

const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1});
  const errors = [];
  page.on("pageerror", error=>errors.push(String(error)));
  await page.goto("http://127.0.0.1:4173/", {waitUntil:"domcontentloaded"});
  await page.locator('button[data-view="progression"]').click();
  await page.locator("#progMenuToggleBtn").click();
  const columns = page.locator("#progColumnsSelect");
  await columns.fill("1");
  await columns.dispatchEvent("change");
  await page.locator("#progMenuToggleBtn").click();
  await page.locator("#progChordButtonGrid button[data-chord-id]").first().click();
  const addPart = page.locator("#addProgPartBtn");
  const grid = page.locator("#progressionGrid");
  const cells = page.locator("#progressionGrid .progression-cell");
  const initialCount = await cells.count();
  for (let i=0;i<16;i++) await addPart.click();
  const cellCount = await cells.count();
  assert.equal(cellCount,initialCount+16,"progression fixture should add sixteen editable cells");
  const before = await grid.evaluate(node=>{
    node.scrollTop=node.scrollHeight;
    return {scrollTop:node.scrollTop,scrollHeight:node.scrollHeight,clientHeight:node.clientHeight};
  });
  assert.ok(before.scrollTop > 0,"long progression did not create an internal scroll range");
  const target = cells.nth(14);
  const targetId = await target.getAttribute("data-part-id");
  const rect = await target.boundingBox();
  const gridRect = await grid.boundingBox();
  assert.ok(rect && gridRect && rect.y >= gridRect.y && rect.y+rect.height <= gridRect.y+gridRect.height,
    "target cell should be visible before selection");
  await target.click();
  await page.waitForFunction(id=>document.querySelector(".progression-cell.active")?.dataset.partId===id,targetId);
  const after = await grid.evaluate(node=>({scrollTop:node.scrollTop,scrollHeight:node.scrollHeight,clientHeight:node.clientHeight}));
  assert.ok(Math.abs(after.scrollTop-before.scrollTop)<=1,
    "selecting a visible progression cell must preserve the grid scroll position: "+JSON.stringify({before,after}));
  assert.equal(await page.locator(".progression-cell.active").getAttribute("data-part-id"),targetId,
    "selection must remain on the tapped cell after rerender");
  assert.deepEqual(errors,[],"progression selection emitted uncaught browser errors");
  console.log(JSON.stringify({viewport:"390x844",cells:await cells.count(),before,after,selected:targetId}));
  await page.close();
} finally {
  await browser.close();
}
