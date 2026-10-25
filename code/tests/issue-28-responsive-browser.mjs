import assert from "node:assert/strict";
import {chromium} from "playwright";

const browser = await chromium.launch({headless: true});
try {
  for (const width of [320, 375, 390, 430, 640, 719, 720, 768]) {
    const page = await browser.newPage({viewport:{width,height:800},deviceScaleFactor:1});
    const errors = [];
    page.on("pageerror", (e)=>errors.push(String(e)));
    await page.goto("http://127.0.0.1:4173/", {waitUntil:"domcontentloaded"});
    await page.locator('button[data-view="progression"]').click();
    await page.waitForTimeout(150);
    const columnInput = page.locator("#progColumnsSelect");
    if (width <= 640) {
      const menu = page.locator("#progMenuToggleBtn");
      assert.equal(await menu.isVisible(), true, "mobile menu toggle missing at " + width);
      await menu.click();
      assert.equal(await page.locator("#progToolbarActions").isVisible(), true, "menu clipped or hidden at " + width);
      const clip = await page.locator(".progression-toolbar").evaluate(e=>getComputedStyle(e).overflow);
      assert.notEqual(clip,"hidden","mobile menu parent clips at " + width);
    } else {
      assert.equal(await page.locator("#progToolbarActions").isVisible(), true, "desktop toolbar hidden at " + width);
    }
    await columnInput.fill("3");
    await columnInput.dispatchEvent("change");
    const columns = await page.locator("#view-progression").evaluate(e=>getComputedStyle(document.documentElement).getPropertyValue("--progression-columns").trim());
    assert.equal(columns,"3","column selection not applied at " + width);
    const grid = page.locator(".progression-chunk-grid").first();
    if (await grid.count()) {
      const tracks = await grid.evaluate(e=>getComputedStyle(e).gridTemplateColumns.split(" ").filter(Boolean).length);
      assert.equal(tracks,3,"rendered track count mismatched at " + width);
    }
    if (width <= 640) {
      const editor = page.locator("#progEditorToggleBtn");
      const before = await page.locator("#progressionEditorBody").isVisible();
      await editor.click();
      const after = await page.locator("#progressionEditorBody").isVisible();
      assert.notEqual(after,before,"editor disclosure not toggled at " + width);
    }
    assert.deepEqual(errors,[],"browser script error at " + width);
    await page.close();
  }
} finally {
  await browser.close();
}
