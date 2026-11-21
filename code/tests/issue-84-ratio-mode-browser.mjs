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
    const setPitch=async value=>{
      await page.locator("#editPitch").dblclick();
      assert.equal(await page.locator("#editPitch").evaluate(el=>el.readOnly),false,"double must unlock pitch");
      await page.locator("#editPitch").fill(value);
      await page.locator("#editPitch").dispatchEvent("change");
      await page.locator("#editPitch").evaluate(el=>el.blur());
    };
    const setBeats=async value=>{
      await page.locator("#editBeats").dblclick();
      await page.locator("#editBeats").fill(value);
      await page.locator("#editBeats").dispatchEvent("change");
      await page.locator("#editBeats").evaluate(el=>el.blur());
    };
    await cells.first().waitFor();
    assert.ok(await cells.count()>=5);
    const layout=await page.evaluate(()=>{
      const cells=[...document.querySelectorAll(".progression-chunk:first-child .progression-cell[data-cid]")].slice(0,3);
      const boxes=cells.map(el=>el.getBoundingClientRect());
      const editor=document.querySelector(".progression-editor").getBoundingClientRect();
      const track=document.querySelector("#timeline"),trackBox=track.getBoundingClientRect();
      const selectors=["#chunkJump","#renameChunk","#removeChunk","#play","#stop","#newChunk","#newSection","#preview","#addStep","#editPitch"];
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
    for(const rect of layout.inputRow)assert.ok(rect.width>20&&rect.right<=width+2,"input clipped "+JSON.stringify(rect));
    if(width>=1000)assert.ok(layout.inputRow[0].width<width*.4,"desktop ratio field too wide");
    const positions=layout.inputRow.map(r=>r.x+r.width/2);
    assert.ok(Math.abs((positions[1]-positions[0])-(positions[2]-positions[1]))<15,
      "ratio, lowest note, beat controls must sit at even intervals "+JSON.stringify(positions));
    assert.equal(await page.locator("#columnActual").count(),0,"redundant detached '4列' label remains");
    assert.equal(await page.locator("#chunkJump option").count(),1,"legacy progressions should start with one chunk");
    assert.equal(await page.locator(".ratio-section-header").count(),2);
    assert.equal(await page.locator(".progression-chunk-head,#chunkDetails,#sectionDetails").count(),0,"duplicate title or modal remains");
    const playWidth=await page.locator("#play").evaluate(el=>el.getBoundingClientRect().width);
    assert.ok(playWidth<=80,"play button wastes space "+playWidth);
    assert.ok(layout.inputRow[1].width<=123,"pitch too wide "+layout.inputRow[1].width);
    assert.ok(layout.inputRow[2].width<=76,"beats too wide "+layout.inputRow[2].width);
    const columnWidths=await page.locator(".progression-root-row > label").evaluateAll(els=>
      els.map(el=>el.getBoundingClientRect().width));
    assert.ok(Math.max(...columnWidths)-Math.min(...columnWidths)<3,
      "ratio/pitch/beat should each own an equally spaced column: "+JSON.stringify(columnWidths));
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
    assert.equal(await page.locator("#presetManager").count(),0,"preset edit must never open a separate dialog");
    assert.equal(await page.locator("#presetInlineRow").isVisible(),false,"inline edit starts collapsed");
    assert.equal(await cells.first().locator(".cell-meta").innerText(),"4/4拍","card should show beats fraction, never ordinal");
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
    assert.equal(await page.locator("#progRootLetterButtons,.ratio-accidentals").count(),0,"old 12-button pitch deck remains");
    assert.equal(await page.locator("#pitchFlickGrid .pitch-flick-cell").count(),35,"flick must be 7 rows × 5 accidentals");
    assert.equal(await page.locator("#pitchFlickPanel").isVisible(),false,"flick panel must not occupy editor at rest");
    const lineStyle=await page.locator("#editPitch").evaluate(el=>{
      const s=getComputedStyle(el);return {top:s.borderTopWidth,left:s.borderLeftWidth,bottom:s.borderBottomWidth};
    });
    assert.equal(lineStyle.top,"0px","boxed values remain");
    assert.equal(lineStyle.left,"0px","boxed values remain");
    assert.equal(lineStyle.bottom,"1px","editing affordance underline missing");
    const smallAdd=await page.locator(".ratio-add-small").first().boundingBox();
    const normalCard=await cells.first().boundingBox();
    assert.ok(smallAdd.width<=34&&smallAdd.height<=32,"code-add still occupies a whole code cell");
    assert.ok(normalCard.height>smallAdd.height+15,"small add not distinguishable from data cell");
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
    // A slide selects pitch. The table reads B..C TOP to BOTTOM; moving UP raises pitch.
    await setPitch("B4");
    const beforeFlick=await page.locator("#editPitch").boundingBox();
    const fx=beforeFlick.x+beforeFlick.width*.5,fy=beforeFlick.y+beforeFlick.height*.5;
    assert.equal(await page.locator("#editPitch").evaluate(el=>el.readOnly),true,"single pitch input must be readOnly by default");
    const pitchRows=await page.locator("#pitchFlickGrid .pitch-flick-cell").evaluateAll(
      els=>[els[0].dataset.note,els[els.length-1].dataset.note]);
    assert.deepEqual(pitchRows,["B","C"],"higher notes should be physically above lower notes");
    await page.mouse.move(fx,fy);await page.mouse.down();
    assert.equal(await page.locator("#pitchFlickPanel").isVisible(),false,"pointerdown alone flashed pitch sheet");
    await page.mouse.up();
    assert.equal(await page.locator("#editPitch").inputValue(),"B4","tap selected pitch despite flick-only requirement");
    assert.equal(await page.locator("#editPitch").evaluate(el=>el.readOnly),true,"single click unlocked editable pitch text");
    await page.mouse.move(fx,fy);await page.mouse.down();
    await page.mouse.move(fx,fy-27,{steps:3});
    assert.equal(await page.locator("#editPitch").inputValue(),"C5","B4 UP did not wrap to C5");
    assert.ok(await page.locator("#pitchFlickPanel").isVisible());
    if(width===320||width===390)await page.screenshot({path:"artifacts/issue-28-layout-audit/ratio-flick-open-"+width+".png"});
    await page.mouse.move(fx,fy,{steps:3});
    assert.equal(await page.locator("#editPitch").inputValue(),"B4","C5 DOWN did not wrap back to B4");
    await page.mouse.move(fx+30,fy-27,{steps:3});
    assert.equal(await page.locator("#editPitch").inputValue(),"C‡5","horizontal half sharp selection failed");
    assert.equal(await page.locator("#pitchFlickGrid .selected").count(),1);
    await page.mouse.up();
    assert.equal(await page.locator("#editPitch").inputValue(),"C‡5","flick did not commit on finger release");
    assert.equal(await page.locator("#pitchFlickPanel").isVisible(),false);
    await page.locator("#undo").click();
    assert.equal(await page.locator("#editPitch").inputValue(),"B4","one Undo must undo the entire pitch gesture");
    await page.locator("#redo").click();
    assert.equal(await page.locator("#editPitch").inputValue(),"C‡5","one Redo must replay entire flick");
    // Fraction matrix: up/down edits numerator, left/right edits denominator.
    const beatsBox=await page.locator("#editBeats").boundingBox();
    const bx=beatsBox.x+beatsBox.width/2,by=beatsBox.y+beatsBox.height/2;
    await page.mouse.move(bx,by);await page.mouse.down();
    assert.equal(await page.locator("#beatsFlickPanel").isVisible(),false);
    await page.mouse.move(bx,by-8); // show without changing rounded candidate
    assert.equal(await page.locator("#beatsFlickGrid .beats-flick-cell").count(),16);
    const originCell=await page.locator("#beatsFlickGrid .beats-flick-cell").first().evaluate(
      el=>[el.dataset.num,el.dataset.den]);
    assert.deepEqual(originCell,["6","3"]);
    await page.mouse.move(bx,by-58,{steps:4});
    assert.equal(await page.locator("#editBeats").inputValue(),"6/4","two rows down should increase numerator only");
    assert.equal(await page.locator("#beatsFlickGrid .selected").innerText(),"6/4");
    await page.mouse.move(bx+33,by-58,{steps:3});
    assert.equal(await page.locator("#editBeats").inputValue(),"6/5","rightward should increase denominator only");
    await page.mouse.up();
    await page.locator("#undo").click();
    assert.equal(await page.locator("#editBeats").inputValue(),"4/4","one Undo restores both numerator and denominator");
    await page.locator("#redo").click();
    assert.equal(await page.locator("#editBeats").inputValue(),"6/5","one Redo restores one full fraction gesture");
    // Enharmonics are a sounding-pitch relationship: both D# and Eb
    // light up. Crossing beyond #/b must add/subtract 50 cents and
    // transition to the neighboring note's accidental, not clamp.
    await setPitch("D#4");
    const ebox=await page.locator("#editPitch").boundingBox();
    const ex=ebox.x+ebox.width/2,ey=ebox.y+ebox.height/2;
    await page.mouse.move(ex,ey);await page.mouse.down();
    await page.mouse.move(ex+8,ey);
    const highlighted=await page.locator("#pitchFlickGrid .selected").evaluateAll(els=>
      els.map(el=>el.dataset.note+":"+el.dataset.acc).sort());
    assert.deepEqual(highlighted,["D:4","E:0"],"D# and Eb must both light up");
    await page.mouse.move(ex+29,ey,{steps:3});
    assert.equal(await page.locator("#editPitch").inputValue(),"Ed4","right of D# should reach Ed");
    await page.mouse.up();
    await page.locator("#undo").click();
    assert.equal(await page.locator("#editPitch").inputValue(),"D#4","chromatic flick should be a single undo");
    await setPitch("Eb4");
    await page.mouse.move(ex,ey);await page.mouse.down();
    await page.mouse.move(ex-8,ey);
    assert.equal(await page.locator("#pitchFlickGrid .selected").count(),2);
    await page.mouse.move(ex-29,ey,{steps:3});
    assert.equal(await page.locator("#editPitch").inputValue(),"D‡4","left of Eb should reach D‡");
    await page.mouse.up();
    // Fraction editing is not the old 0.25 increment table.
    await setBeats("3/8");
    const fb=await page.locator("#editBeats").boundingBox();
    const qx=fb.x+fb.width/2,qy=fb.y+fb.height/2;
    await page.mouse.move(qx,qy);await page.mouse.down();
    await page.mouse.move(qx,qy-8);
    const labels=await page.locator("#beatsFlickGrid .beats-flick-cell").evaluateAll(els=>
      els.slice(0,4).map(el=>el.textContent));
    assert.deepEqual(labels,["5/7","5/8","5/9","5/10"]);
    if(width===390)await page.screenshot({path:"artifacts/issue-28-layout-audit/ratio-beats-open-390.png"});
    await page.mouse.move(qx,qy-29,{steps:3});
    assert.equal(await page.locator("#editBeats").inputValue(),"4/8");
    await page.mouse.move(qx+33,qy-29,{steps:3});
    assert.equal(await page.locator("#editBeats").inputValue(),"4/9");
    await page.mouse.up();
    await page.locator("#undo").click();
    assert.equal(await page.locator("#editBeats").inputValue(),"3/8");
    await page.locator("#redo").click();
    assert.equal(await page.locator("#editBeats").inputValue(),"4/9");
    await setBeats("4/4");
    if(width===390){
      // Double click, not hold, enters exact pitch input. No grid cell is
      // ever a clickable selector.
      await page.locator("#editPitch").dblclick();
      assert.equal(await page.locator("#editPitch").evaluate(el=>el===document.activeElement&&el.classList.contains("exact-editing")),true);
      assert.equal(await page.locator("#pitchFlickPanel").isVisible(),false);
      await setPitch("A#5 +50￠");
      assert.equal(await page.locator("#editPitch").inputValue(),"A#5 +50￠");
      await page.locator("#stop").click(); // blur closes exact editor
      assert.equal(await page.locator("#editPitch").evaluate(el=>el.classList.contains("exact-editing")),false);
    }
    await setPitch("D‡5");
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
    assert.ok(await page.locator("#play").evaluate(e=>e.classList.contains("playing")),"transport state missing");
    // Editing the sounding cell must keep transport running; the earlier version stopped.
    await setPitch("G4");
    assert.ok(await page.locator("#play").evaluate(e=>e.classList.contains("playing")),"editing stopped transport");
    assert.ok(await cells.nth(1).evaluate(e=>e.classList.contains("playing")));
    await page.evaluate(()=>window.__ratioStarted=[]);
    await cells.nth(1).click();
    await page.waitForFunction(()=>window.__ratioStarted.length>=3);
    assert.ok(await page.locator("#play").evaluate(e=>e.classList.contains("playing")),"card tap stopped transport");
    await page.locator("#preview").click();
    assert.ok(await page.locator("#play").evaluate(e=>e.classList.contains("playing")),"preview stopped transport");
    await page.locator("#stop").click();

    await page.locator("#presetSearch").fill("11th");
    assert.equal(await page.locator(".ratio-preset").count(),1,"preset search must filter candidates");
    await page.locator("#presetSearch").fill("");
    // Existing G4 is changed to G‡4 by a horizontal flick, not 12 fixed buttons.
    const rootBox=await page.locator("#editPitch").boundingBox();
    const rootX=rootBox.x+rootBox.width/2,rootY=rootBox.y+rootBox.height/2;
    await page.mouse.move(rootX,rootY);await page.mouse.down();
    await page.mouse.move(rootX+33,rootY,{steps:3});await page.mouse.up();
    assert.match(await page.locator("#editPitch").inputValue(),/^G‡/,"half sharp flick not applied");
    await page.locator("#stop").click();
    await page.reload();
    assert.equal(await page.locator("#gridColumns").inputValue(),"4","column preference was not persisted");
    assert.equal(await page.locator("#selectionLabel").count(),0,"code ordinals must not appear in the editor");
    await setPitch("H4");
    assert.equal(await page.locator("#editPitch").getAttribute("aria-invalid"),"true");
    assert.match(await page.locator(".progression-cell[data-cid]").nth(1).locator(".cell-note").innerText(),/^G‡/);
    await setPitch("Bd6");
    await page.locator("#openIO").click();
    const exported=await page.locator("#ioText").inputValue();
    assert.ok(exported.includes("Bd6")&&exported.includes("[A x2]"));
    await page.locator("#ioImport").click();
    assert.match(await page.locator("#ioStatus").innerText(),/読み込みました/);
    await page.locator("#ioClose").click();
    await page.locator("#undo").click();
    assert.ok(await page.locator("#editPitch").isVisible());
    assert.equal(await page.locator("#presetManager").count(),0);
    await page.locator(".preset-item").filter({hasText:"Major"}).first().locator(".preset-edit").click();
    assert.ok(await page.locator("#presetInlineRow").isVisible(),"edit must be inline");
    assert.equal(await page.locator("#presetInlineInput").inputValue(),"[Major]4,5,6");
    assert.equal(await page.locator("#presetSearch").isVisible(),false,"search should be temporarily replaced, not pushed down");
    if(width===320){
      const size=await page.locator(".progression-editor").evaluate(el=>({scroll:el.scrollHeight,client:el.clientHeight}));
      assert.ok(size.scroll<=size.client+2,"inline registration pushed mobile editor into nested scrolling "+JSON.stringify(size));
    }
    await page.locator("#presetInlineInput").fill("[Major2]4,5,6");
    await page.locator("#presetInlineInput").press("Enter");
    assert.equal(await page.locator(".ratio-preset").filter({hasText:"Major2"}).count(),1);
    assert.equal(await page.locator("#presetInlineRow").isVisible(),false);
    await page.locator("#openPresetManager").click();
    await page.locator("#presetInlineInput").fill("[Extra]4:11/2:6");
    await page.locator("#presetInlineInput").press("Enter");
    assert.equal(await page.locator(".ratio-preset").filter({hasText:"Extra"}).count(),1);
    await page.locator(".preset-item").filter({hasText:"Extra"}).locator(".preset-edit").click();
    await page.locator("#presetInlineInput").fill("[ShouldNotSave]4:5:6");
    await page.locator("#presetInlineCancel").click();
    assert.equal(await page.locator(".ratio-preset").filter({hasText:"ShouldNotSave"}).count(),0,
      "cancel unexpectedly saved an inline rename");
    assert.equal(await page.locator(".ratio-preset").filter({hasText:"Extra"}).count(),1,
      "cancel unexpectedly lost the original preset");
    await page.locator("#editExpr").fill("[Own]4:5:6");
    await page.locator("#editExpr").dispatchEvent("change");
    assert.equal(await page.locator(".ratio-preset").filter({hasText:"Own"}).count(),1);
    await page.locator("#editExpr").evaluate(el=>el.blur());
    assert.equal(await page.locator("#editExpr").inputValue(),"[Own]4:5:6");
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
    assert.equal(await page.locator("#chunkJump option").count(),2);
    assert.equal(await cells.count(),1);
    assert.ok(await page.locator("#chunkInlineName").isVisible(),"new chunk should open input instantly");
    assert.equal(await page.locator("#chunkInlineName").evaluate(el=>el===document.activeElement),true);
    await page.locator("#chunkInlineName").fill("間奏");
    await page.locator("#chunkInlineName").press("Enter");
    assert.equal(await page.locator("#chunkJump option").last().innerText(),"間奏");
    assert.equal(await page.locator(".progression-chunk-head").count(),0);
    await page.locator("#newSection").click();
    assert.equal(await page.locator(".ratio-section-header").count(),2);
    assert.ok(await page.locator(".ratio-section-name-input").isVisible(),"new section title not instantly editable");
    await page.locator(".ratio-section-name-input").fill("ブリッジ");
    await page.locator(".ratio-section-name-input").press("Enter");
    assert.equal(await page.locator(".ratio-section-name").last().innerText(),"ブリッジ");
    const chordId=await page.locator(".progression-cell.active").getAttribute("data-cid");
    const n=await page.evaluate(()=>window.__ratioStarted.length);
    await page.locator(".ratio-section-name").first().click();
    assert.ok(await page.locator(".ratio-section-name-input").isVisible(),"existing section name not inline");
    await page.locator(".ratio-section-name-input").fill("前奏");
    await page.locator(".ratio-section-name-input").press("Enter");
    assert.equal(await page.locator(".ratio-section-name").first().innerText(),"前奏");
    assert.equal(await page.locator(".progression-cell.active").getAttribute("data-cid"),chordId,"rename changed selected chord");
    assert.equal(await page.evaluate(()=>window.__ratioStarted.length),n,"renaming unexpectedly played audio");
    await page.locator(".ratio-section-repeat input").first().fill("3");
    await page.locator(".ratio-section-repeat input").first().dispatchEvent("change");
    assert.equal(await page.locator(".ratio-section-repeat input").first().inputValue(),"3");
    const repeatBox=await page.locator(".ratio-section-repeat input").first().boundingBox();
    const rx=repeatBox.x+repeatBox.width/2,ry=repeatBox.y+repeatBox.height/2;
    await page.mouse.move(rx,ry);await page.mouse.down();
    await page.mouse.move(rx,ry-20,{steps:3});await page.mouse.up();
    assert.equal(await page.locator(".ratio-section-repeat input").first().inputValue(),"4","inline repeat must scrub");
    await page.locator("#undo").click();
    assert.equal(await page.locator(".ratio-section-repeat input").first().inputValue(),"3","repeat scrub not one Undo");
    await page.locator("#redo").click();
    assert.equal(await page.locator(".progression-cell.active").getAttribute("data-cid"),chordId);
    await page.locator("#chunkJump").selectOption({label:"チャンク 1"});
    assert.equal(await cells.count(),5,"switching chunk must show all original chord cells");
    await page.locator("#chunkJump").selectOption({label:"間奏"});
    assert.equal(await cells.count(),2,"switching chunk must show its own chord cells only");
    if(width<=950)await page.locator("#progMenuToggleBtn").click();
    assert.equal(await page.locator("#playChunk,#playSection").count(),0,"redundant playback buttons remain");
    await page.locator("#playScope").selectOption("chunk");
    if(width<=950)await page.locator("#progMenuToggleBtn").click();
    await page.locator("#play").click();
    await page.waitForFunction(()=>document.querySelectorAll(".progression-cell.playing").length===1);
    await page.locator("#stop").click();
    await page.locator("#openIO").click();
    assert.match(await page.locator("#ioText").inputValue(),/@chunk チャンク 1/);
    assert.match(await page.locator("#ioText").inputValue(),/@chunk 間奏/);
    await page.locator("#ioClose").click();
    await page.reload();
    assert.equal(await page.locator("#playScope").inputValue(),"chunk","playback scope not retained");
    assert.equal(await page.locator("#chunkJump option").count(),2,"chunk hierarchy lost on reload");
    assert.equal(await page.locator("#chunkJump").inputValue(),await page.locator("#chunkJump option").last().getAttribute("value"),"active chunk lost on reload");
    const initialCount=await cells.count();
    await page.locator("#editExpr").fill("7:9:11");
    await page.locator("#editExpr").dispatchEvent("change");
    await page.locator("#duplicate").click();
    assert.equal(await cells.count(),initialCount+1,"duplicate didn't create chord");
    assert.equal(await page.locator("#editExpr").inputValue(),"7:9:11","duplicate not identical");
    await page.locator("#addStep").click();
    assert.equal(await cells.count(),initialCount+2,"add chord didn't create");
    assert.equal(await page.locator("#editExpr").inputValue(),"4,5,6","add chord incorrectly copied");
    await page.screenshot({path:"artifacts/issue-28-layout-audit/ratio-mode-"+width+"x"+height+"-edited.png"});
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
  // Actual Chromium touch pointer path, not only mouse emulation: a finger
  // starts on the pitch value and stays down across an octave boundary.
  const touchContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const touchPage=await touchContext.newPage();
  try{
    await touchPage.goto("http://127.0.0.1:4173/ratio-mode/",{waitUntil:"domcontentloaded"});
    await touchPage.locator("#editPitch").dblclick();
    await touchPage.locator("#editPitch").fill("B4");
    await touchPage.locator("#editPitch").dispatchEvent("change");
    await touchPage.locator("#editPitch").evaluate(el=>el.blur());
    const box=await touchPage.locator("#editPitch").boundingBox();
    const x=box.x+box.width/2,y=box.y+box.height/2;
    await touchPage.evaluate(()=>{
      window.__flickTrace=[];
      const field=document.querySelector("#editPitch");
      for(const kind of ["pointerdown","pointermove","pointerup","pointercancel","lostpointercapture","touchstart","touchmove","touchend"]){
        field.addEventListener(kind,e=>window.__flickTrace.push([kind,
          Math.round(e.clientY??e.touches?.[0]?.clientY??-1),
          field.value,field.hasPointerCapture?.(1)]));
      }
    });
    const cdp=await touchContext.newCDPSession(touchPage);
    await cdp.send("Emulation.setTouchEmulationEnabled",{enabled:true,maxTouchPoints:1});
    const point=(px,py)=>[{x:px,y:py,id:1}];
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:point(x,y)});
    assert.equal(await touchPage.locator("#pitchFlickPanel").isVisible(),false,"touchstart alone must not open grid");
    await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    assert.equal(await touchPage.locator("#editPitch").inputValue(),"B4","touch tap should not select");
    assert.equal(await touchPage.locator("#editPitch").evaluate(el=>el.readOnly),true,"single touch activated precise edit");
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:point(x,y)});
    await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:point(x,y-26)});
    await touchPage.waitForFunction(()=>document.querySelector("#editPitch").value==="C5",null,{timeout:2000});
    await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:point(x,y+3)});
    try{await touchPage.waitForFunction(()=>document.querySelector("#editPitch").value==="B4",null,{timeout:2000})}
    catch(error){
      const trace=await touchPage.evaluate(()=>window.__flickTrace);
      throw new Error("touch return wrap failed, trace="+JSON.stringify(trace)+"; "+error.message);
    }
    await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    assert.equal(await touchPage.locator("#editPitch").inputValue(),"B4");
    assert.equal(await touchPage.locator("#pitchFlickPanel").isVisible(),false);
    console.log("touch pointer flick B4→C5→B4 PASS");
  }finally{await touchContext.close()}
}finally{await browser.close()}
