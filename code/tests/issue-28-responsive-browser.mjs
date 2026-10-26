import assert from "node:assert/strict";
import {chromium} from "playwright";

const browser = await chromium.launch({headless: true});
try {
  for (const width of [320, 375, 390, 430, 640, 719, 720, 768, 799, 800, 900]) {
    const page = await browser.newPage({viewport:{width,height:800},deviceScaleFactor:1});
    const errors = [];
    page.on("pageerror", (e)=>errors.push(String(e)));
    await page.goto("http://127.0.0.1:4173/", {waitUntil:"domcontentloaded"});
    await page.locator('button[data-view="progression"]').click();
    await page.waitForTimeout(150);
    if (width < 800) {
      const shell = await page.evaluate(() => ({
        bodyOverflowY: getComputedStyle(document.body).overflowY,
        mainOverflow: getComputedStyle(document.querySelector("main")).overflow,
        progressionWidth: document.querySelector("#view-progression").getBoundingClientRect().width,
        viewportWidth: window.innerWidth,
        layoutDisplay: getComputedStyle(document.querySelector("#view-progression")).display
      }));
      assert.notEqual(shell.bodyOverflowY,"hidden","page scrolling blocked at " + width);
      assert.notEqual(shell.mainOverflow,"hidden","main content clipped at " + width);
      assert.ok(shell.progressionWidth <= shell.viewportWidth, "progression workspace wider than viewport at " + width);
      if (width > 640) assert.equal(shell.layoutDisplay,"block","intermediate tablet progression must use natural block flow at " + width);
    }
    const columnInput = page.locator("#progColumnsSelect");
    if (width >= 800) {
      const shell = await page.evaluate(()=>({
        display:getComputedStyle(document.querySelector("main")).display,
        viewport:window.innerWidth,
        mainWidth:document.querySelector("main").getBoundingClientRect().width,
        minimumPaneWidth: 220 + 8 + 220 + 8 + 280
      }));
      assert.equal(shell.display,"grid","combined workspace missing at " + width);
      assert.ok(shell.mainWidth>=shell.minimumPaneWidth,"combined workspace narrower than minimum panes at "+width);
    }
    if (width <= 640) {
      const menu = page.locator("#progMenuToggleBtn");
      assert.equal(await menu.isVisible(), true, "mobile menu toggle missing at " + width);
      await menu.click();
      assert.equal(await page.locator("#progToolbarActions").isVisible(), true, "menu clipped or hidden at " + width);
      const menuDisplay = await page.locator("#progToolbarActions").evaluate(e=>getComputedStyle(e).display);
      assert.equal(menuDisplay,"flex","opened menu must preserve the base flex layout at " + width);
      await menu.click();
      assert.equal(await page.locator("#progToolbarActions").isVisible(),false,"menu did not close at " + width);
      await menu.click();
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
    if (width < 800) {
      const viewport = await page.evaluate(()=>({
        scrollWidth: document.documentElement.scrollWidth,
        width: document.documentElement.clientWidth,
        activeViewScroll: document.querySelector("#view-progression").scrollWidth
      }));
      assert.ok(viewport.scrollWidth <= viewport.width+1,
        "horizontal document overflow at " + width + ": " + JSON.stringify(viewport));
    }
    assert.deepEqual(errors,[],"browser script error at " + width);
    await page.close();
  }
  // Landscape and reduced-height keyboard-like viewports must retain reachable controls.
  for (const size of [{width:667,height:375},{width:844,height:390},{width:390,height:430}]) {
    const page = await browser.newPage({viewport:size});
    const errors=[];
    page.on("pageerror",e=>errors.push(String(e)));
    await page.goto("http://127.0.0.1:4173/",{waitUntil:"domcontentloaded"});
    await page.locator('button[data-view="progression"]').click();
    const access = await page.evaluate(()=>({
      width:document.documentElement.clientWidth,
      scroll:document.documentElement.scrollWidth,
      menu:document.querySelector("#progMenuToggleBtn").getBoundingClientRect().width,
      toolbar:document.querySelector(".progression-toolbar").getBoundingClientRect().width,
      pageOverflow:getComputedStyle(document.body).overflowY
    }));
    if (size.width<800) {
      assert.ok(access.scroll<=access.width+1,"landscape horizontal overflow: "+JSON.stringify(size));
      assert.notEqual(access.pageOverflow,"hidden","keyboard height blocks page scroll");
    }
    if(size.width<=640) {
      await page.locator("#progMenuToggleBtn").click();
      assert.equal(await page.locator("#progToolbarActions").isVisible(),true);
    }
    assert.deepEqual(errors,[]);
    await page.close();
  }
} finally {
  await browser.close();
}
