import assert from "node:assert/strict";
import {chromium} from "playwright";
import {mkdir} from "node:fs/promises";

const browser=await chromium.launch({headless:true});
try{
  for(const width of [320,390,768,1280]){
    const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:1});
    const errors=[];page.on("pageerror",error=>errors.push(String(error)));
    await page.addInitScript(()=>{
      window.__ratioStarted=[];
      const original=AudioContext.prototype.createOscillator;
      AudioContext.prototype.createOscillator=function(...args){
        const osc=original.apply(this,args),start=osc.start.bind(osc);
        osc.start=function(...values){
          window.__ratioStarted.push(osc.frequency.value);
          return start(...values);
        };
        return osc;
      };
    });
    await page.goto("http://127.0.0.1:4173/",{waitUntil:"domcontentloaded"});
    await page.locator("#settingsMenuBtn").click();
    const link=page.locator(".settings-ratio-link");
    assert.equal(await link.count(),1,"standard menu must still expose ratio mode");
    await link.click();await page.waitForURL("**/ratio-mode/");
    const cells=page.locator(".progression-cell[data-cid]");
    await cells.first().waitFor();
    assert.ok(await cells.count()>=5);
    const layout=await page.evaluate(()=>{
      const boxes=[...document.querySelectorAll(".progression-cell[data-cid]")].slice(0,3).map(x=>x.getBoundingClientRect());
      const editor=document.querySelector(".progression-editor").getBoundingClientRect();
      const track=document.querySelector("#timeline");
      return {x:boxes.map(x=>x.x),y:boxes.map(x=>x.y),editorTop:editor.top,editorBottom:editor.bottom,timelineBottom:track.getBoundingClientRect().bottom,viewport:innerHeight,docWidth:document.documentElement.scrollWidth,windowWidth:innerWidth,scrollWidth:track.scrollWidth,clientWidth:track.clientWidth};
    });
    assert.ok(layout.x[0]<layout.x[1]&&layout.x[1]<layout.x[2],"native progression cells must run horizontally "+JSON.stringify(layout));
    assert.ok(Math.max(...layout.y)-Math.min(...layout.y)<4,"three chord cells should share timeline y "+JSON.stringify(layout));
    assert.ok(layout.docWidth<=width+2,"document-level overflow "+JSON.stringify(layout));
    if(width<800)assert.ok(layout.scrollWidth>layout.clientWidth,"progression timeline must own horizontal scrolling");
    assert.ok(layout.editorBottom<=layout.viewport+2,"editor must remain within visible viewport "+JSON.stringify(layout));
    assert.ok(layout.editorTop>=layout.timelineBottom-2,"timeline must not be obscured by editor "+JSON.stringify(layout));
    await mkdir("artifacts/issue-28-layout-audit",{recursive:true});
    await page.screenshot({path:"artifacts/issue-28-layout-audit/ratio-mode-"+width+".png"});
    assert.ok(await page.locator("#editPitch").isVisible(),"selected cell edit field not reachable");
    assert.ok(await page.locator("#progRootLetterButtons").isVisible(),"normal μChordbot root controls not transplanted");
    await cells.first().click();
    await page.locator("#editPitch").fill("D‡5");
    await page.locator("#editPitch").dispatchEvent("change");
    assert.equal(await cells.first().locator(".cell-note").innerText(),"D‡5");
    await page.locator("#editExpr").fill("6,4,5");
    await page.locator("#editExpr").dispatchEvent("change");
    await page.locator("#stop").click();
    await page.evaluate(()=>window.__ratioStarted=[]);
    await page.locator("#preview").click();
    await page.waitForFunction(()=>window.__ratioStarted.length>=3);
    const started=await page.evaluate(()=>window.__ratioStarted.slice(0,3));
    const base=440*Math.pow(2,((-9+12+2.5)/12));
    for(let i=0;i<3;i++)assert.ok(Math.abs(started[i]-base*[1,1.25,1.5][i])<.02,"wrong ratio voice "+JSON.stringify(started));
    await page.locator("#stop").click();

    // Imported normal progression transport: start from the selected second chord,
    // not the first chord or the first chord of section A.
    await cells.nth(1).click();
    await page.locator("#play").click();
    await page.waitForFunction(()=>document.querySelectorAll(".progression-cell.playing[data-cid]").length===1);
    assert.ok(await cells.nth(1).evaluate(e=>e.classList.contains("playing")),"selected-code play did not start from second cell");
    assert.match(await page.locator("#play").innerText(),/再生中/);
    // Editing the sounding cell must keep transport running; the earlier version stopped.
    await page.locator("#editPitch").fill("G4");
    await page.locator("#editPitch").dispatchEvent("change");
    assert.match(await page.locator("#play").innerText(),/再生中/,"editing the selected playing chord stopped transport");
    assert.ok(await cells.nth(1).evaluate(e=>e.classList.contains("playing")));
    await page.locator("#stop").click();

    await page.locator("#presetSearch").fill("11th");
    assert.equal(await page.locator(".ratio-preset").count(),1,"preset search must filter candidates");
    await page.locator("#presetSearch").fill("");
    await page.locator("#progRootLetterButtons [data-note=G]").click();
    await page.locator('.ratio-accidentals [data-acc="‡"]').click();
    assert.match(await page.locator("#editPitch").inputValue(),/^G‡/,"transplanted root and quartertone controls not applied");
    await page.locator("#stop").click();
    await page.reload();
    assert.match(await page.locator("#selectionLabel").innerText(),/A \/ 2/,"selected chord lost on reload");
    await page.locator("#editPitch").fill("H4");
    await page.locator("#editPitch").dispatchEvent("change");
    assert.equal(await page.locator("#editPitch").getAttribute("aria-invalid"),"true");
    assert.match(await page.locator(".progression-cell[data-cid]").nth(1).locator(".cell-note").innerText(),/^G‡/);
    await page.locator("#editPitch").fill("Bd6");
    await page.locator("#editPitch").dispatchEvent("change");
    await page.locator("#openIO").click();
    const exported=await page.locator("#ioText").inputValue();
    assert.ok(exported.includes("Bd6")&&exported.includes("[A x2]"));
    await page.locator("#ioImport").click();
    assert.match(await page.locator("#ioStatus").innerText(),/読み込みました/);
    await page.locator("#ioClose").click();
    await page.locator("#undo").click();
    assert.ok(await page.locator("#editPitch").isVisible());
    await page.screenshot({path:"artifacts/issue-28-layout-audit/ratio-mode-"+width+"-edited.png"});
    assert.deepEqual(errors,[],"browser errors "+width);
    console.log(JSON.stringify({width,layout,started,errors}));
    await page.close();
  }
}finally{await browser.close()}
