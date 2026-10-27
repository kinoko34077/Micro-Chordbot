import assert from "node:assert/strict";
import {chromium} from "playwright";

const browser = await chromium.launch({headless: true});
try {
  for (const width of [320, 375, 390, 430, 640, 719, 720, 768, 799, 800, 834, 900, 1024, 1199, 1200, 1280, 1440, 1920]) {
    const page = await browser.newPage({viewport:{width,height:800},deviceScaleFactor:1});
    const errors = [];
    page.on("pageerror", (e)=>errors.push(String(e)));
    await page.goto("http://127.0.0.1:4173/", {waitUntil:"domcontentloaded"});
    const smallTextRoles = await page.evaluate(() => {
      const selectors = [".readout", ".panel-note", ".status-text", ".preset-id", ".composer-note",
        ".cell-meta", ".label-lead", ".inline-check", ".progression-columns", ".loop-inline"];
      return selectors.flatMap((selector) => [...document.querySelectorAll(selector)].map((node) => ({
        selector, text: node.textContent.trim().slice(0, 24),
        fontSize: Number.parseFloat(getComputedStyle(node).fontSize)
      }))).filter((entry) => entry.text);
    });
    for (const role of smallTextRoles) {
      assert.ok(role.fontSize >= 12,
        "small UI text is unreadable below 12px at " + width + ": " + JSON.stringify(role));
    }
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
      const pitchSearches = await page.evaluate(() => {
        const bounds = (selector) => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return {
            left: rect.left, right: rect.right, width: rect.width, height: rect.height,
            fontSize: Number.parseFloat(getComputedStyle(document.querySelector(selector)).fontSize)
          };
        };
        return {
          activeNotes: bounds("#activeNotesFilterInput"),
          presets: bounds("#pitchPresetFilterInput")
        };
      });
      for (const [name, input] of Object.entries(pitchSearches)) {
        assert.ok(input.width >= 140,
          "phone " + name + " search field remains too narrow at " + width + ": " + JSON.stringify(pitchSearches));
        assert.ok(input.left >= 0 && input.right <= width + 1,
          "phone " + name + " search field exceeds the viewport at " + width + ": " + JSON.stringify(pitchSearches));
        // A declared 40px box can measure 39.99997px after flex/grid subpixel layout.
        assert.ok(input.height >= 39.5 && input.fontSize >= 16,
          "phone " + name + " search field is too small to tap or triggers iOS focus zoom at " + width + ": " + JSON.stringify(pitchSearches));
      }
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
    if (width <= 640) {
      const toolbarControls = await page.evaluate(() => {
        const rect = (node) => {
          const r = node.getBoundingClientRect();
          return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };
        };
        const toolbar = document.querySelector(".progression-toolbar");
        return {
          toolbar: rect(toolbar),
          viewport: innerHeight,
          controls: ["#progPrevBtn", "#progCounter", "#progNextBtn", "#playProgBtn", "#stopProgBtn", "#progChunkSelect", "#progMenuToggleBtn"]
            .map((selector) => ({ selector, ...rect(document.querySelector(selector)) }))
        };
      });
      for (const control of toolbarControls.controls) {
        assert.ok(control.left >= toolbarControls.toolbar.left - 1 && control.right <= toolbarControls.toolbar.right + 1,
          "mobile toolbar control is clipped at " + width + ": " + JSON.stringify({toolbarControls,control}));
        assert.ok(control.top >= 0 && control.bottom <= toolbarControls.viewport + 1,
          "mobile toolbar control is outside the initial viewport at " + width + ": " + JSON.stringify(control));
        assert.ok(control.height >= 39.5, "mobile toolbar touch target is too short at " + width + ": " + JSON.stringify(control));
      }
      assert.equal(await page.locator("#progChunkSelect").getAttribute("aria-label"), "チャンクを選択");
      assert.equal(await page.locator("#progMenuToggleBtn").getAttribute("aria-label"), "進行メニューを開く");
    }
    if (width > 640 && width < 1200) {
      const choiceBounds = await page.evaluate(() => {
        const box = (selector) => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return { left: r.left, right: r.right, width: r.width };
        };
        return {
          editor: box("#progressionEditor"),
          label: box(".progression-choice-tools .progression-filter-label"),
          input: box("#progChordTagFilterInput")
        };
      });
      assert.ok(choiceBounds.label.left >= choiceBounds.editor.left - 1 &&
        choiceBounds.label.right <= choiceBounds.editor.right + 1 &&
        choiceBounds.input.left >= choiceBounds.label.left - 1 &&
        choiceBounds.input.right <= choiceBounds.label.right + 1,
      "tablet chord search escapes its allocated edit row at " + width + ": " + JSON.stringify(choiceBounds));
    }
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
          chordSearchHeight: document.querySelector("#progChordTagFilterInput").getBoundingClientRect().height,
          firstChordChoicesBottom: Math.max(...[...document.querySelectorAll("#progChordButtonGrid button[data-chord-id]")]
            .slice(0, 3).map((button) => button.getBoundingClientRect().bottom)),
          viewport: innerHeight
        };
      });
      assert.ok(task.rootsBottom <= task.beatsTop + 2, "root and duration controls not adjacent/order mismatch " + width + " " + JSON.stringify(task));
      assert.ok(task.beatsTop <= task.chordTop + 2 && task.chordTop < task.voicingTop,
        "advanced controls displaced main editor " + width + " " + JSON.stringify(task));
      assert.ok(task.chordTop < task.viewport, "chord type selection outside first viewport " + width + " " + JSON.stringify(task));
      assert.ok(task.firstChordChoicesBottom <= task.viewport - 8,
        "first chord choices must fit with a visible margin at the phone viewport edge " + width + " " + JSON.stringify(task));
      assert.ok(task.chordSearchHeight >= 39.5,
        "chord search tap target is too small at " + width + " " + JSON.stringify(task));
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
      // Validate that an edited progression cell is an undoable, redoable action.
      const selectedChord = await page.locator("#progChordButtonGrid button.active").getAttribute("data-chord-id");
      const differentChord = page.locator("#progChordButtonGrid button[data-chord-id]").nth(1);
      const nextChord = await differentChord.getAttribute("data-chord-id");
      if (nextChord && nextChord !== selectedChord) {
        await differentChord.click();
        assert.ok(await page.locator('#progChordButtonGrid button[data-chord-id="' + nextChord + '"]').evaluate(el => el.classList.contains("active")),
          "chord edit did not apply at " + width);
        await page.locator("#undoBtn").click();
        assert.ok(await page.locator('#progChordButtonGrid button[data-chord-id="' + selectedChord + '"]').evaluate(el => el.classList.contains("active")),
          "undo did not restore progression chord at " + width);
        await page.locator("#redoBtn").click();
        assert.ok(await page.locator('#progChordButtonGrid button[data-chord-id="' + nextChord + '"]').evaluate(el => el.classList.contains("active")),
          "redo did not restore progression chord at " + width);
      }
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
      const shell = await page.evaluate(()=>{
        const bounds = (selector) => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return {left:rect.left,right:rect.right,width:rect.width};
        };
        const main = document.querySelector("main");
        return {
          display:getComputedStyle(main).display,
          columns:getComputedStyle(main).gridTemplateColumns.split(" ").filter(Boolean),
          viewport:window.innerWidth,
          mainWidth:main.getBoundingClientRect().width,
          pitch:bounds("#view-pitch"),
          progression:bounds("#view-progression"),
          toolbar:bounds(".progression-toolbar"),
          grid:bounds("#progressionGrid"),
          editor:bounds("#progressionEditor"),
          library:bounds(".chord-library-panel"),
          separator:getComputedStyle(document.querySelector('[data-workspace-resizer="pitch-progression"]')).display,
          separatorCount:document.querySelectorAll(".workspace-resizer").length
        };
      });
      assert.equal(shell.display,"grid","combined workspace missing at " + width);
      assert.equal(shell.columns.length,3,"desktop must have pitch, divider, and progression tracks at " + width + ": " + JSON.stringify(shell));
      assert.ok(shell.pitch.right < shell.progression.left,"pitch workspace must remain left of progression at " + width);
      for (const part of ["toolbar","grid","editor","library"]) {
        assert.ok(shell[part].left >= shell.progression.left - 1 && shell[part].right <= shell.progression.right + 1,
          part + " must stay inside the right progression workspace at " + width + ": " + JSON.stringify(shell));
      }
      assert.equal(shell.separator,"block","pitch/progression divider unavailable at " + width);
      assert.equal(shell.separatorCount,1,"desktop must have exactly one workspace divider at " + width);
      const libraryBeforeResize = await page.evaluate(() => {
        const panel = document.querySelector(".chord-library-panel").getBoundingClientRect();
        const details = document.querySelector("#chordLibraryDetails").getBoundingClientRect();
        const search = document.querySelector(".chord-library-search").getBoundingClientRect();
        const list = document.querySelector("#chordPresetList");
        const rect = list.getBoundingClientRect();
        return {
          panel:{top:panel.top,bottom:panel.bottom},
          search:{height:search.height},
          details:{top:details.top,bottom:details.bottom},
          list:{top:rect.top,bottom:rect.bottom,height:rect.height,clientHeight:list.clientHeight,scrollHeight:list.scrollHeight,overflowY:getComputedStyle(list).overflowY}
        };
      });
      assert.ok(libraryBeforeResize.list.height >= 48 && libraryBeforeResize.list.clientHeight > 0,
        "chord library list has no usable viewport at " + width + ": " + JSON.stringify(libraryBeforeResize));
      assert.equal(libraryBeforeResize.list.overflowY,"auto","chord library rows must scroll in their own list at " + width);
      assert.ok(libraryBeforeResize.search.height <= 40,
        "desktop chord library search occupies an unnecessary row at " + width + ": " + JSON.stringify(libraryBeforeResize));
      assert.ok(libraryBeforeResize.list.bottom <= libraryBeforeResize.details.bottom + 1 &&
        libraryBeforeResize.details.bottom <= libraryBeforeResize.panel.bottom + 1,
        "chord library content escapes its allocated region at " + width + ": " + JSON.stringify(libraryBeforeResize));
      if (libraryBeforeResize.list.scrollHeight > libraryBeforeResize.list.clientHeight) {
        const reachable = await page.locator("#chordPresetList").evaluate(node => {
          node.scrollTop = node.scrollHeight;
          return node.scrollTop > 0;
        });
        assert.equal(reachable,true,"chord library list cannot reach its final rows at " + width);
      }
      const beforeResize = await page.evaluate(() => ({
        pitchWidth:document.querySelector("#view-pitch").getBoundingClientRect().width,
        selectedPart:document.querySelector("#progressionGrid .progression-cell.active")?.dataset.partId || null,
        root:document.querySelector("#progRootNoteInput").value
      }));
      const divider = await page.locator('[data-workspace-resizer="pitch-progression"]').boundingBox();
      await page.mouse.move(divider.x + divider.width / 2, divider.y + 80);
      await page.mouse.down();
      await page.mouse.move(divider.x + divider.width / 2 + 64, divider.y + 80, {steps:4});
      await page.mouse.up();
      const afterResize = await page.evaluate(() => ({
        pitchWidth:document.querySelector("#view-pitch").getBoundingClientRect().width,
        selectedPart:document.querySelector("#progressionGrid .progression-cell.active")?.dataset.partId || null,
        root:document.querySelector("#progRootNoteInput").value,
        saved:JSON.parse(localStorage.getItem("uchordbot.workspaceColumns.v1") || "null")
      }));
      assert.ok(afterResize.pitchWidth >= beforeResize.pitchWidth + 50,
        "desktop divider drag did not resize pitch workspace at " + width + ": " + JSON.stringify({beforeResize,afterResize}));
      assert.equal(afterResize.selectedPart,beforeResize.selectedPart,"divider drag moved the selected progression target at " + width);
      assert.equal(afterResize.root,beforeResize.root,"divider drag changed the selected progression value at " + width);
      assert.ok(afterResize.saved?.left >= 280,"divider drag was not persisted at " + width);
      const mainRect = await page.locator("main").boundingBox();
      const minRightX = mainRect.x + mainRect.width - 480 - 8;
      await page.mouse.move(divider.x + divider.width / 2, divider.y + 80);
      await page.mouse.down();
      await page.mouse.move(minRightX, divider.y + 80, {steps:4});
      await page.mouse.up();
      const minimumWidthLayout = await page.evaluate(() => {
        const bounds = (selector) => {
          const rect = document.querySelector(selector).getBoundingClientRect();
          return {left:rect.left,right:rect.right,width:rect.width};
        };
        return {
          progression:bounds("#view-progression"),
          toolbar:bounds(".progression-toolbar"),
          grid:bounds("#progressionGrid"),
          editor:bounds("#progressionEditor"),
          library:bounds(".chord-library-panel")
        };
      });
      assert.ok(minimumWidthLayout.progression.width >= 470,
        "right workspace did not preserve its resize minimum at " + width + ": " + JSON.stringify(minimumWidthLayout));
      for (const part of ["toolbar","grid","editor","library"]) {
        assert.ok(minimumWidthLayout[part].left >= minimumWidthLayout.progression.left - 1 &&
          minimumWidthLayout[part].right <= minimumWidthLayout.progression.right + 1,
        part + " is clipped when progression workspace is resized to minimum at " + width + ": " + JSON.stringify(minimumWidthLayout));
      }
    }
    if (width <= 640) {
      const menu = page.locator("#progMenuToggleBtn");
      assert.equal(await menu.isVisible(), true, "mobile menu toggle missing at " + width);
      assert.equal(await menu.getAttribute("aria-label"), "進行メニューを開く");
      await menu.click();
      assert.equal(await menu.getAttribute("aria-label"), "進行メニューを閉じる");
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
    if (width <= 640) {
      assert.equal(await page.locator('[data-view="pitch"]').isVisible(),true,"pitch tab unavailable on phone at " + width);
      assert.equal(await page.locator('[data-view="progression"]').isVisible(),true,"progression tab unavailable on phone at " + width);
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
