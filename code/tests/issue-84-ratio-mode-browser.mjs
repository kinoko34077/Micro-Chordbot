import assert from "node:assert/strict";
import {chromium} from "playwright";
import {mkdir} from "node:fs/promises";

const browser=await chromium.launch({headless:true});
try{
  for(const [width,height] of [[320,667],[320,844],[390,844],[430,932],[768,844],[1280,844]]){
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
    const errors=[];page.on("pageerror",error=>errors.push(String(error)));
    await page.addInitScript(()=>{
      window.__ratioStarted=[];
      window.__ratioAudioContexts=[];
      const NativeAudioContext=window.AudioContext;
      window.AudioContext=class extends NativeAudioContext{
        constructor(...args){super(...args);window.__ratioAudioContexts.push(this)}
      };
      const original=NativeAudioContext.prototype.createOscillator;
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
      const cells=[...document.querySelectorAll(".progression-chunk:first-child .progression-cell[data-cid]")].slice(0,3);
      const boxes=cells.map(el=>el.getBoundingClientRect());
      const editor=document.querySelector(".progression-editor").getBoundingClientRect();
      const track=document.querySelector("#timeline"),trackBox=track.getBoundingClientRect();
      const selectors=["#chunkJump","#sectionJump","#play","#stop","#newChunk","#newSection","#preview","#addStep","#editPitch"];
      const visibleControls=selectors.map(s=>{
        const el=document.querySelector(s),r=el.getBoundingClientRect();
        return {selector:s,x:r.x,right:r.right,width:r.width,top:r.top,bottom:r.bottom};
      });
      return {
        boxes:boxes.map(b=>({x:b.x,y:b.y,right:b.right,bottom:b.bottom})),
        effective:Number(track.dataset.columns),requested:Number(document.querySelector("#gridColumns").value),
        editorTop:editor.top,editorBottom:editor.bottom,timelineBottom:trackBox.bottom,
        inputRow:[...["#editExpr","#editPitch","#editBeats"]].map(s=>{
          const r=document.querySelector(s).getBoundingClientRect();return {selector:s,x:r.x,y:r.y,width:r.width,right:r.right};
        }),
        toolbarHeight:document.querySelector(".progression-toolbar").getBoundingClientRect().height,
        topbarHeight:document.querySelector(".topbar").getBoundingClientRect().height,
        presetBottom:document.querySelector("#presetChips").getBoundingClientRect().bottom,
        editorScrollHeight:document.querySelector(".progression-editor").scrollHeight,
        editorClientHeight:document.querySelector(".progression-editor").clientHeight,
        timelineHeight:trackBox.height,
        viewport:innerHeight,docWidth:document.documentElement.scrollWidth,windowWidth:innerWidth,
        scrollWidth:track.scrollWidth,clientWidth:track.clientWidth,
        controls:visibleControls
      };
    });
    const expectedCap=width<=640?Math.max(1,Math.floor((layout.clientWidth-16+6)/(116+6))):width<=950?Math.max(1,Math.floor((layout.clientWidth-16+6)/(104+6))):Math.max(1,Math.floor((layout.clientWidth-16+6)/(88+6)));
    assert.equal(layout.effective,Math.min(4,expectedCap),"responsive column count "+JSON.stringify(layout));
    assert.equal(layout.requested,4,"default should match ordinary μChordbot four-column preference");
    assert.ok(layout.boxes[0].x<layout.boxes[1].x,"first row should have adjacent chord cells "+JSON.stringify(layout));
    if(layout.effective>=3){
      assert.ok(layout.boxes[1].x<layout.boxes[2].x,"third card should remain on first row");
      assert.ok(Math.abs(layout.boxes[0].y-layout.boxes[2].y)<3);
    }else{
      assert.ok(layout.boxes[2].y>layout.boxes[0].y+20,"two-column phones must wrap the third chord onto next row");
      assert.ok(Math.abs(layout.boxes[0].x-layout.boxes[2].x)<3);
    }
    assert.ok(layout.docWidth<=width+2,"document horizontal overflow "+JSON.stringify(layout));
    assert.ok(layout.scrollWidth<=layout.clientWidth+2,"infinite horizontal track still present "+JSON.stringify(layout));
    assert.ok(layout.editorBottom<=layout.viewport+2,"editor overflows visible viewport "+JSON.stringify(layout));
    assert.ok(layout.editorTop>=layout.timelineBottom-2,"timeline obscured by editor "+JSON.stringify(layout));
    if(width<=640){
      assert.ok(layout.toolbarHeight<=60,"mobile transport wastefully spans multiple rows "+JSON.stringify(layout));
      assert.ok(layout.topbarHeight<=65,"mobile topbar uses redundant rows "+JSON.stringify(layout));
      assert.ok(layout.editorScrollHeight<=layout.editorClientHeight+2,"basic mobile editing still requires an extra nested scroll "+JSON.stringify(layout));
      assert.ok(layout.presetBottom<=layout.editorBottom+2,"preset options are hidden below the editor "+JSON.stringify(layout));
    }
    if(width>=1000)assert.ok(layout.timelineHeight>=245,"desktop timeline failed to use available height "+JSON.stringify(layout));
    if(width===390||width===430)
      assert.ok(layout.presetBottom<=layout.editorBottom+2,"normal phone preset choices hidden by editor scroller "+JSON.stringify(layout));
    for(const rect of layout.controls)assert.ok(rect.x>=-2&&rect.right<=width+2,"clipped core control "+JSON.stringify(rect)+" viewport "+width);
    assert.ok(Math.max(...layout.inputRow.map(r=>r.y))-Math.min(...layout.inputRow.map(r=>r.y))<=2,
      "ratio / pitch / beat fields are not on one row "+JSON.stringify(layout.inputRow));
    for(const rect of layout.inputRow)assert.ok(rect.width>35&&rect.right<=width+2,"input clipped "+JSON.stringify(rect));
    if(width>=1000)assert.ok(layout.inputRow[0].width<width*.4,"desktop ratio field too wide");
    assert.equal(await page.locator("#columnActual").count(),0,"redundant detached '4列' label remains");
    assert.equal(await page.locator("#chunkJump option").count(),1,"legacy progressions should start with one chunk");
    assert.equal(await page.locator("#sectionJump option").count(),2,"first chunk must contain sections A/B");
    const actionGeometry=await page.locator(".progression-cell-shell").first().evaluate(el=>{
      const cell=el.querySelector(".progression-cell").getBoundingClientRect();
      const remove=el.querySelector(".cell-remove").getBoundingClientRect();
      return {cellRight:cell.right,cellTop:cell.top,removeLeft:remove.left,removeRight:remove.right,removeTop:remove.top,removeBottom:remove.bottom};
    });
    assert.ok(actionGeometry.removeLeft>actionGeometry.cellRight-40 &&
      actionGeometry.removeRight<=actionGeometry.cellRight+1 &&
      actionGeometry.removeTop>=actionGeometry.cellTop &&
      actionGeometry.removeBottom<actionGeometry.cellTop+36,"code delete must overlay upper right, not add width "+JSON.stringify(actionGeometry));
    assert.equal(await page.locator(".preset-remove").count(),4,"preset delete should be in each card corner");
    const deleteSurface=await page.locator(".preset-item>.preset-remove").first()
      .evaluate(el=>getComputedStyle(el).backgroundColor);
    assert.equal(deleteSurface,"rgba(0, 0, 0, 0)","in-card X must not look like a separate filled button");
    const presetGeometry=await page.locator(".preset-item").first().evaluate(el=>{
      const a=el.querySelector(".ratio-preset").getBoundingClientRect(),b=el.querySelector(".preset-remove").getBoundingClientRect();
      return {cardRight:a.right,delRight:b.right,cardTop:a.top,delTop:b.top};
    });
    assert.ok(presetGeometry.delRight<=presetGeometry.cardRight+1&&presetGeometry.delTop>=presetGeometry.cardTop,"preset × not overlaid");
    assert.equal(await page.locator("#progressionEditor details").count(),0,"editor must not contain a stack of details toggles");
    const searchWidth=await page.locator("#presetSearch").evaluate(el=>el.getBoundingClientRect().width);
    assert.ok(searchWidth<=170,"search box wastes width: "+searchWidth);
    const manager=page.locator("#presetManager");
    assert.equal(await manager.getAttribute("open"),null,"destructive management controls should start collapsed");
    if(width<=950)await page.locator("#progMenuToggleBtn").click();
    if(width<=640){
      await page.locator("#masterVolumeMobile").evaluate(el=>{
        el.value="0.45";el.dispatchEvent(new Event("input",{bubbles:true}));
      });
      assert.equal(await page.locator("#masterVolume").inputValue(),"0.45","mobile slider did not update AudioEngine master control");
    }
    await page.locator("#gridColumns").fill("1");
    await page.locator("#gridColumns").dispatchEvent("change");
    assert.equal(await page.locator("#timeline").getAttribute("data-columns"),"1");
    const one=await page.locator(".progression-chunk:first-child .progression-cell[data-cid]").evaluateAll(nodes=>nodes.slice(0,2).map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y}}));
    assert.ok(Math.abs(one[0].x-one[1].x)<3&&one[1].y>one[0].y+20,"single-column setting did not wrap");
    await page.locator("#gridColumns").fill("12");
    await page.locator("#gridColumns").dispatchEvent("change");
    assert.equal(await page.locator("#timeline").getAttribute("data-columns"),String(Math.min(12,expectedCap)),"12-column setting must clamp on narrow devices");
    await page.locator("#gridColumns").fill("4");
    await page.locator("#gridColumns").dispatchEvent("change");
    if(width<=950)await page.locator("#progMenuToggleBtn").click();
    await mkdir("artifacts/issue-28-layout-audit",{recursive:true});
    await page.screenshot({path:"artifacts/issue-28-layout-audit/ratio-mode-"+width+"x"+height+".png"});
    assert.ok(await page.locator("#editPitch").isVisible(),"selected cell edit field not reachable");
    assert.ok(await page.locator("#progRootLetterButtons").isVisible(),"normal μChordbot root controls not transplanted");
    await page.evaluate(()=>window.__ratioStarted=[]);
    await cells.first().click();
    await page.waitForFunction(()=>window.__ratioStarted.length>=3);
    await cells.first().click();
    await page.waitForFunction(()=>window.__ratioStarted.length>=6);
    assert.ok(await cells.first().evaluate(el=>el.getAttribute("aria-pressed")==="true"));
    await page.locator("#stop").click();
    const ctxState=await page.evaluate(async()=>{
      const ctx=window.__ratioAudioContexts[0];if(!ctx)throw Error("no AudioContext");
      await ctx.suspend();return ctx.state;
    });
    assert.equal(ctxState,"suspended");
    await page.evaluate(()=>window.__ratioStarted=[]);
    await cells.first().click();
    await page.waitForFunction(()=>window.__ratioStarted.length>=3&&window.__ratioAudioContexts[0].state==="running");
    await page.locator("#stop").click();
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
    await page.locator("#editExpr").fill("4:11/2:6");
    await page.locator("#editExpr").dispatchEvent("change");
    await page.evaluate(()=>window.__ratioStarted=[]);
    await page.locator("#preview").click();
    await page.waitForFunction(()=>window.__ratioStarted.length>=3);
    const frac=await page.evaluate(()=>window.__ratioStarted.slice(0,3));
    for(let i=0;i<3;i++)assert.ok(Math.abs(frac[i]-base*[1,1.375,1.5][i])<.02,"fraction slash meaning broken: "+JSON.stringify(frac));
    await page.locator("#stop").click();
    await page.locator("#editExpr").fill("8:11:12");
    await page.locator("#editExpr").dispatchEvent("change");
    await page.evaluate(()=>window.__ratioStarted=[]);
    await page.locator("#preview").click();
    await page.waitForFunction(()=>window.__ratioStarted.length>=3);
    const equivalent=await page.evaluate(()=>window.__ratioStarted.slice(0,3));
    for(let i=0;i<3;i++)assert.ok(Math.abs(equivalent[i]-frac[i])<.02,"8:11:12 != 4:11/2:6");
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
    await page.evaluate(()=>window.__ratioStarted=[]);
    await cells.nth(1).click();
    await page.waitForFunction(()=>window.__ratioStarted.length>=3);
    assert.match(await page.locator("#play").innerText(),/再生中/,"tapping a card during playback stopped the progression");
    await page.locator("#stop").click();

    await page.locator("#presetSearch").fill("11th");
    assert.equal(await page.locator(".ratio-preset").count(),1,"preset search must filter candidates");
    await page.locator("#presetSearch").fill("");
    await page.locator("#progRootLetterButtons [data-note=G]").click();
    await page.locator('.ratio-accidentals [data-acc="‡"]').click();
    assert.match(await page.locator("#editPitch").inputValue(),/^G‡/,"transplanted root and quartertone controls not applied");
    await page.locator("#stop").click();
    await page.reload();
    assert.equal(await page.locator("#gridColumns").inputValue(),"4","column preference was not persisted");
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
    await page.locator("#openPresetManager").click();
    assert.ok(await page.locator("#presetManager").evaluate(el=>el.open),"ratio manager dialog did not open");
    await page.locator("#presetManageSelect").selectOption({label:"Major"});
    assert.equal(await page.locator("#presetName").inputValue(),"Major");
    await page.locator("#presetName").fill("Major2");
    await page.locator("#addPreset").click();
    assert.equal(await page.locator(".ratio-preset").filter({hasText:"Major2"}).count(),1,"preset rename must be reflected in candidate list");
    await page.locator("#closePresetManager").click();
    const renamed=page.locator(".preset-item").filter({hasText:"Major2"});
    assert.equal(await renamed.count(),1);
    const playCountBefore=await page.evaluate(()=>window.__ratioStarted.length);
    await renamed.locator(".preset-remove").click();
    assert.equal(await page.locator(".ratio-preset").filter({hasText:"Major2"}).count(),0,"corner preset delete did not remove candidate");
    assert.equal(await page.evaluate(()=>window.__ratioStarted.length),playCountBefore,"corner × accidentally triggered audition");
    const countBefore=await cells.count();
    await page.locator(".progression-cell-shell .cell-remove").first().click();
    assert.equal(await cells.count(),countBefore-1,"corner code delete did not remove a step");
    await page.locator("#undo").click();
    assert.equal(await cells.count(),countBefore,"code deletion cannot be undone");
    assert.ok(await page.locator("#editPitch").isVisible());
    await page.locator("#newChunk").click();
    assert.equal(await page.locator("#chunkJump option").count(),2,"new chunk not selectable");
    assert.equal(await cells.count(),1,"new chunk should start with one section/one chord");
    await page.locator("#newSection").click();
    assert.equal(await page.locator(".ratio-section-group").count(),2,"new section not created inside selected chunk");
    assert.equal(await page.locator("#sectionJump option").count(),2);
    await page.locator(".progression-chunk-head").click();
    assert.ok(await page.locator("#chunkDetails").evaluate(el=>el.open),"chunk editor must open");
    await page.locator("#editChunkName").fill("間奏");
    await page.locator("#editChunkName").dispatchEvent("change");
    await page.locator("#closeChunkEditor").click();
    assert.equal(await page.locator("#chunkJump option").last().innerText(),"間奏","chunk rename did not persist");
    await page.locator("#chunkJump").selectOption({label:"チャンク 1"});
    assert.equal(await cells.count(),5,"switching chunk must show all original chord cells");
    await page.locator("#chunkJump").selectOption({label:"間奏"});
    assert.equal(await cells.count(),2,"switching chunk must show its own chord cells only");
    if(width<=950)await page.locator("#progMenuToggleBtn").click();
    await page.locator("#playChunk").click();
    await page.waitForFunction(()=>document.querySelectorAll(".progression-cell.playing").length===1);
    await page.locator("#stop").click();
    if(width<=950)await page.locator("#progMenuToggleBtn").click();
    await page.locator("#openIO").click();
    assert.match(await page.locator("#ioText").inputValue(),/@chunk チャンク 1/);
    assert.match(await page.locator("#ioText").inputValue(),/@chunk 間奏/);
    await page.locator("#ioClose").click();
    await page.reload();
    assert.equal(await page.locator("#chunkJump option").count(),2,"chunk hierarchy lost on reload");
    assert.equal(await page.locator("#chunkJump").inputValue(),await page.locator("#chunkJump option").last().getAttribute("value"),"active chunk lost on reload");
    await page.screenshot({path:"artifacts/issue-28-layout-audit/ratio-mode-"+width+"x"+height+"-edited.png"});
    await page.locator(".progression-chunk-head").click();
    await page.locator("#removeChunk").click();
    assert.equal(await page.locator("#chunkJump option").count(),1,"chunk deletion left orphaned selectors");
    assert.equal(await page.locator("#chunkJump option").first().innerText(),"チャンク 1","deleting active chunk should select a neighboring chunk");
    await page.locator("#undo").click();
    assert.equal(await page.locator("#chunkJump option").count(),2,"deleted chunk must be undoable");
    await page.reload();
    assert.equal(await page.locator("#chunkJump option").count(),2,"undo must restore chunk in storage");
    assert.deepEqual(errors,[],"browser errors "+width);
    console.log(JSON.stringify({width,height,layout,started,errors}));
    await page.close();
  }
}finally{await browser.close()}
