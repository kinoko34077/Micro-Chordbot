import assert from "node:assert/strict";
import {chromium} from "playwright";

const browser = await chromium.launch({headless: true});
try {
  for (const width of [320, 375, 390, 430, 640, 719, 720, 768, 799, 800, 834, 900, 1024, 1199, 1200, 1280, 1440, 1920]) {
    const page = await browser.newPage({viewport:{width,height:800},deviceScaleFactor:1});
    const errors = [];
    page.on("pageerror", (e)=>errors.push(String(e)));
    await page.goto("http://127.0.0.1:4173/", {waitUntil:"domcontentloaded"});
    if (width <= 640) {
      const header = await page.evaluate(() => {
        const bounds = (selector) => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height};
        };
        return {
          topbar: bounds(".topbar"),
          navigation: bounds(".view-nav"),
          tools: bounds(".history-buttons"),
          undo: bounds("#undoBtn"),
          redo: bounds("#redoBtn"),
          volume: bounds(".master-volume-inline"),
          menu: bounds("#settingsMenuBtn")
        };
      });
      assert.ok(header.topbar.height <= 140, "phone header exceeds first-viewport budget at " + width + ": " + JSON.stringify(header));
      assert.ok(header.navigation.bottom <= header.tools.top + 1, "navigation overlaps tools at " + width);
      for (const action of ["undo","redo","menu"]) {
        assert.ok(header[action].width >= 40 && header[action].height >= 40, "header action too small at " + width + ": " + action);
      }
      assert.ok(header.volume.width >= 64, "volume becomes unreachable at " + width);
      assert.ok(header.tools.right <= width + 1, "header tools extend outside phone viewport at " + width);
      const pitchFold = await page.evaluate(() => {
        const toolbar = document.querySelector(".pitch-toolbar").getBoundingClientRect();
        const line = document.querySelector("#pitchLine").getBoundingClientRect();
        return {toolbarHeight: toolbar.height, lineTop: line.top, lineBottom: line.bottom, viewport: innerHeight};
      });
      assert.ok(pitchFold.toolbarHeight <= 180, "phone pitch controls are stacked beyond working height at " + width + ": " + JSON.stringify(pitchFold));
      assert.ok(pitchFold.lineTop < Math.min(400, pitchFold.viewport * 0.65),
        "pitch line not reachable in no-scroll initial viewport at " + width + ": " + JSON.stringify(pitchFold));
    }
    if (width < 1200) {
      const visibleOnly = async (selected) => {
        for (const name of ["pitch", "progression"]) {
          const actual = await page.locator("#view-" + name).evaluate((el) => getComputedStyle(el).display);
          assert.equal(actual === "none", name !== selected,
            "view visibility mismatch at " + width + ": " + selected + "/" + name + " display=" + actual);
        }
      };
      await visibleOnly("pitch");
    }
    await page.locator('button[data-view="progression"]').click();
    await page.waitForTimeout(150);
    if (width < 1200) {
      for (const name of ["pitch"]) {
        const display = await page.locator("#view-" + name).evaluate(el => getComputedStyle(el).display);
        assert.equal(display, "none", "inactive view leaked on progression tab at " + width + ": " + name);
      }
    }
    if (width < 1200) {
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
      if (width > 640 && width < 820) assert.equal(shell.layoutDisplay,"block","narrow tablets must use natural block flow at " + width);
      if (width >= 820) assert.equal(shell.layoutDisplay,"grid","wide tablets must use a two-column progression workspace at " + width);
    }
    if (width <= 640) {
      const task = await page.evaluate(() => {
        const top = (sel) => document.querySelector(sel)?.getBoundingClientRect().top ?? -1;
        const bottom = (sel) => document.querySelector(sel)?.getBoundingClientRect().bottom ?? -1;
        return {
          rootsBottom: bottom("#progRootLetterButtons"),
          beatsTop: top(".beat-token"),
          voicingTop: top(".progression-voice-row"),
          chordTop: top("#progChordButtonGrid"),
          viewport: innerHeight
        };
      });
      assert.ok(task.rootsBottom <= task.beatsTop + 2, "root and duration controls not adjacent/order mismatch " + width + " " + JSON.stringify(task));
      assert.ok(task.beatsTop <= task.chordTop + 2 && task.chordTop < task.voicingTop,
        "advanced controls displaced main editor " + width + " " + JSON.stringify(task));
      assert.ok(task.chordTop < task.viewport, "chord type selection outside first viewport " + width + " " + JSON.stringify(task));
      await page.locator("#progressionGrid .progression-cell").first().click();
      // Verify primary editor actions actually change their selected state.
      await page.locator('#progRootLetterButtons button[data-note="G"]').click();
      assert.equal(await page.locator('#progRootLetterButtons button[data-note="G"]').getAttribute("class"), "active",
        "root selection did not update at " + width);
      await page.locator("#progBeatsNumeratorInput").fill("3");
      await page.locator("#progBeatsNumeratorInput").dispatchEvent("change");
      assert.equal(await page.locator("#progBeatsNumeratorInput").inputValue(), "3",
        "duration selection did not persist in editor at " + width);
      const chordChoices = page.locator("#progChordButtonGrid button[data-chord-id]");
      assert.ok(await chordChoices.count() > 0, "chord choices not populated at " + width);
      const pickedChordId = await chordChoices.first().getAttribute("data-chord-id");
      await chordChoices.first().click();
      const chosenState = await page.evaluate((id) => ({
        candidate: id,
        active: [...document.querySelectorAll("#progChordButtonGrid button.active")].map(el => el.dataset.chordId),
        selectedCell: document.querySelector("#progressionGrid .progression-cell.active")?.dataset.partId,
        status: document.querySelector("#progStatus")?.textContent,
        root: document.querySelector("#progRootNoteInput")?.value,
        octave: document.querySelector("#progRootOctaveInput")?.value,
        beats: document.querySelector("#progBeatsNumeratorInput")?.value,
        pickedName: document.querySelector(`#progChordButtonGrid button[data-chord-id="${id}"]`)?.textContent,
        cell: document.querySelector("#progressionGrid .progression-cell.active")?.textContent
      }), pickedChordId);
      assert.ok(chosenState.active.includes(pickedChordId),
        "chord choice not selected at " + width + ": " + JSON.stringify(chosenState));
      const bassPanel = page.locator("#progBassPopover");
      assert.equal(await bassPanel.isVisible(), false, "secondary Bass panel should be collapsed on phone");
      await page.locator("#progBassPopoverBtn").click();
      assert.equal(await bassPanel.isVisible(), true, "Bass options cannot be opened");
      assert.equal(await page.locator("#progBassPopoverBtn").getAttribute("aria-expanded"), "true");
      await page.locator("#progInversionPopoverBtn").click();
      assert.equal(await page.locator("#progInversionPopover").isVisible(), true, "inversion options cannot be opened");
      assert.equal(await bassPanel.isVisible(), false, "switching secondary panel leaves Bass overlay visible");
    }
    const libraryFilter = page.locator("#chordTagFilterInput");
    assert.equal(await libraryFilter.isVisible(), true, "library search is hidden at " + width);
    const detailPanel = page.locator("#chordLibraryDetails");
    if (width <= 640) {
      assert.equal(await detailPanel.evaluate(el => el.open), false, "phone chord detail list should start collapsed at " + width);
      await libraryFilter.fill("core");
      assert.equal(await detailPanel.evaluate(el => el.open), true, "search did not reveal detailed results at " + width);
      await libraryFilter.fill("missing_chord_test_token");
      assert.equal(await page.locator("#chordPresetList tbody tr[data-chord-preset-id]").count(), 0, "library result filtering failed at " + width);
      await libraryFilter.fill("");
    }
    const columnInput = page.locator("#progColumnsSelect");
    if (width >= 1200) {
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
      const layout = await grid.evaluate(e => {
        const container = document.querySelector("#progressionGrid");
        const chunk = e.closest(".progression-chunk");
        const tracks = getComputedStyle(e).gridTemplateColumns.split(" ").filter(Boolean);
        return {tracks, container:container.getBoundingClientRect().width,
          chunk:chunk.getBoundingClientRect().width,
          grid:e.getBoundingClientRect().width};
      });
      assert.equal(layout.tracks.length,3,"rendered track count mismatched at " + width);
      assert.ok(Math.abs(layout.container-layout.grid)<3,
        "progression columns do not use the full available width at "+width+": "+JSON.stringify(layout));
      assert.ok(Math.abs(layout.chunk-layout.grid)<3,
        "chunk has unexplained trailing whitespace at "+width+": "+JSON.stringify(layout));
      assert.ok(Math.abs(Math.max(...layout.tracks.map(parseFloat))-Math.min(...layout.tracks.map(parseFloat)))<2,
        "progression column widths are uneven at "+width+": "+JSON.stringify(layout));
    }
    if (width <= 640) {
      // The 1–12 column setting is user-owned even at phone widths.
      // Verify extremes do not hide editor/menu or overflow the document.
      for (const count of [1,12]) {
        await columnInput.fill(String(count));
        await columnInput.dispatchEvent("change");
        if (await grid.count()) {
          const columnsAtExtreme = await grid.evaluate(e => getComputedStyle(e).gridTemplateColumns.split(" ").filter(Boolean).length);
          assert.equal(columnsAtExtreme,count,"column contract at " + width);
        }
        const bounds = await page.evaluate(() => ({
          documentWidth: document.documentElement.scrollWidth,
          viewportWidth: document.documentElement.clientWidth,
          gridScrollWidth: document.querySelector("#progressionGrid").scrollWidth,
          gridClientWidth: document.querySelector("#progressionGrid").clientWidth
        }));
        assert.ok(bounds.documentWidth <= bounds.viewportWidth + 1,
          "column count caused global overflow: " + width + "/" + count + " " + JSON.stringify(bounds));
      }
    }
    if (width <= 640) {
      const editor = page.locator("#progEditorToggleBtn");
      const before = await page.locator("#progressionEditorBody").isVisible();
      await editor.click();
      const after = await page.locator("#progressionEditorBody").isVisible();
      assert.notEqual(after,before,"editor disclosure not toggled at " + width);
    }
    if (width < 1200) {
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
