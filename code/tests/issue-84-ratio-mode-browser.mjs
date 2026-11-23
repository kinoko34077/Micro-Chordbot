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
    const typeNumeric=async(selector,value)=>{
      const field=page.locator(selector).first();
      await field.dblclick();
      assert.equal(await field.evaluate(el=>el.readOnly),false,"double tap/click should unlock "+selector);
      await field.fill(String(value));
      await field.dispatchEvent("change");
      assert.equal(await field.inputValue(),String(value));
      assert.equal(await field.evaluate(el=>el.readOnly),true,"numeric commit must relock "+selector);
    };
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
    if(width===390){
      // The existing arrow control must cross into an adjacent section,
      // preserving code ID and 1-click Undo without a separate modal.
      await cells.nth(2).click();
      await page.locator("#moveRight").click();
      assert.deepEqual(await page.locator(".ratio-section-group").nth(0).locator(".progression-cell[data-cid]").evaluateAll(
        els=>els.map(el=>el.dataset.cid)),["a1","a2"]);
      assert.equal(await page.locator(".ratio-section-group").nth(1).locator(".progression-cell[data-cid]").first().getAttribute("data-cid"),"a3");
      assert.equal(await page.locator(".progression-cell.active").getAttribute("data-cid"),"a3");
      await page.locator("#undo").click();
      assert.deepEqual(await page.locator(".ratio-section-group").nth(0).locator(".progression-cell[data-cid]").evaluateAll(
        els=>els.map(el=>el.dataset.cid)),["a1","a2","a3"]);
      await cells.first().click();
    }
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
    assert.equal(await page.locator("#playScope").isVisible(),true,"play scope hidden in settings");
    const scopeRect=await page.locator("#playScope").boundingBox();
    assert.ok(scopeRect&&scopeRect.x>=0&&scopeRect.x+scopeRect.width<=width+2,"play scope outside viewport");
    if(width<=950){
      await page.locator("#progMenuToggleBtn").click();
      const align=await page.locator("#progMenuToggleBtn").evaluate(el=>({align:getComputedStyle(el).alignItems,justify:getComputedStyle(el).justifyContent}));
      assert.deepEqual(align,{align:"center",justify:"center"},"settings label not internally centered");
    }
    if(width<=640){
      await page.locator("#masterVolumeMobile").evaluate(el=>{
        el.value="0.45";el.dispatchEvent(new Event("input",{bubbles:true}));
      });
      assert.equal(await page.locator("#masterVolume").inputValue(),"0.45","mobile slider did not update AudioEngine master control");
    }
    await typeNumeric("#gridColumns",1);
    assert.equal(await page.locator("#timeline").getAttribute("data-columns"),"1");
    const one=await page.locator(".progression-chunk:first-child .progression-cell[data-cid]").evaluateAll(nodes=>nodes.slice(0,2).map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y}}));
    assert.ok(Math.abs(one[0].x-one[1].x)<3&&one[1].y>one[0].y+20,"single-column setting did not wrap");
    await typeNumeric("#gridColumns",12);
    assert.equal(await page.locator("#timeline").getAttribute("data-columns"),String(Math.min(12,expectedCap)),"12-column setting must clamp on narrow devices");
    const shownColumn=Number(await page.locator("#timeline").getAttribute("data-columns"));
    assert.equal(await page.locator("#effectiveColumns").isVisible(),shownColumn<12);
    if(shownColumn<12)assert.equal(await page.locator("#effectiveColumns").innerText(),"表示"+shownColumn);
    await typeNumeric("#gridColumns",4);
    await typeNumeric("#bpm",120);
    assert.equal(await page.locator("#bpm").inputValue(),"120");
    assert.equal(await page.locator("#bpm").evaluate(el=>document.activeElement===el),false,"numeric exact commit retained focus outline");
    const bpmWidth=await page.locator("#bpm").evaluate(el=>el.getBoundingClientRect().width);
    assert.ok(bpmWidth<=85,"three-digit BPM value rendered as oversized field "+bpmWidth);
    await page.locator("#undo").click();
    assert.equal(await page.locator("#bpm").inputValue(),"110","BPM edit should be a single Undo");
    await page.locator("#redo").click();
    assert.equal(await page.locator("#bpm").inputValue(),"120");
    if(width<=950){
      assert.equal(await page.locator("#progMenuToggleBtn").getAttribute("aria-expanded"),"false","Undo outside popover must close settings");
      await page.locator("#progMenuToggleBtn").click();
    }
    await typeNumeric("#bpm",110);
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
    if(width===390){
      const storage=()=>page.evaluate(()=>localStorage.getItem("muChordbot.ratioMode.v1"));
      const before=await storage();
      const f=page.locator("#editExpr");
      await f.fill("4:5:7");await page.waitForTimeout(320);
      assert.equal(await storage(),before,"typing saved uncommitted draft");
      await f.fill("4:5:8");await page.waitForTimeout(320);
      assert.equal(await storage(),before,"second typing pause changed history/storage");
      await f.press("Enter");
      assert.notEqual(await storage(),before);
      await page.locator("#undo").click();
      assert.equal(await storage(),before,"one Undo must restore all of the typing session");
      await f.fill("4:5:9");await page.waitForTimeout(320);
      await page.locator("#undo").click();
      assert.equal(await storage(),before,"global Undo committed a pending draft");
      await f.fill("4:5:10");await cells.nth(1).click();
      assert.equal(await cells.nth(1).getAttribute("aria-pressed"),"true","committing blur swallowed next card selection");
      await cells.first().click();await page.locator("#stop").click();
    }
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

    assert.equal(await page.locator("#chunkReorderToggle").isVisible(),true,
      "second chunk must make reorder affordance visible");
    if(width===390){
      const original=await page.locator("#chunkJump option").evaluateAll(els=>els.map(x=>x.textContent));
      const selected=await page.locator("#chunkJump").inputValue();
      await page.locator("#chunkReorderToggle").click();
      assert.equal(await page.locator("#chunkOrderPanel").isVisible(),true);
      assert.equal(await page.locator(".ratio-chunk-order-item").count(),2);
      await page.locator(".ratio-chunk-order-item").last().locator(".ratio-chunk-order-grip").focus();
      await page.keyboard.press("Alt+ArrowUp");
      assert.deepEqual(await page.locator("#chunkJump option").evaluateAll(els=>els.map(x=>x.textContent)),
        original.slice().reverse(),"keyboard chunk move did not reorder the actual project");
      assert.equal(await page.locator("#chunkJump").inputValue(),selected,
        "reorder changed the selected chunk");
      await page.locator("#undo").click();
      assert.deepEqual(await page.locator("#chunkJump option").evaluateAll(els=>els.map(x=>x.textContent)),
        original,"one Undo failed to restore chunk order");
      await page.locator("#redo").click();
      assert.deepEqual(await page.locator("#chunkJump option").evaluateAll(els=>els.map(x=>x.textContent)),
        original.slice().reverse(),"Redo failed to replay chunk order");
      await page.locator("#undo").click();
      if(!(await page.locator("#chunkOrderPanel").isVisible()))await page.locator("#chunkReorderToggle").click();
      const firstRow=page.locator(".ratio-chunk-order-item").first();
      await page.locator(".ratio-chunk-order-item").last().locator(".ratio-chunk-order-grip")
        .dragTo(firstRow,{targetPosition:{x:10,y:4}});
      assert.deepEqual(await page.locator("#chunkJump option").evaluateAll(els=>els.map(x=>x.textContent)),
        original.slice().reverse(),"native mouse chunk drag failed");
      await page.locator("#undo").click();
      assert.deepEqual(await page.locator("#chunkJump option").evaluateAll(els=>els.map(x=>x.textContent)),
        original,"drag reorder must be a single Undo transaction");
      if(await page.locator("#chunkOrderPanel").isVisible())
        await page.locator("#chunkReorderToggle").click();
      assert.equal(await page.locator("#chunkOrderPanel").isVisible(),false);
    }
    if(width===320){
      await page.locator("#chunkReorderToggle").click();
      assert.equal(await page.locator("#chunkOrderPanel").isVisible(),true);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),
        "compact chunk order created document-wide sideways scroll");
      await page.screenshot({path:"artifacts/issue-28-layout-audit/ratio-chunk-order-open-320.png"});
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#chunkOrderPanel").isVisible(),false);
    }

    assert.equal(await page.locator(".progression-chunk-head").count(),0);
    await page.locator("#newSection").click();
    assert.equal(await page.locator(".ratio-section-header").count(),2);
    assert.ok(await page.locator(".ratio-section-name-input").isVisible(),"new section title not instantly editable");
    await page.locator(".ratio-section-name-input").fill("ブリッジ");
    await page.locator(".ratio-section-name-input").press("Enter");
    assert.equal(await page.locator(".ratio-section-name").last().innerText(),"ブリッジ");
    if(width===390){
      const before=await page.locator(".ratio-section-group").evaluateAll(els=>els.map(el=>el.dataset.sectionId));
      await page.locator(".ratio-section-group").last().locator(".ratio-section-grip").focus();
      await page.keyboard.press("Alt+ArrowUp");
      const after=await page.locator(".ratio-section-group").evaluateAll(els=>els.map(el=>el.dataset.sectionId));
      assert.deepEqual(after,before.slice().reverse(),"keyboard Alt+Up must reorder sections");
      await page.locator("#undo").click();
      assert.deepEqual(await page.locator(".ratio-section-group").evaluateAll(els=>els.map(el=>el.dataset.sectionId)),
        before,"one Undo must restore section order");
    }
    const chordId=await page.locator(".progression-cell.active").getAttribute("data-cid");
    const n=await page.evaluate(()=>window.__ratioStarted.length);
    await page.locator(".ratio-section-name").first().click();
    assert.ok(await page.locator(".ratio-section-name-input").isVisible(),"existing section name not inline");
    await page.locator(".ratio-section-name-input").fill("前奏");
    await page.locator(".ratio-section-name-input").press("Enter");
    assert.equal(await page.locator(".ratio-section-name").first().innerText(),"前奏");
    assert.equal(await page.locator(".progression-cell.active").getAttribute("data-cid"),chordId,"rename changed selected chord");
    assert.equal(await page.evaluate(()=>window.__ratioStarted.length),n,"renaming unexpectedly played audio");
    await typeNumeric(".ratio-section-repeat input",3);
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
    const rememberedId=await cells.nth(1).getAttribute("data-cid");
    await cells.nth(1).click();
    await page.locator("#chunkJump").selectOption({label:"間奏"});
    assert.equal(await cells.count(),2,"switching chunk must show its own chord cells only");
    await page.locator("#chunkJump").selectOption({label:"チャンク 1"});
    assert.equal(await page.locator(".progression-cell.active").getAttribute("data-cid"),rememberedId,
      "switching chunks lost the prior chord selection");
    await page.locator("#chunkJump").selectOption({label:"間奏"});
    assert.equal(await cells.count(),2);
    const storedView=await page.evaluate(()=>JSON.parse(localStorage.getItem("muChordbot.ratioMode.ui.v1")).chunkViews);
    assert.ok(Object.values(storedView).some(v=>v.stepId===rememberedId),"chunk view not persisted");
    assert.equal(await page.locator("#playChunk,#playSection").count(),0,"redundant playback buttons remain");
    assert.equal(await page.locator("#playScope").isVisible(),true,"scope must be visible without settings");
    await page.locator("#playScope").selectOption("chunk");
    assert.equal(await page.locator("#playScope").inputValue(),"chunk");
    await page.locator("#play").click();
    assert.ok(await page.locator("#play").innerText(),"play label missing");
    await page.waitForFunction(()=>document.querySelectorAll(".progression-cell.playing").length===1);
    await page.locator("#stop").click();
    if(width<=950){
      await page.locator("#progMenuToggleBtn").click();
      assert.equal(await page.locator("#progMenuToggleBtn").getAttribute("aria-expanded"),"true");
      await page.keyboard.press("Escape");
      assert.equal(await page.locator("#progMenuToggleBtn").getAttribute("aria-expanded"),"false");
      await page.locator("#progMenuToggleBtn").click();
      await page.locator("#playScope").click();
      assert.equal(await page.locator("#progMenuToggleBtn").getAttribute("aria-expanded"),"false","outside tap should close settings");
    }
    await page.locator("#openIO").click();
    assert.match(await page.locator("#ioText").inputValue(),/@chunk チャンク 1/);
    assert.match(await page.locator("#ioText").inputValue(),/@chunk 間奏/);
    await page.locator("#ioClose").click();
    await page.reload();
    assert.equal(await page.locator("#playScope").inputValue(),"chunk","playback scope not retained");
    assert.equal(await page.locator("#chunkJump option").count(),2,"chunk hierarchy lost on reload");
    assert.equal(await page.locator("#chunkJump").inputValue(),await page.locator("#chunkJump option").last().getAttribute("value"),"active chunk lost on reload");
    await page.locator("#chunkJump").selectOption({label:"チャンク 1"});
    assert.equal(await page.locator(".progression-cell.active").getAttribute("data-cid"),rememberedId,
      "reload did not restore the saved selection in other chunk");
    await page.locator("#chunkJump").selectOption({label:"間奏"});
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
    if(width===390){
      // Transport is keyed to musical occurrence, not to the current editor
      // selection or a stale array that ignores structural changes.
      await page.locator("#playScope").selectOption("all");
      await page.locator("#play").click();
      await page.waitForFunction(()=>document.querySelector("#play").classList.contains("playing"));
      await page.locator("#addStep").click();
      assert.equal(await page.locator("#play").evaluate(el=>el.classList.contains("playing")),true,
        "adding chord abruptly stopped transport");
      await page.locator("#undo").click();
      assert.equal(await page.locator("#play").evaluate(el=>el.classList.contains("playing")),true,
        "Undo restarted/stopped live transport");
      const active=await page.locator(".progression-cell.active").getAttribute("data-cid");
      const beforeSectionSelection=await page.locator(".progression-cell.active").getAttribute("data-cid");
      const beforeSectionChunk=await page.locator("#chunkJump").inputValue();
      await page.locator("#newSection").click();
      assert.equal(await page.locator("#play").evaluate(el=>el.classList.contains("playing")),true,
        "creating section stopped transport");
      await page.locator("#undo").click();
      assert.equal(await page.locator("#play").evaluate(el=>el.classList.contains("playing")),true,
        "structural Undo stopped transport");
      assert.equal(await page.locator(".progression-cell.active").getAttribute("data-cid"),beforeSectionSelection,
        "Undo jumped to unrelated chord instead of restoring editing selection");
      assert.equal(await page.locator("#chunkJump").inputValue(),beforeSectionChunk,
        "Undo jumped from previous chunk to the beginning");
      await page.locator("#stop").click();
    }
    await page.locator("#removeChunk").click();
    assert.equal(await page.locator("#chunkJump option").count(),1,"chunk deletion left orphaned selectors");
    assert.equal(await page.locator("#chunkJump option").first().innerText(),"チャンク 1","deleting active chunk should select a neighboring chunk");
    await page.locator("#undo").click();
    assert.equal(await page.locator("#chunkJump option").count(),2,"deleted chunk must be undoable");
    await page.reload();
    assert.equal(await page.locator("#chunkJump option").count(),2,"undo must restore chunk in storage");
    if(width===390){
      // A transport occurrence outside the currently edited chunk is
      // addressable without a transport restart, audition, or an Undo step.
      await page.evaluate(()=>{
        const key="muChordbot.ratioMode.v1";
        const state=JSON.parse(localStorage.getItem(key));
        state.settings.bpm=300;state.settings.loop=true;
        // Earlier cases rename/remove presets; the fixture must be complete
        // rather than depend on previous tests' mutable named definitions.
        state.presets=[{name:"Major",ratios:"4,5,6"},{name:"Minor",ratios:"10,12,15"}];
        state.sections=[
          {id:"visible",chunkId:"chunk-a",chunkName:"主部",name:"A",repeat:1,
            steps:[{id:"v1",expr:"Major",pitch:"C4",beats:1,beatUnit:16}]},
          {id:"hidden",chunkId:"chunk-b",chunkName:"間奏",name:"B",repeat:1,
            steps:[{id:"h1",expr:"Minor",pitch:"G4",beats:64,beatUnit:4}]}
        ];
        localStorage.setItem(key,JSON.stringify(state));
        localStorage.removeItem("muChordbot.ratioMode.ui.v1");
      });
      await page.reload();
      assert.equal(await page.locator("#offscreenPlayback").isVisible(),false);
      assert.notEqual(await page.locator("#saveState").innerText(),"保存停止",
        "offscreen test fixture did not pass the project validator");
      await page.locator("#playScope").selectOption("all");
      await page.locator("#play").click();
      try{await page.locator("#offscreenPlayback").waitFor({state:"visible",timeout:3000})}
      catch(error){
        const diag=await page.evaluate(()=>({
          play:document.querySelector("#play").className,
          playback:document.querySelector("#offscreenPlayback").outerHTML,
          status:document.querySelector("#status").textContent,
          chunk:document.querySelector("#chunkJump").value,
          data:JSON.parse(localStorage.getItem("muChordbot.ratioMode.v1"))?.sections.map(s=>[s.id,s.chunkId,s.steps.map(x=>x.id)]),
          timeline:[...document.querySelectorAll(".progression-cell[data-cid]")].map(x=>[x.dataset.cid,x.className]),
          started:window.__ratioStarted.length
        }));
        throw new Error("offscreen playback indicator did not appear; "+JSON.stringify(diag)+"; "+error.message);
      }
      assert.match(await page.locator("#offscreenPlayback").innerText(),/間奏/);
      assert.match(await page.locator("#offscreenPlayback").getAttribute("aria-label"),/Minor G4/,
        "offscreen location must identify the sounding chord, not just its section");
      assert.equal(await page.locator("#chunkJump").inputValue(),"chunk-a",
        "live transport improperly changed the editing chunk");
      await page.screenshot({path:"artifacts/issue-28-layout-audit/ratio-playback-offscreen-390.png"});
      const audioBefore=await page.evaluate(()=>window.__ratioStarted.length);
      await page.locator("#offscreenPlayback").click();
      assert.equal(await page.locator("#chunkJump").inputValue(),"chunk-b",
        "explicit jump failed to locate the sounding chunk");
      assert.equal(await page.locator(".progression-cell.active").getAttribute("data-cid"),"h1");
      assert.equal(await page.locator(".progression-cell.playing").getAttribute("data-cid"),"h1");
      assert.equal(await page.locator("#offscreenPlayback").isVisible(),false,
        "locator persisted after sounding chord became visible");
      assert.equal(await page.locator("#play").evaluate(el=>el.classList.contains("playing")),true,
        "jump unexpectedly stopped transport");
      assert.equal(await page.evaluate(()=>window.__ratioStarted.length),audioBefore,
        "jump unexpectedly replayed or auditioned sound");
      await page.locator("#stop").click();
      assert.equal(await page.locator("#offscreenPlayback").isVisible(),false);
    }

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
    // Touch reorder uses long-hold, not a destructive tap or page-scroll gesture.
    const first=touchPage.locator('.progression-cell[data-cid="a1"]');
    const third=touchPage.locator('.progression-cell[data-cid="a3"]');
    const firstBox=await first.boundingBox(),thirdBox=await third.boundingBox();
    const sx=firstBox.x+firstBox.width*.32,sy=firstBox.y+firstBox.height*.52;
    const dx=thirdBox.x+thirdBox.width*.24,dy=thirdBox.y+thirdBox.height*.52;
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:point(sx,sy)});
    await touchPage.waitForTimeout(370);
    assert.equal(await first.evaluate(el=>el.classList.contains("reorder-source")),true,"long-hold did not initiate move");
    await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:point(dx,dy)});
    await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    const moved=await touchPage.locator(".progression-cell[data-cid]").evaluateAll(
      els=>els.slice(0,3).map(el=>el.dataset.cid));
    assert.deepEqual(moved,["a2","a1","a3"],"touch reorder did not insert the chord before target");
    await touchPage.locator("#undo").click();
    assert.deepEqual(await touchPage.locator(".progression-cell[data-cid]").evaluateAll(
      els=>els.slice(0,3).map(el=>el.dataset.cid)),["a1","a2","a3"],"one Undo failed to restore touch move");
    console.log("touch long-hold reorder + single Undo PASS");
    // Dedicated section grip must allow actual vertical touch reorder
    // without hijacking the section name's inline editing behavior.
    const bGrip=await touchPage.locator(".ratio-section-group").nth(1).locator(".ratio-section-grip").boundingBox();
    const aHeader=await touchPage.locator(".ratio-section-group").first().locator(".ratio-section-header").boundingBox();
    const gs=bGrip.x+bGrip.width*.5,gy=bGrip.y+bGrip.height*.5;
    const tx=aHeader.x+aHeader.width*.3,ty=aHeader.y+aHeader.height*.5;
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:point(gs,gy)});
    await touchPage.waitForTimeout(360);
    await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:point(tx,ty)});
    await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    assert.equal(await touchPage.locator(".ratio-section-group").first().getAttribute("data-section-id"),"sB",
      "section long-hold did not move B before A");
    await touchPage.locator("#undo").click();
    assert.equal(await touchPage.locator(".ratio-section-group").first().getAttribute("data-section-id"),"sA",
      "Undo failed to restore section order after touch move");
    console.log("touch section grip reorder + one Undo PASS");
    // Touch-only chunk order: dedicated 300ms hold on a single grip.
    await touchPage.locator("#newChunk").click();
    await touchPage.locator("#chunkInlineName").fill("間奏");
    await touchPage.locator("#chunkInlineName").press("Enter");
    await touchPage.locator("#chunkReorderToggle").click();
    const chunkGrip=await touchPage.locator(".ratio-chunk-order-item").last()
      .locator(".ratio-chunk-order-grip").boundingBox();
    const chunkTarget=await touchPage.locator(".ratio-chunk-order-item").first().boundingBox();
    const chx=chunkGrip.x+chunkGrip.width/2,chy=chunkGrip.y+chunkGrip.height/2;
    const cxx=chunkTarget.x+chunkTarget.width*.30,cyy=chunkTarget.y+4;
    await cdp.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:point(chx,chy)});
    await touchPage.waitForTimeout(355);
    await cdp.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:point(cxx,cyy)});
    await cdp.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
    assert.equal(await touchPage.locator("#chunkJump option").first().innerText(),"間奏",
      "long-hold touch did not move chunk without a modal");
    await touchPage.locator("#undo").click();
    assert.equal(await touchPage.locator("#chunkJump option").first().innerText(),"チャンク 1",
      "chunk touch reorder did not undo as one change");
    console.log("chunk touch long-hold reorder + single Undo PASS");
  }finally{await touchContext.close()}

  // #104 R4: record the real synchronous ratio-value commit path before/after
  // an indexing refactor. Do not assert arbitrary wall-time performance budgets.
  // Node identity, scroll, focus, Undo, and validated 256-step import ARE contracts.
  for(const count of [128,256]){
    const perfPage=await browser.newPage({viewport:{width:390,height:844}});
    try{
      await perfPage.goto("http://127.0.0.1:4173/ratio-mode/",{waitUntil:"domcontentloaded"});
      const fixture=await perfPage.evaluate(async n=>{
        const {newProject}=await import("./model.mjs");
        const project=newProject(),section=project.sections[0];
        section.repeat=1;
        section.steps=Array.from({length:n},(_,index)=>({
          id:"bench-"+index,expr:"Major",pitch:"C4",beats:4,beatUnit:4
        }));
        project.sections=[section];
        return JSON.stringify(project);
      },count);
      await perfPage.locator("#openIO").click();
      await perfPage.locator("#ioText").fill(fixture);
      await perfPage.locator("#ioImport").click();
      assert.match(await perfPage.locator("#ioStatus").innerText(),/読み込みました/,"fixture import failed");
      await perfPage.locator("#ioClose").click();
      assert.equal(await perfPage.locator(".progression-cell[data-cid]").count(),count);
      const measurement=await perfPage.evaluate(()=>{
        const input=document.querySelector("#editExpr"),track=document.querySelector("#timeline");
        const card=document.querySelector(".progression-cell[data-cid]"),times=[];
        track.scrollTop=220;const beforeScroll=track.scrollTop;
        let focusRetained=true,identityRetained=true;
        for(let attempt=0;attempt<12;attempt++){
          input.focus();
          input.value=attempt%2?"Major":"Minor";
          input.dispatchEvent(new Event("input",{bubbles:true}));
          const start=performance.now();
          input.dispatchEvent(new Event("change",{bubbles:true}));
          times.push(performance.now()-start);
          focusRetained&&=document.activeElement===input;
          identityRetained&&=document.querySelector(".progression-cell[data-cid]")===card;
          input.blur();
        }
        const ordered=times.slice(2).sort((a,b)=>a-b);
        return {
          steps:document.querySelectorAll(".progression-cell[data-cid]").length,
          allMs:times.map(x=>Number(x.toFixed(3))),
          medianMs:Number(ordered[Math.floor(ordered.length/2)].toFixed(3)),
          p95Ms:Number(ordered[Math.ceil(ordered.length*.95)-1].toFixed(3)),
          cardText:card.querySelector(".cell-title").textContent,
          focusRetained,identityRetained,scrollBefore:beforeScroll,scrollAfter:track.scrollTop,
          undoAvailable:!document.querySelector("#undo").disabled
        };
      });
      assert.equal(measurement.steps,count);
      assert.equal(measurement.cardText,"Major","ratio change did not propagate to visible card");
      assert.equal(measurement.focusRetained,true,"input lost focus while committing");
      assert.equal(measurement.identityRetained,true,"value edit unexpectedly remounted the timeline");
      assert.equal(measurement.scrollAfter,measurement.scrollBefore,"value edit shifted timeline scroll");
      assert.equal(measurement.undoAvailable,true,"value editing lost undo");
      await perfPage.locator("#undo").click();
      assert.equal(await perfPage.locator(".progression-cell[data-cid]").first().locator(".cell-title").innerText(),"Minor",
        "one Undo did not restore previous ratio value");
      console.log("R4_RATIO_CARD_EDIT_BASELINE "+JSON.stringify(measurement));
    }finally{await perfPage.close()}
  }

  // #84 Loudness: verify actual UI-to-AudioEngine gain wiring and synthesized
  // offline sine power. This does NOT validate calibrated perceptual loudness.
  const loudPage=await browser.newPage({viewport:{width:390,height:844}});
  try{
    await loudPage.goto("http://127.0.0.1:4173/ratio-mode/",{waitUntil:"domcontentloaded"});
    await loudPage.evaluate(async()=>{
      const {AudioEngine}=await import("../src/audio.js");
      const original=AudioEngine.prototype.startVoice;
      window.__loudnessVoiceCalls=[];
      AudioEngine.prototype.startVoice=function(id,freq,waveform,gain,...args){
        window.__loudnessVoiceCalls.push({id,freq,waveform,gain});
        return original.call(this,id,freq,waveform,gain,...args);
      };
    });
    const setRatio=async ratios=>{
      const field=loudPage.locator("#editExpr");
      await field.fill(ratios.join(","));
      await field.dispatchEvent("change");
      await loudPage.locator("#stop").click();
      await loudPage.evaluate(()=>{window.__loudnessVoiceCalls=[]});
    };
    const gainByMode={};
    for(const [count,ratios] of [[3,[4,5,6]],[5,[4,5,6,7,8]]]){
      await setRatio(ratios);
      await loudPage.locator("#preview").click();
      await loudPage.waitForFunction(n=>window.__loudnessVoiceCalls.filter(v=>v.id.startsWith("tap-")).length>=n,count);
      gainByMode["tap"+count]=await loudPage.evaluate(()=>window.__loudnessVoiceCalls
        .filter(v=>v.id.startsWith("tap-")).map(v=>v.gain));
      await loudPage.locator("#stop").click();
      await loudPage.evaluate(()=>{window.__loudnessVoiceCalls=[]});
      await loudPage.locator("#play").click();
      await loudPage.waitForFunction(n=>window.__loudnessVoiceCalls.filter(v=>v.id.startsWith("ratio-")).length>=n,count);
      gainByMode["transport"+count]=await loudPage.evaluate(()=>window.__loudnessVoiceCalls
        .filter(v=>v.id.startsWith("ratio-")).map(v=>v.gain));
      await loudPage.locator("#stop").click();
    }
    for(const prefix of ["tap","transport"]){
      for(const n of [3,5]){
        const gains=gainByMode[prefix+n];
        assert.equal(gains.length,n,prefix+" started incorrect number of oscillators");
        assert.ok(gains.every(g=>g>0&&Math.abs(g-gains[0])<1e-9),"voice gain mismatch");
      }
      const a=gainByMode[prefix+"3"][0]*Math.sqrt(3);
      const b=gainByMode[prefix+"5"][0]*Math.sqrt(5);
      assert.ok(Math.abs(20*Math.log10(a/b))<0.1,prefix+" counts not power-balanced");
    }
    // Editing the active sounding chord must rebalance the existing voices.
    await setRatio([4,5,6]);
    await loudPage.locator("#play").click();
    await loudPage.waitForFunction(()=>window.__loudnessVoiceCalls.filter(v=>v.id.startsWith("ratio-")).length>=3);
    await loudPage.evaluate(()=>{window.__loudnessVoiceCalls=[]});
    const edit=loudPage.locator("#editExpr");
    await edit.fill("4,5,6,7,8");
    await edit.dispatchEvent("change");
    await loudPage.waitForFunction(()=>window.__loudnessVoiceCalls.filter(v=>v.id.startsWith("ratio-")).length>=5);
    const adjusted=await loudPage.evaluate(()=>window.__loudnessVoiceCalls.filter(v=>v.id.startsWith("ratio-")));
    assert.equal(adjusted.length,5,"live edit did not rebalance all playing voices");
    assert.ok(adjusted.every(v=>Math.abs(v.gain-gainByMode.transport5[0])<1e-9),
      "live edit used stale 3-voice gain");
    await loudPage.locator("#stop").click();

    const offline=await loudPage.evaluate(async()=>{
      const {chordVoiceGain}=await import("./loudness.mjs");
      const values=[220,277.182631,329.627557,369.994423,415.304698];
      const render=async(freqs)=>{
        const rate=48000,seconds=.6;
        const context=new OfflineAudioContext(1,Math.round(rate*seconds),rate);
        const gain=chordVoiceGain(freqs,"transport");
        for(const freq of freqs){
          const osc=context.createOscillator(),volume=context.createGain();
          osc.type="sine";osc.frequency.value=freq;volume.gain.value=gain;
          osc.connect(volume);volume.connect(context.destination);
          osc.start(0);osc.stop(seconds);
        }
        const output=(await context.startRendering()).getChannelData(0);
        let power=0,peak=0;
        for(let i=4800;i<output.length;i++){
          const sample=output[i];
          power+=sample*sample;peak=Math.max(peak,Math.abs(sample));
        }
        return {rms:Math.sqrt(power/(output.length-4800)),peak};
      };
      return {
        three:await render(values.slice(0,3)),
        five:await render(values),
        unisonThree:await render([220,220,220]),
        unisonFive:await render([220,220,220,220,220]),
        sixteen:await render(Array.from({length:16},(_,i)=>220*Math.pow(2,i/12)))
      };
    });
    const deltaDb=(a,b)=>20*Math.log10(a/b);
    assert.ok(Math.abs(deltaDb(offline.three.rms,offline.five.rms))<.6,
      "synthesized sine 3/5 RMS differs: "+JSON.stringify(offline));
    assert.ok(Math.abs(deltaDb(offline.unisonThree.rms,offline.unisonFive.rms))<.1,
      "same-frequency 3/5 RMS differs: "+JSON.stringify(offline));
    for(const [label,x] of Object.entries(offline)){
      assert.ok(x.rms>0&&x.peak<=.901,"single chord peak budget violated "+label+" "+JSON.stringify(x));
    }
    console.log("RATIO_LOUDNESS_SYNTH "+JSON.stringify({gainByMode,offline}));
  }finally{await loudPage.close()}
}finally{await browser.close()}
