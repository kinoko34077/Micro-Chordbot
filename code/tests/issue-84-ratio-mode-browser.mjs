import assert from "node:assert/strict";
import {chromium} from "playwright";

const browser=await chromium.launch({headless:true});
try{
  for(const width of [320,390,768]){
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
    const menu=page.locator("#settingsMenuBtn");
    await menu.waitFor();
    await menu.click();
    const link=page.locator(".settings-ratio-link");
    assert.equal(await link.count(),1,"menu must expose ratio-mode link");
    await link.click();
    await page.waitForURL("**/ratio-mode/");
    await page.locator(".chord-card").first().waitFor();
    const layout=await page.evaluate(()=>{
      const cards=[...document.querySelectorAll(".chord-card")].slice(0,3).map(x=>x.getBoundingClientRect());
      const editor=document.querySelector(".editor").getBoundingClientRect();
      const timeline=document.querySelector(".timeline");
      return {x:cards.map(x=>x.x),y:cards.map(x=>x.y),editorBottom:editor.bottom,windowHeight:innerHeight,docWidth:document.documentElement.scrollWidth,windowWidth:innerWidth,scrollWidth:timeline.scrollWidth,clientWidth:timeline.clientWidth};
    });
    assert.ok(layout.x[0]<layout.x[1]&&layout.x[1]<layout.x[2],"chord boxes not horizontally arranged: "+JSON.stringify(layout));
    assert.ok(Math.max(...layout.y)-Math.min(...layout.y)<3,"chord boxes unexpectedly vertically stacked");
    assert.ok(layout.docWidth<=width+2,"document horizontal overflow at "+width+": "+JSON.stringify(layout));
    assert.ok(layout.scrollWidth>layout.clientWidth,"timeline should own horizontal scrolling");
    assert.ok(await page.locator("#editPitch").isVisible(),"selected code must have editing field");
    await page.locator(".chord-card").first().click();
    await page.locator("#editPitch").fill("D‡5");
    await page.locator("#editPitch").dispatchEvent("change");
    assert.equal(await page.locator(".chord-card").first().locator(".base-note").innerText(),"D‡5");
    await page.locator("#editExpr").fill("6,4,5");
    await page.locator("#editExpr").dispatchEvent("change");
    await page.locator("#preview").click();
    await page.waitForFunction(()=>window.__ratioStarted.length>=3);
    const started=await page.evaluate(()=>window.__ratioStarted.slice(0,3));
    const base=440*Math.pow(2,((-9+12+2.5)/12)); // D‡5: A4 -> D5 + 50 cents.
    for(let i=0;i<3;i++){
      const expected=base*[1,1.25,1.5][i];
      assert.ok(Math.abs(started[i]-expected)<0.02,"wrong audio pitch: "+JSON.stringify({started,expected}));
    }
    await page.locator("#stop").click();
    await page.locator("#editPitch").fill("H4");
    await page.locator("#editPitch").dispatchEvent("change");
    assert.equal(await page.locator("#editPitch").getAttribute("aria-invalid"),"true","invalid note was accepted");
    assert.equal(await page.locator(".chord-card").first().locator(".base-note").innerText(),"D‡5","invalid edit destroyed last good value");
    await page.locator("#editPitch").fill("Bd6");
    await page.locator("#editPitch").dispatchEvent("change");
    await page.locator("#openIO").click();
    const exported=await page.locator("#ioText").inputValue();
    assert.ok(exported.includes("Bd6")&&exported.includes("[A x2]"),"text export lost pitch or section");
    await page.locator("#ioImport").click();
    assert.match(await page.locator("#ioStatus").innerText(),/読み込みました/);
    await page.locator("#ioClose").click();
    await page.locator("#undo").click();
    assert.ok(await page.locator("#editPitch").isVisible());
    assert.deepEqual(errors,[],"browser errors at "+width);
    console.log(JSON.stringify({width,layout,started,errors}));
    await page.close();
  }
}finally{await browser.close()}
