import {AudioEngine} from "../src/audio.js";
import {frequencyFromPitch} from "../src/pitch.js";
import {HistoryManager, isNativeUndoTarget} from "../src/history.js";
import {newProject,validateProject,parsePitch,parseRatio,parseNamedRatio,chordExpression,setChordExpression,parseBeatNotation,beatLabel,quarterBeats,flickGridPitch,flickEnharmonicCells,beatFractionGridValue,beatFractionGridCells,FLICK_LETTERS,FLICK_ACCIDENTALS,chunksOf,flatten,importText,exportText} from "./model.mjs";

const $=id=>document.getElementById(id);
const copy=value=>JSON.parse(JSON.stringify(value));
const STORE="muChordbot.ratioMode.v1";
const UI_STORE="muChordbot.ratioMode.ui.v1";
const history=new HistoryManager(100);
const engine=new AudioEngine();
let project,saveAllowed=true,selection={sectionId:null,stepId:null},columns=4,playScope="all";
let timer=null,runId=0,playing=false,playingStepId=null,voiceCount=0;
let tapVersion=0,tapTimer=null,tapVoiceIds=[],transportVoiceIds=[],voiceGeneration=0;
const id=prefix=>prefix+Date.now().toString(36)+Math.random().toString(36).slice(2,8);

function notice(value="",error=false) {
  $("status").textContent=value;
  $("status").style.color=error?"var(--danger)":"var(--green)";
}
function boot(){
  try{
    const saved=localStorage.getItem(STORE);
    project=saved?validateProject(JSON.parse(saved)):validateProject(newProject());
    if(!saved)save();
  }catch(error){
    project=validateProject(newProject());
    saveAllowed=false;
    notice("保存済みデータの読み込みに失敗しました。自動保存を停止しています。入出力から退避できます。",true);
  }
  try{
    const ui=JSON.parse(localStorage.getItem(UI_STORE)||"null");
    if(ui&&typeof ui.sectionId==="string"&&typeof ui.stepId==="string")selection={sectionId:ui.sectionId,stepId:ui.stepId};
    if(ui&&Number.isInteger(ui.columns)&&ui.columns>=1&&ui.columns<=12)columns=ui.columns;
    if(ui&&["all","chunk","section"].includes(ui.playScope))playScope=ui.playScope;
  }catch(error){/* UI-only state is non-authoritative. */}
  chooseFirst();render();
}
function saveSelection(){
  try{localStorage.setItem(UI_STORE,JSON.stringify({...selection,columns,playScope}))}catch(error){/* UI selection optional. */}
}
function save(){
  if(!saveAllowed){$("saveState").textContent="保存停止";$("saveState").dataset.error="true";notice("保存停止中です。入出力からファイルに退避してください。",true);return}
  try{localStorage.setItem(STORE,JSON.stringify(project));$("saveState").textContent="端末内保存済み";$("saveState").dataset.error="false"}
  catch(error){saveAllowed=false;$("saveState").textContent="保存停止";$("saveState").dataset.error="true";notice("端末内保存に失敗しました。入出力からファイルへ退避してください。",true)}
}
function selectedLocation(draft=project){
  const s=draft.sections.find(s=>s.id===selection.sectionId)||draft.sections[0];
  const step=s?.steps.find(c=>c.id===selection.stepId)||s?.steps[0];
  return {section:s,step,index:s?.steps.indexOf(step)??-1};
}
function chooseFirst(){
  const loc=selectedLocation();
  selection={sectionId:loc.section?.id??null,stepId:loc.step?.id??null};
}
function mutate(change,{structural=false,audition=false,preserveTargets=false}={}){
  try{
    const before=copy(project),draft=copy(project);change(draft);
    const next=validateProject(draft);
    if(JSON.stringify(before)===JSON.stringify(next))return true;
    if(structural)stopPlayback();
    project=next;history.push({type:"ratio_edit",before,after:copy(next)});
    chooseFirst();saveSelection();save();if(saveAllowed)notice("");
    if(preserveTargets){refreshCardValues();renderPresets();renderSelection();renderHistory()}
    else render();
    if(playing&&playingStepId)void refreshPlayingVoices();
    if(audition)void preview();
    return true;
  }catch(error){notice(error.message||String(error),true);return false}
}
function setSelection(sid,cid){
  finishActiveText(true);
  cancelValueGesture?.();
  const old=project.sections.find(s=>s.id===selection.sectionId)?.chunkId;
  const next=project.sections.find(s=>s.id===sid)?.chunkId;
  selection={sectionId:sid,stepId:cid};
  saveSelection();
  if(old!==next)renderTimeline();
  renderSelection();
}
function restore(snapshot){
  const wasPlaying=playing;
  stopPlayback();project=copy(snapshot);
  chooseFirst();saveSelection();save();render();if(saveAllowed)notice("");
  // Undo/redo is authoritative even if a text field retains native focus.
  const current=selectedLocation().step;
  $("editExpr").value=chordExpression(current,project.presets);$("editPitch").value=current.pitch;
  $("editBeats").value=current.beats+"/"+(current.beatUnit||4);
  // History restores data, not unsolicited sound.
  if(wasPlaying)startPlayback();
}
function undo(){if(cancelActiveDraft())return;history.undo(restore);renderHistory()}
function redo(){if(cancelActiveDraft())return;history.redo(restore);renderHistory()}
function renderHistory(){
  $("undo").disabled=!history.canUndo()&&!activeText&&!cancelValueGesture;
  $("redo").disabled=!history.canRedo();
}
function calculate(step,presets=project.presets){
  const parsed=parseRatio(step.expr,presets);
  const bass=parsePitch(step.pitch);
  const baseHz=frequencyFromPitch(440,bass.octave,bass.microStepInOctave);
  const freqs=parsed.ratios.map(r=>baseHz*r);
  if(freqs.some(f=>!Number.isFinite(f)||f<20||f>19000))throw new Error("再生周波数は20〜19000Hzにしてください");
  return {baseHz,freqs,parsed};
}
function hz(value){return value>=1000?value.toFixed(1):value.toFixed(2)}
// Transplanted from the normal progression tab's renderProgressionGrid cell model.
function removeStep(sectionId,stepId){
  const section=project.sections.find(s=>s.id===sectionId);
  if(!section||section.steps.length<=1)return;
  const index=section.steps.findIndex(c=>c.id===stepId);
  if(index<0)return;
  const successor=section.steps[index+1]||section.steps[index-1];
  const wasSelected=selection.stepId===stepId;
  if(mutate(d=>d.sections.find(s=>s.id===sectionId).steps.splice(index,1),{structural:true})&&wasSelected)
    setSelection(sectionId,successor.id);
}
function makeCard(section,step,index){
  // A sibling button is used instead of nesting a delete button inside a button.
  const shell=document.createElement("div");shell.className="progression-cell-shell";
  const card=document.createElement("button");card.type="button";
  card.className="progression-cell";card.dataset.sid=section.id;card.dataset.cid=step.id;
  if(step.id===playingStepId)card.classList.add("playing");
  card.draggable=true;
  // Grid width is owned by the standard progression columns setting.
  card.setAttribute("aria-label",section.name+" のコード "+step.expr+" "+step.pitch+" "+beatLabel(step)+"、押すと試聴");
  const name=document.createElement("span");name.className="cell-title";name.textContent=parseRatio(step.expr,project.presets).name||step.expr;
  const note=document.createElement("span");note.className="cell-note";note.textContent=step.pitch;
  const meta=document.createElement("span");meta.className="cell-meta";meta.textContent=beatLabel(step);
  card.append(name,note,meta);
  card.addEventListener("click",()=>{setSelection(section.id,step.id);void auditionCard(selectedLocation().step)});
  card.addEventListener("dragstart",e=>{
    e.dataTransfer.setData("text/plain",section.id+":"+step.id);
    e.dataTransfer.effectAllowed="move";card.classList.add("reorder-source");
  });
  card.addEventListener("dragend",()=>card.classList.remove("reorder-source"));
  card.addEventListener("dragover",e=>{e.preventDefault();e.dataTransfer.dropEffect="move";card.classList.add("drop-before")});
  card.addEventListener("dragleave",()=>card.classList.remove("drop-before"));
  card.addEventListener("drop",e=>{
    e.preventDefault();card.classList.remove("drop-before");
    const source=e.dataTransfer.getData("text/plain").split(":");
    if(source.length!==2||source[1]===step.id)return;
    const from=project.sections.find(s=>s.id===source[0]),to=project.sections.find(s=>s.id===section.id);
    if(!from||!to||(from!==to&&from.steps.length<=1))return;
    if(mutate(d=>{
      const a=d.sections.find(s=>s.id===source[0]),b=d.sections.find(s=>s.id===section.id);
      const old=a.steps.findIndex(c=>c.id===source[1]);if(old<0)return;
      const moved=a.steps.splice(old,1)[0],at=b.steps.findIndex(c=>c.id===step.id);
      b.steps.splice(at,0,moved);
    },{structural:true}))setSelection(section.id,source[1]);
  });
  shell.append(card);
  if(section.steps.length>1){
    const remove=document.createElement("button");remove.type="button";
    remove.className="cell-remove";remove.textContent="×";
    remove.setAttribute("aria-label",section.name+" のコード"+(index+1)+"を削除");
    remove.title="削除（元に戻せます）";
    remove.addEventListener("click",event=>{event.stopPropagation();removeStep(section.id,step.id)});
    shell.append(remove);
  }
  return shell;
}
// Gesture sheets are visual references, NOT clickable keyboards. The value
// itself holds pointer capture throughout a drag; native grid-cell taps
// cannot select anything or unexpectedly scroll the composition.
const flickPanel=$("pitchFlickPanel"),flickGrid=$("pitchFlickGrid");
const beatsPanel=$("beatsFlickPanel"),beatsGrid=$("beatsFlickGrid");
const accidentalSymbols=["♭","d","","‡","♯"];
for(const note of [...FLICK_LETTERS].reverse())for(let acc=0;acc<5;acc++){
  const cell=document.createElement("div");
  cell.className="pitch-flick-cell";
  cell.dataset.note=note;cell.dataset.acc=String(acc);
  cell.textContent=note+accidentalSymbols[acc];
  flickGrid.append(cell);
}
function highlightFlickPitch(pitch){
  const parsed=parsePitch(pitch).label;
  const match=/^([A-G])([#b‡d]?)(-?\d{1,2})/.exec(parsed);
  const equivalents=flickEnharmonicCells(parsed);
  const acc=FLICK_ACCIDENTALS.indexOf(match[2]);
  for(const cell of flickGrid.children){
    const isEquivalent=equivalents.some(e=>e.letter===cell.dataset.note&&e.acc===Number(cell.dataset.acc));
    cell.classList.toggle("selected",isEquivalent);
    cell.classList.toggle("primary-selected",cell.dataset.note===match[1]&&Number(cell.dataset.acc)===acc);
  }
  $("pitchFlickValue").textContent=parsed;
}
function placeGesturePanel(source,panel,width,height){
  const r=source.getBoundingClientRect();
  const visibleHeight=window.visualViewport?.height||window.innerHeight;
  const w=Math.min(width,window.innerWidth-16);
  const h=Math.min(height,visibleHeight-16);
  panel.style.width=w+"px";panel.style.height=h+"px";
  // Center the sheet in the available width instead of anchoring it to the
  // pitch field at the far right of narrow layouts.
  panel.style.left=Math.max(8,(window.innerWidth-w)/2)+"px";
  const above=r.top-h-8;
  const top=above>=8?above:r.bottom+8;
  panel.style.top=Math.max(8,Math.min(visibleHeight-h-8,top))+"px";
}
function activatePreciseInput(field){
  if(field.classList.contains("exact-editing"))return;
  field.classList.add("exact-editing");
  field.readOnly=false;field.focus();startText(field);field.select();
}
let pitchGesture=null,beatGesture=null,cancelValueGesture=null;
function highlightBeats(value,window){
  const grid=beatFractionGridCells(value,window);
  const key=grid.firstNumerator+":"+grid.firstDenominator;
  if(beatsGrid.dataset.window!==key){
    beatsGrid.dataset.window=key;
    const fragment=document.createDocumentFragment();
    grid.rows.forEach((row,i)=>row.forEach((part,j)=>{
      const cell=document.createElement("div");
      cell.className="beats-flick-cell";
      cell.dataset.num=String(part.beats);cell.dataset.den=String(part.beatUnit);
      cell.dataset.row=String(i);cell.dataset.col=String(j);
      cell.textContent=part.beats+"/"+part.beatUnit;fragment.append(cell);
    }));
    beatsGrid.replaceChildren(fragment);
  }
  for(const cell of beatsGrid.children)cell.classList.toggle("selected",Number(cell.dataset.num)===value.beats&&Number(cell.dataset.den)===value.beatUnit);
  $("beatsFlickValue").textContent=beatLabel(value);return grid;
}
// One pointer classifier for both values; down alone cannot open the sheet or keyboard.
function bindValueGesture(field,kind){
  const pitch=kind==="pitch",panel=pitch?flickPanel:beatsPanel;
  let g=null,lastTap=null;
  field.readOnly=true;
  const label=v=>pitch?v:v.beats+"/"+v.beatUnit;
  const same=(a,b)=>label(a)===label(b);
  const mark=()=>{if(pitch)pitchGesture=g;else beatGesture=g};
  const highlight=v=>{if(pitch)highlightFlickPitch(v);else g.window=highlightBeats(v,g.window)};
  function finish(event,accept){
    if(!g||event&&g.pointerId!==event.pointerId)return;
    const old=g;g=null;mark();cancelValueGesture=null;panel.hidden=true;
    if(field.hasPointerCapture(old.pointerId))field.releasePointerCapture(old.pointerId);
    const current=selectedLocation();
    const matches=current.step.id===old.stepId&&current.section.id===old.sectionId;
    if(accept&&matches&&old.moved&&!same(old.original,old.value)){
      mutate(d=>{
        const step=d.sections.find(s=>s.id===old.sectionId).steps.find(s=>s.id===old.stepId);
        if(pitch)step.pitch=old.value;else Object.assign(step,old.value);
      },{preserveTargets:true});
      if(pitch&&old.lastAudition!==old.value)void auditionCard({...selectedLocation().step});
    }else{
      if(old.moved&&pitch&&!accept)stopAudition();
      if(accept&&matches&&!old.moved&&performance.now()-old.started<350){
        if(old.doubleCandidate){lastTap=null;activatePreciseInput(field)}
        else lastTap={time:performance.now(),x:old.x,y:old.y,stepId:old.stepId,type:old.type};
      }else lastTap=null;
    }
    if(!field.classList.contains("exact-editing"))field.value=pitch?selectedLocation().step.pitch:label(selectedLocation().step);
    renderHistory();
  }
  field.addEventListener("pointerdown",event=>{
    if(event.button!==0||!event.isPrimary||g||field.classList.contains("exact-editing"))return;
    event.preventDefault();
    if(activeText)finishActiveText(true);
    const {section,step}=selectedLocation(),now=performance.now();
    const isDouble=lastTap&&lastTap.stepId===step.id&&lastTap.type===event.pointerType&&now-lastTap.time<350&&Math.hypot(event.clientX-lastTap.x,event.clientY-lastTap.y)<18;
    const original=pitch?step.pitch:{beats:step.beats,beatUnit:step.beatUnit||4};
    g={pointerId:event.pointerId,sectionId:section.id,stepId:step.id,original,value:original,x:event.clientX,y:event.clientY,type:event.pointerType,started:now,moved:false,doubleCandidate:isDouble,audioAt:0};
    mark();cancelValueGesture=()=>finish(null,false);
    field.setPointerCapture(event.pointerId);renderHistory();
  });
  field.addEventListener("pointermove",event=>{
    if(!g||g.pointerId!==event.pointerId)return;
    const dx=event.clientX-g.x,dy=event.clientY-g.y;
    if(!g.moved){
      if(Math.hypot(dx,dy)<7)return;
      g.moved=true;lastTap=null;
      placeGesturePanel(field,panel,pitch?260:270,pitch?268:225);highlight(g.original);panel.hidden=false;
      if(pitch)resumeAudioContext({gesture:true});
    }
    const next=pitch?flickGridPitch(g.original,Math.round(-dy/23),Math.round(dx/28)):
      beatFractionGridValue(g.original.beats,g.original.beatUnit,Math.round(-dy/29),Math.round(dx/33));
    if(same(next,g.value))return;
    g.value=next;field.value=label(next);highlight(next);
    if(pitch&&performance.now()-g.audioAt>=110){
      g.audioAt=performance.now();g.lastAudition=next;void auditionCard({...selectedLocation().step,pitch:next});
    }
  });
  field.addEventListener("pointerup",e=>finish(e,true));
  field.addEventListener("pointercancel",e=>finish(e,false));
  field.addEventListener("lostpointercapture",e=>finish(e,false));
  field.addEventListener("dblclick",e=>e.preventDefault()); // pointer classifier is sole owner
  field.addEventListener("keydown",e=>{
    if(!e.defaultPrevented&&!field.classList.contains("exact-editing")&&["F2","Enter"].includes(e.key)){e.preventDefault();activatePreciseInput(field)}
    if(e.key==="Escape"&&g){e.preventDefault();finish(null,false)}
  });
  document.addEventListener("pointerdown",e=>{if(e.target!==field){lastTap=null;if(g)finish(null,false)}},{capture:true});
  window.addEventListener("blur",()=>{lastTap=null;if(g)finish(null,false)});
  document.addEventListener("visibilitychange",()=>{if(document.hidden&&g)finish(null,false)});
}
function bindPitchFlick(field){bindValueGesture(field,"pitch")}
function bindBeatFlick(field){bindValueGesture(field,"beats")}

// Repeat count has its own integral range; unlike beats it does not use a
// fraction grid. One drag still contributes exactly one Undo action.
// Shared direct numeric value control: tap is inert, drag changes a draft,
// double tap/click and keyboard F2/Enter enable precise inline text.
// The caller decides whether the value is musical (Undo) or UI-only.
function bindNumberScrub(field,{get,commit,min,max,step=1,fineStep=step}){
  let gesture=null,lastTap=null,exact=false,composing=false,finished=false;
  field.readOnly=true;
  field.classList.add("ratio-scrub-value");
  const reset=()=>{field.value=String(get());field.removeAttribute("aria-invalid")};
  function completeText(save){
    if(!exact||finished)return;
    finished=true;
    const value=Number(field.value);
    exact=false;field.readOnly=true;
    field.classList.remove("exact-editing");
    if(!save){reset();return}
    if(!field.value.trim()||!Number.isInteger(value)||value<min||value>max){
      field.setAttribute("aria-invalid","true");
      notice("数値は"+min+"〜"+max+"の整数で指定してください",true);
      return; // retain the user's invalid text for the next precise edit
    }
    field.removeAttribute("aria-invalid");
    if(value!==get())commit(value);
    field.value=String(get());
  }
  function precise(){
    if(exact)return;
    if(gesture)return;
    exact=true;finished=false;composing=false;
    field.readOnly=false;field.classList.add("exact-editing");
    field.focus();field.select();
  }
  function finish(accept,event){
    const g=gesture;if(!g||event&&g.pointerId!==event.pointerId)return;
    gesture=null;field.dataset.dragging="false";
    if(field.hasPointerCapture(g.pointerId))field.releasePointerCapture(g.pointerId);
    if(accept&&g.moved){
      if(g.value!==g.original)commit(g.value);
      lastTap=null;
    }else if(accept&&!g.moved){
      const short=performance.now()-g.started<350;
      if(short&&g.doubleCandidate){lastTap=null;precise()}
      else if(short)lastTap={time:performance.now(),x:g.x,y:g.y,type:g.type};
      else lastTap=null;
    }else lastTap=null;
    if(!exact)field.value=String(get());
  }
  field.addEventListener("pointerdown",event=>{
    if(event.button!==0||!event.isPrimary||gesture||exact)return;
    event.preventDefault();
    const now=performance.now();
    const double=!!(lastTap&&now-lastTap.time<350&&lastTap.type===event.pointerType&&
      Math.hypot(event.clientX-lastTap.x,event.clientY-lastTap.y)<18);
    const original=get();
    gesture={pointerId:event.pointerId,x:event.clientX,y:event.clientY,type:event.pointerType,
      started:now,original,value:original,increment:event.shiftKey||event.altKey?fineStep:step,moved:false,doubleCandidate:double};
    field.setPointerCapture(event.pointerId);
  });
  field.addEventListener("pointermove",event=>{
    const g=gesture;if(!g||g.pointerId!==event.pointerId)return;
    const dy=g.y-event.clientY;
    if(!g.moved&&Math.abs(dy)<7)return;
    g.moved=true;lastTap=null;
    g.value=Math.max(min,Math.min(max,g.original+Math.round(dy/18)*g.increment));
    field.dataset.dragging="true";field.value=String(g.value);
  });
  field.addEventListener("pointerup",e=>finish(true,e));
  field.addEventListener("pointercancel",e=>finish(false,e));
  field.addEventListener("lostpointercapture",e=>finish(false,e));
  field.addEventListener("dblclick",e=>e.preventDefault());
  field.addEventListener("change",()=>{if(exact&&!composing)completeText(true)});
  field.addEventListener("blur",()=>{if(exact)completeText(!composing)});
  field.addEventListener("compositionstart",()=>{composing=true});
  field.addEventListener("compositionend",()=>{composing=false});
  field.addEventListener("keydown",e=>{
    if(e.isComposing||composing)return;
    if(e.key==="Escape"){
      if(exact){e.preventDefault();completeText(false);field.blur()}
      else if(gesture){e.preventDefault();finish(false)}
    }else if(e.key==="Enter"||e.key==="F2"){
      e.preventDefault();if(exact)completeText(true);else precise();
    }
  });
  window.addEventListener("blur",()=>{lastTap=null;if(gesture)finish(false)});
  document.addEventListener("visibilitychange",()=>{if(document.hidden&&gesture)finish(false)});
}

function refreshCardValues(){
  for(const card of $("timeline").querySelectorAll(".progression-cell[data-cid]")){
    const section=project.sections.find(s=>s.id===card.dataset.sid),step=section?.steps.find(s=>s.id===card.dataset.cid);
    if(!step)continue;
    const name=parseRatio(step.expr,project.presets).name||step.expr;
    card.querySelector(".cell-title").textContent=name;
    card.querySelector(".cell-note").textContent=step.pitch;
    card.querySelector(".cell-meta").textContent=beatLabel(step);
    card.setAttribute("aria-label",section.name+" のコード "+name+" "+step.pitch+" "+beatLabel(step)+"、押すと試聴");
  }
}
function renderTimeline(){
  const timeline=$("timeline"),top=timeline.scrollTop,fragment=document.createDocumentFragment();
  const selected=selectedLocation().section;
  const chunk=chunksOf(project).find(c=>c.id===selected?.chunkId)||chunksOf(project)[0];
  if(!chunk)return;
  const wrap=document.createElement("section");wrap.className="progression-chunk";
  wrap.dataset.chunkId=chunk.id;
  // The chunk name exists only in its selector; no duplicate heading.
  for(const section of chunk.sections){
    const group=document.createElement("section");group.className="ratio-section-group";
    group.dataset.sectionId=section.id;
    const header=document.createElement("div");header.className="ratio-section-header";
    const name=document.createElement("button");name.type="button";name.className="ratio-section-name";
    name.textContent=section.name;name.title="この場でセクション名を編集";
    name.setAttribute("aria-label",section.name+" の名前を編集");
    name.addEventListener("click",()=>beginSectionRename(section.id));
    const repeatLabel=document.createElement("label");repeatLabel.className="ratio-section-repeat";
    repeatLabel.append("×");
    const repeat=document.createElement("input");repeat.type="text";repeat.inputMode="numeric";repeat.autocomplete="off";
    repeat.min="1";repeat.max="16";repeat.step="1";repeat.value=String(section.repeat);
    repeat.setAttribute("aria-label",section.name+" の反復回数、上下スライドで変更");
    repeat.title="上下へスライドして反復回数を変更。ダブルタップで文字編集";
    bindNumberScrub(repeat,{
      get:()=>project.sections.find(s=>s.id===section.id)?.repeat??section.repeat,
      commit:value=>mutate(d=>{d.sections.find(s=>s.id===section.id).repeat=value},{preserveTargets:true}),
      min:1,max:16,step:1
    });
    repeatLabel.append(repeat);header.append(name,repeatLabel);
    if(project.sections.length>1){
      const remove=document.createElement("button");remove.type="button";
      remove.className="ratio-section-remove";
      remove.innerHTML='<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 4h4M6 7l1 14h10l1-14M10 11v6M14 11v6"/></svg>';
      remove.setAttribute("aria-label",section.name+" を削除");
      remove.title="セクションを削除（元に戻せます）";
      remove.addEventListener("click",()=>removeSectionById(section.id));
      header.append(remove);
    }
    const grid=document.createElement("div");grid.className="progression-chunk-grid";
    section.steps.forEach((step,index)=>grid.append(makeCard(section,step,index)));
    const add=document.createElement("button");add.type="button";
    add.className="progression-cell progression-cell-add";add.textContent="+";
    add.title=section.name+" にコードを追加";add.setAttribute("aria-label",section.name+" にコードを追加");
    add.addEventListener("click",()=>{
      const previous=section.steps.at(-1);
      const next={id:id("c"),expr:"4,5,6",pitch:previous?.pitch||"C4",beats:4,beatUnit:4};
      if(mutate(d=>d.sections.find(s=>s.id===section.id).steps.push(next),{structural:true})){
        setSelection(section.id,next.id);
        requestAnimationFrame(()=>document.querySelector('.progression-cell[data-cid="'+next.id+'"]')?.scrollIntoView({inline:"nearest",block:"nearest"}));
      }
    });
    add.classList.add("ratio-add-small");
    group.append(header,grid,add);wrap.append(group);
  }
  fragment.append(wrap);
  timeline.replaceChildren(fragment);timeline.scrollTop=top;
  updateGridColumns();
}
function removePreset(name){
  mutate(d=>{
    const p=d.presets.find(x=>x.name===name);
    if(!p)throw new Error("対象の比率が見つかりません");
    for(const section of d.sections)for(const step of section.steps)
      if(step.expr.toLocaleLowerCase()===name.toLocaleLowerCase())step.expr=p.ratios;
    d.presets=d.presets.filter(x=>x.name!==name);
  });
}
// Name and ratio are ONE inline expression. Existing preset tiles remain
// named+ratio tiles; neither registration nor editing opens a dialog.
let editingPresetName=null,presetEditorActive=false;
function beginPresetEdit(name=null){
  const source=project.presets.find(p=>p.name===name);
  editingPresetName=source?.name||null;
  const row=$("presetInlineRow"),field=$("presetInlineInput");
  field.value=source?"["+source.name+"]"+source.ratios:"";
  const count=source?project.sections.flatMap(s=>s.steps).filter(s=>s.expr.toLocaleLowerCase()===source.name.toLocaleLowerCase()).length:0;
  field.title=source?count+"個の参照コードに反映":"名前付き比率を新規登録";
  $("presetInlineCancel").title=source?count+"個の参照コードに反映する編集を取り消す":"登録を取り消す";
  row.hidden=false;$("presetSearch").closest("label").hidden=true;
  $("openPresetManager").hidden=true;presetEditorActive=true;
  field.focus();field.select();
}
function finishPresetEdit(commit){
  if(!presetEditorActive)return;
  if(!commit){
    presetEditorActive=false;editingPresetName=null;
    $("presetInlineRow").hidden=true;
    $("presetSearch").closest("label").hidden=false;
    $("openPresetManager").hidden=false;return;
  }
  let entry;
  try{entry=parseNamedRatio($("presetInlineInput").value)}
  catch(error){notice(error.message,true);$("presetInlineInput").setAttribute("aria-invalid","true");return}
  const previous=editingPresetName;
  const okay=mutate(d=>{
    if(previous){
      const target=d.presets.find(p=>p.name===previous);
      if(!target)throw new Error("編集対象が見つかりません");
      target.name=entry.name;target.ratios=entry.ratios;
      for(const section of d.sections)for(const step of section.steps)
        if(step.expr.toLocaleLowerCase()===previous.toLocaleLowerCase())step.expr=entry.name;
    }else d.presets.push(entry);
  });
  if(!okay)return;
  presetEditorActive=false;editingPresetName=null;
  $("presetInlineInput").removeAttribute("aria-invalid");
  $("presetInlineRow").hidden=true;
  $("presetSearch").closest("label").hidden=false;
  $("openPresetManager").hidden=false;
}
function renderPresets(){
  const chips=$("presetChips"),scroll=chips.scrollTop,filter=$("presetSearch").value.trim().toLocaleLowerCase();
  const existing=new Map([...chips.children].map(el=>[el.dataset.presetKey,el]));
  const nodes=[];
  for(const preset of project.presets){
    if(filter&&!((preset.name+" "+preset.ratios).toLocaleLowerCase().includes(filter)))continue;
    const key=JSON.stringify([preset.name,preset.ratios]);
    if(existing.has(key)){nodes.push(existing.get(key));continue}
    const item=document.createElement("div");item.className="preset-item";item.dataset.presetKey=key;
    const chip=document.createElement("button");chip.type="button";chip.className="ratio-preset";
    const name=document.createElement("strong");name.textContent=preset.name;
    const ratio=document.createElement("small");ratio.textContent=preset.ratios;
    chip.append(name,ratio);chip.title="選択コードへ "+preset.name+" を設定";
    chip.addEventListener("click",()=>mutate(d=>{selectedLocation(d).step.expr=preset.name},{audition:true}));
    // Preset apply and definition editing are separate targets; no double-click action.
    const edit=document.createElement("button");edit.type="button";edit.className="preset-edit";
    edit.textContent="✎";edit.title=preset.name+" を直接編集";
    edit.setAttribute("aria-label",preset.name+" をその場で編集");
    edit.addEventListener("click",()=>beginPresetEdit(preset.name));
    const del=document.createElement("button");del.type="button";del.className="preset-remove";
    del.textContent="×";del.title=preset.name+" を解除";
    del.setAttribute("aria-label",preset.name+" を登録解除");
    del.addEventListener("click",e=>{e.stopPropagation();removePreset(preset.name)});
    item.append(chip,edit,del);nodes.push(item);
  }
  const keep=new Set(nodes);
  for(const child of [...chips.children])if(!keep.has(child))child.remove();
  nodes.forEach((el,i)=>{if(chips.children[i]!==el)chips.insertBefore(el,chips.children[i]||null)});
  chips.scrollTop=scroll;
}
function setRatioExpression(d,value){setChordExpression(d,selectedLocation(d).step,value)}
function updateGridColumns(){
  const track=$("timeline"),width=track.clientWidth||window.innerWidth;
  const min=window.innerWidth<=640?116:window.innerWidth<=950?104:88;
  const max=Math.max(1,Math.floor((width-16+6)/(min+6)));
  const actual=Math.min(columns,max);
  track.style.setProperty("--progression-columns",String(actual));
  track.dataset.columns=String(actual);
  if($("gridColumns").readOnly)$("gridColumns").value=String(columns);
  $("effectiveColumns").hidden=actual===columns;
  $("effectiveColumns").textContent=actual<columns?"表示"+actual:"";
  $("gridColumns").title=actual<columns
    ?"設定は"+columns+"列。画面幅に合わせて"+actual+"列で表示中"
    :columns+"列";
}

function renderSectionNav(){
  const select=$("chunkJump");
  const chunks=chunksOf(project),selected=selectedLocation().section;
  const chunk=chunks.find(c=>c.id===selected.chunkId)||chunks[0];
  select.replaceChildren(...chunks.map(c=>new Option(c.name,c.id)));
  select.value=chunk.id;
  $("removeChunk").disabled=chunks.length===1;
}
function beginSectionRename(sectionId){
  const section=project.sections.find(s=>s.id===sectionId);
  const group=[...$("timeline").querySelectorAll(".ratio-section-group")].find(el=>el.dataset.sectionId===sectionId);
  const button=group?.querySelector(".ratio-section-name");
  if(!section||!button)return;
  const input=document.createElement("input");input.type="text";
  input.className="ratio-section-name-input";input.maxLength=64;
  input.value=section.name;input.setAttribute("aria-label","セクション名を直接編集");
  button.replaceWith(input);
  let finished=false,composing=false;
  const finish=commit=>{
    if(finished)return;finished=true;
    const value=input.value.trim();
    if(commit&&value&&value!==section.name)
      mutate(d=>{d.sections.find(s=>s.id===sectionId).name=value});
    if(input.isConnected)input.replaceWith(button);
  };
  input.addEventListener("compositionstart",()=>{composing=true});
  input.addEventListener("compositionend",()=>{composing=false});
  input.addEventListener("keydown",e=>{
    if(e.isComposing||composing)return;
    if(e.key==="Enter"){e.preventDefault();finish(true)}
    if(e.key==="Escape"){e.preventDefault();finish(false)}
  });
  input.addEventListener("blur",()=>finish(!composing));
  input.focus();input.select();
}
let chunkRenameActive=false;
function beginChunkRename(){
  const section=selectedLocation().section;
  if(!section)return;
  const field=$("chunkInlineName"),select=$("chunkJump");
  field.value=section.chunkName;
  select.hidden=true;field.hidden=false;
  chunkRenameActive=true;$("renameChunk").classList.add("active");
  field.focus();field.select();
}
function finishChunkRename(commit){
  if(!chunkRenameActive)return;
  chunkRenameActive=false;
  const field=$("chunkInlineName"),select=$("chunkJump");
  const value=field.value.trim();
  field.hidden=true;select.hidden=false;
  $("renameChunk").classList.remove("active");
  const section=selectedLocation().section;
  if(commit&&value&&value!==section.chunkName){
    const target=section.chunkId;
    mutate(d=>{for(const sec of d.sections)if(sec.chunkId===target)sec.chunkName=value});
  }
}
function removeSectionById(sectionId){
  if(project.sections.length<=1)return;
  const index=project.sections.findIndex(s=>s.id===sectionId);
  if(index<0)return;
  const neighbor=project.sections[index+1]||project.sections[index-1];
  const selected=selection.sectionId===sectionId;
  if(mutate(d=>{d.sections=d.sections.filter(s=>s.id!==sectionId)},{structural:true})&&selected)
    setSelection(neighbor.id,neighbor.steps[0].id);
}
function renderSelection(){
  const loc=selectedLocation();if(!loc.step)return;
  selection={sectionId:loc.section.id,stepId:loc.step.id};
  const step=loc.step;
  if(!activeText||activeText.field!==$("editExpr")||activeText.stepId!==step.id)$("editExpr").value=chordExpression(step,project.presets);
  if(!pitchGesture&&(!activeText||activeText.field!==$("editPitch")||activeText.stepId!==step.id))$("editPitch").value=step.pitch;
  if(!beatGesture&&(!activeText||activeText.field!==$("editBeats")||activeText.stepId!==step.id))$("editBeats").value=step.beats+"/"+(step.beatUnit||4);
  for(const key of ["editExpr","editPitch","editBeats"]){
    const field=$(key);if(activeText?.field===field)continue;
    if(invalidDrafts.has(step.id+":"+key))field.setAttribute("aria-invalid","true");else field.removeAttribute("aria-invalid");
  }
  renderSectionNav();
  for(const card of $("timeline").querySelectorAll(".progression-cell[data-cid]")){
    const active=card.dataset.sid===selection.sectionId&&card.dataset.cid===selection.stepId;
    card.classList.toggle("active",active);
    card.setAttribute("aria-pressed",active?"true":"false");
  }
  $("moveLeft").disabled=loc.index===0;$("moveRight").disabled=loc.index===loc.section.steps.length-1;
  try{
    const result=calculate(step);
    $("hzReadout").textContent="最下音 "+hz(result.baseHz)+"Hz · "+result.freqs.length+"音";
  }catch(error){$("hzReadout").textContent="音高／比率エラー: "+error.message}
}
function render(){
  $("title").value=project.title;$("bpm").value=project.settings.bpm;
  $("playScope").value=playScope;
  $("loop").checked=project.settings.loop;$("wave").value=project.settings.wave;
  renderTimeline();renderPresets();renderSelection();renderHistory();
}
// Text editing is a single transaction, with a transient audition draft.
let activeText=null;
const invalidDrafts=new Map();
const editorKinds={editExpr:"expr",editPitch:"pitch",editBeats:"beats"};
function fieldValue(key,step){return key==="editExpr"?chordExpression(step,project.presets):key==="editPitch"?step.pitch:step.beats+"/"+(step.beatUnit||4)}
function startText(field){
  if(activeText?.field===field)return activeText;
  if(activeText)finishActiveText(true);
  const {section,step}=selectedLocation();
  const key=field.id,original=fieldValue(key,step),draftKey=step.id+":"+key;
  const saved=invalidDrafts.get(draftKey);
  activeText={field,key,sectionId:section.id,stepId:step.id,original,draftKey,composing:false,timer:null};
  if(saved!==undefined){field.value=saved;field.setAttribute("aria-invalid","true")}
  renderHistory();return activeText;
}
function applyText(d,t,value){
  const step=d.sections.find(s=>s.id===t.sectionId)?.steps.find(s=>s.id===t.stepId);
  if(!step)throw new Error("編集対象がありません");
  if(t.key==="editExpr")setChordExpression(d,step,value);
  else if(t.key==="editPitch")step.pitch=value.trim();
  else Object.assign(step,parseBeatNotation(value));
  return step;
}
function finishActiveText(commit=true){
  const t=activeText;if(!t)return true;
  clearTimeout(t.timer);activeText=null;
  const field=t.field,value=field.value;
  field.classList.remove("exact-editing");
  if(t.key!=="editExpr")field.readOnly=true;
  const current=selectedLocation().step;
  if(!commit||t.composing){
    invalidDrafts.delete(t.draftKey);field.removeAttribute("aria-invalid");
    field.value=fieldValue(t.key,current);stopAudition();renderHistory();return false;
  }
  let ok=true;
  if(value!==t.original)ok=mutate(d=>applyText(d,t,value),{preserveTargets:true});
  if(ok){
    invalidDrafts.delete(t.draftKey);field.removeAttribute("aria-invalid");field.value=fieldValue(t.key,selectedLocation().step);
    if(value!==t.original&&t.key!=="editBeats"&&t.lastAudition!==value)void auditionCard(selectedLocation().step);
  }
  else{invalidDrafts.set(t.draftKey,value);field.setAttribute("aria-invalid","true");field.value=value}
  renderHistory();return ok;
}
function cancelActiveDraft(){
  if(cancelValueGesture){cancelValueGesture();return true}
  if(activeText&&activeText.field.value!==activeText.original){finishActiveText(false);return true}
  if(activeText)finishActiveText(false);
  return false;
}
for(const [key,kind] of Object.entries(editorKinds)){
  const field=$(key);
  field.addEventListener("focus",()=>{if(key==="editExpr"||field.classList.contains("exact-editing"))startText(field)});
  field.addEventListener("input",()=>{
    if(field.readOnly)return;
    const t=activeText?.field===field?activeText:startText(field);
    field.removeAttribute("aria-invalid");clearTimeout(t.timer);renderHistory();
    if(kind==="beats"||t.composing)return;
    const value=field.value;
    t.timer=setTimeout(()=>{
      if(activeText!==t||t.composing||field.value!==value)return;
      try{
        const draft=copy(project),step=applyText(draft,t,value);
        validateProject(draft);
        t.lastAudition=value;void auditionCard(step,draft.presets);
      }catch(error){/* incomplete text is a draft, not a project mutation */}
    },260);
  });
  field.addEventListener("change",()=>{if(activeText?.field===field)finishActiveText(true)});
  field.addEventListener("blur",()=>{if(activeText?.field===field)finishActiveText(true)});
  field.addEventListener("compositionstart",()=>{if(activeText?.field===field){activeText.composing=true;clearTimeout(activeText.timer)}});
  field.addEventListener("compositionend",()=>{if(activeText?.field===field){activeText.composing=false;field.dispatchEvent(new Event("input",{bubbles:true}))}});
  field.addEventListener("keydown",e=>{
    if(e.isComposing||activeText?.composing)return;
    if(activeText?.field===field&&e.key==="Escape"){e.preventDefault();finishActiveText(false);field.blur()}
    else if(activeText?.field===field&&e.key==="Enter"){e.preventDefault();finishActiveText(true);field.blur()}
  });
}

$("presetSearch").addEventListener("input",()=>{$("presetChips").scrollTop=0;renderPresets()});
$("openPresetManager").addEventListener("click",()=>beginPresetEdit());
// Pressing Cancel must win over the field's on-blur auto-commit.
$("presetInlineCancel").addEventListener("pointerdown",e=>e.preventDefault());
$("presetInlineCancel").addEventListener("click",()=>finishPresetEdit(false));
$("presetInlineInput").addEventListener("keydown",e=>{
  if(e.isComposing)return;
  if(e.key==="Enter"){e.preventDefault();finishPresetEdit(true)}
  if(e.key==="Escape"){e.preventDefault();finishPresetEdit(false)}
});
$("presetInlineInput").addEventListener("blur",()=>{if(presetEditorActive)finishPresetEdit(true)});

$("renameChunk").addEventListener("click",()=>chunkRenameActive?finishChunkRename(true):beginChunkRename());
$("chunkInlineName").addEventListener("blur",()=>finishChunkRename(true));
$("chunkInlineName").addEventListener("keydown",e=>{
  if(e.isComposing)return;
  if(e.key==="Enter"){e.preventDefault();finishChunkRename(true)}
  if(e.key==="Escape"){e.preventDefault();finishChunkRename(false)}
});
$("masterVolume").addEventListener("input",e=>{
  $("masterVolumeMobile").value=e.target.value;
  engine.setMasterVolume(Number(e.target.value));
});
$("masterVolumeMobile").addEventListener("input",e=>{
  $("masterVolume").value=e.target.value;
  engine.setMasterVolume(Number(e.target.value));
});
function setSettingsOpen(open,focus=false){
  const btn=$("progMenuToggleBtn");
  btn.setAttribute("aria-expanded",String(open));$("progToolbarActions").classList.toggle("open",open);
  if(focus)btn.focus();
}
$("progMenuToggleBtn").addEventListener("click",()=>setSettingsOpen($("progMenuToggleBtn").getAttribute("aria-expanded")!=="true"));
document.addEventListener("pointerdown",e=>{
  if(!e.target.closest("#progToolbarActions,#progMenuToggleBtn"))setSettingsOpen(false);
});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"&&$("progMenuToggleBtn").getAttribute("aria-expanded")==="true"){e.preventDefault();setSettingsOpen(false,true)}
});
$("chunkJump").addEventListener("change",e=>{
  const chunk=chunksOf(project).find(c=>c.id===e.target.value);
  if(chunk)setSelection(chunk.sections[0].id,chunk.sections[0].steps[0].id);
});

bindBeatFlick($("editBeats"));
bindPitchFlick($("editPitch"));
$("title").addEventListener("change",e=>mutate(d=>d.title=e.target.value));
bindNumberScrub($("bpm"),{
  get:()=>project.settings.bpm,
  commit:value=>mutate(d=>{d.settings.bpm=value},{preserveTargets:true}),
  min:20,max:300,step:1
});
$("loop").addEventListener("change",e=>mutate(d=>d.settings.loop=e.target.checked));
$("wave").addEventListener("change",e=>mutate(d=>d.settings.wave=e.target.value));
// Pointer activation of the history buttons must cancel a draft BEFORE native blur commits it.
for(const [key,run] of [["undo",undo],["redo",redo]]){
  const button=$(key);let cancelled=false;
  button.addEventListener("pointerdown",e=>{
    cancelled=false;
    if(activeText&&activeText.field.value!==activeText.original||cancelValueGesture){
      e.preventDefault();cancelled=cancelActiveDraft();
    }
  });
  button.addEventListener("click",()=>{if(cancelled){cancelled=false;return}run()});
  button.addEventListener("pointercancel",()=>{cancelled=false});
}
const makeSection=(chunkId,chunkName,n)=>({
  id:id("s"),chunkId,chunkName,name:"Section "+n,repeat:1,
  steps:[{id:id("c"),expr:"4,5,6",pitch:"C4",beats:4,beatUnit:4}]
});
$("newSection").addEventListener("click",()=>{
  const current=selectedLocation().section;
  const sec=makeSection(current.chunkId,current.chunkName,project.sections.length+1);
  if(mutate(d=>{
    const index=d.sections.findIndex(s=>s.id===current.id);
    d.sections.splice(index+1,0,sec);
  },{structural:true})){
    setSelection(sec.id,sec.steps[0].id);beginSectionRename(sec.id);
  }
});
$("newChunk").addEventListener("click",()=>{
  const chunks=chunksOf(project),current=selectedLocation().section;
  const chunkId=id("chunk-");
  const sec=makeSection(chunkId,"チャンク "+(chunks.length+1),project.sections.length+1);
  if(mutate(d=>{
    const last=d.sections.findLastIndex(s=>s.chunkId===current.chunkId);
    d.sections.splice(last+1,0,sec);
  },{structural:true})){
    setSelection(sec.id,sec.steps[0].id);beginChunkRename();
  }
});
$("removeChunk").addEventListener("click",()=>{
  const current=selectedLocation().section;
  const allChunks=chunksOf(project),index=allChunks.findIndex(c=>c.id===current.chunkId);
  if(allChunks.length<=1)return;
  const neighbor=allChunks[index+1]||allChunks[index-1];
  if(mutate(d=>{d.sections=d.sections.filter(s=>s.chunkId!==current.chunkId)},{structural:true})){
    setSelection(neighbor.sections[0].id,neighbor.sections[0].steps[0].id);
  }
});
function insertChord(duplicate){
  const {section,step,index}=selectedLocation();
  const next=duplicate?{...copy(step),id:id("c")}:
    {id:id("c"),expr:"4,5,6",pitch:step.pitch,beats:4,beatUnit:4};
  if(mutate(d=>d.sections.find(s=>s.id===section.id).steps.splice(index+1,0,next),{structural:true}))
    setSelection(section.id,next.id);
}
$("addStep").addEventListener("click",()=>insertChord(false));
$("duplicate").addEventListener("click",()=>insertChord(true));
function swap(delta){
  const {section,index}=selectedLocation();const target=index+delta;
  if(target<0||target>=section.steps.length)return;
  mutate(d=>{const steps=d.sections.find(s=>s.id===section.id).steps;[steps[index],steps[target]]=[steps[target],steps[index]]},{structural:true});
}
$("moveLeft").addEventListener("click",()=>swap(-1));
$("moveRight").addEventListener("click",()=>swap(1));
bindNumberScrub($("gridColumns"),{
  get:()=>columns,
  commit:value=>{columns=value;saveSelection();updateGridColumns()},
  min:1,max:12,step:1
});
window.addEventListener("resize",updateGridColumns);
if(typeof ResizeObserver!=="undefined")new ResizeObserver(updateGridColumns).observe($("timeline"));
function stopAudition(){
  clearTimeout(tapTimer);tapVersion++;
  for(const id of tapVoiceIds)engine.stopVoice(id);tapVoiceIds=[];
}
function updatePlayStatus(running){
  const button=$("play");
  button.querySelector(".play-icon").textContent=running?"↻":"▶";
  button.querySelector(".play-word").textContent=running?" 最初から":" 再生";
  button.classList.toggle("playing",running);
  button.setAttribute("aria-label",running?"進行を再スタート":"選択コードから進行を再生");
  button.title=running?"再生中：押すと選択位置から再スタート":"選択位置から再生";
}
function stopPlayback(){
  stopAudition();transportVoiceIds=[];
  runId++;playing=false;playingStepId=null;voiceCount=0;clearTimeout(timer);timer=null;
  engine.stopAll();updatePlayStatus(false);
  document.querySelectorAll(".progression-cell.playing").forEach(el=>el.classList.remove("playing"));
}
async function startVoices(step,token){
  const {freqs}=calculate(step);
  await engine.ensure();
  engine.setMasterVolume(Number($("masterVolume").value));
  if(token!==runId)return false;
  for(const id of transportVoiceIds)engine.stopVoice(id);
  const generation=++voiceGeneration;
  const ids=freqs.map((_,i)=>"ratio-"+generation+"-"+i);
  transportVoiceIds=ids;voiceCount=freqs.length;playingStepId=step.id;
  const amplitude=Math.min(.26,.45/freqs.length);
  await Promise.all(freqs.map((freq,index)=>engine.startVoice(ids[index],freq,project.settings.wave,amplitude)));
  if(token!==runId||generation!==voiceGeneration){for(const id of ids)engine.stopVoice(id);return false}
  return true;
}
async function refreshPlayingVoices(){
  const step=project.sections.flatMap(s=>s.steps).find(s=>s.id===playingStepId);
  if(!step||!engine.ctx)return;
  const token=runId,generation=voiceGeneration;
  try{
    const {freqs}=calculate(step),amplitude=Math.min(.26,.45/freqs.length);
    const ids=freqs.map((_,i)=>"ratio-"+generation+"-"+i);
    for(const id of transportVoiceIds.slice(freqs.length))engine.stopVoice(id);
    transportVoiceIds=ids;
    await Promise.all(freqs.map((freq,i)=>engine.startVoice(ids[i],freq,project.settings.wave,amplitude)));
    if(token===runId&&generation===voiceGeneration)voiceCount=freqs.length;
    else for(const id of ids)engine.stopVoice(id);
  }catch(error){notice(error.message||"音声更新失敗",true)}
}

function highlightStep(step){
  for(const card of document.querySelectorAll(".progression-cell[data-cid]")){
    card.classList.toggle("playing",card.dataset.cid===step.id);
  }
}
function startPlayback(sectionId=null,chunkId=null){
  stopPlayback();
  const steps=flatten(project,sectionId,chunkId);if(!steps.length)return;
  const token=runId;
  const selectedIndex=steps.findIndex(s=>s.stepId===selection.stepId);
  let index=selectedIndex>=0?selectedIndex:0;
  playing=true;updatePlayStatus(true);
  const advance=async()=>{
    if(token!==runId||!playing)return;
    if(index>=steps.length){if(project.settings.loop)index=0;else{stopPlayback();return}}
    const step=steps[index++];
    try{
      const ok=await startVoices(step,token);
      if(!ok)return;
      highlightStep(step);
      const duration=quarterBeats(step)*60000/project.settings.bpm;
      timer=setTimeout(advance,duration);
    }catch(error){stopPlayback();notice(error.message||"再生できません",true)}
  };
  void advance();
}
// Independent tap-preview voices allow repeated audition without stopping
// an already running progression. Previous tap voices are faded on each tap.
async function auditionCard(step,presets=project.presets){
  const version=++tapVersion;
  clearTimeout(tapTimer);
  for(const id of tapVoiceIds)engine.stopVoice(id);
  tapVoiceIds=[];
  const ownIds=[];
  try{
    const {freqs}=calculate(step,presets);
    await engine.ensure();
    if(version!==tapVersion)return;
    engine.setMasterVolume(Number($("masterVolume").value));
    const gain=Math.min(.13,.35/freqs.length);
    const voices=freqs.map((freq,i)=>{
      const id="tap-"+version+"-"+i;
      ownIds.push(id);
      return engine.startVoice(id,freq,project.settings.wave,gain);
    });
    await Promise.all(voices);
    if(version!==tapVersion){
      for(const id of ownIds)engine.stopVoice(id);
      return;
    }
    tapVoiceIds=ownIds;
    tapTimer=setTimeout(()=>{
      if(version!==tapVersion)return;
      for(const id of ownIds)engine.stopVoice(id);
      tapVoiceIds=[];
    },Math.max(320,Math.min(850,quarterBeats(step)*60000/project.settings.bpm)));
  }catch(error){
    for(const id of ownIds)engine.stopVoice(id);
    notice("コードの試聴に失敗しました: "+error.message,true);
  }
}
function preview(){return auditionCard(selectedLocation().step)}
function playSelectedScope(){
  if(playScope==="section")startPlayback(selection.sectionId);
  else if(playScope==="chunk")startPlayback(null,selectedLocation().section.chunkId);
  else startPlayback();
}
$("playScope").addEventListener("change",e=>{
  playScope=e.target.value;saveSelection();
});
$("play").addEventListener("click",playSelectedScope);
$("stop").addEventListener("click",stopPlayback);
$("preview").addEventListener("click",()=>{void preview()});
document.addEventListener("keydown",e=>{
  if(isNativeUndoTarget(e.target)||e.target.closest("select,button"))return;
  if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="z"){
    e.preventDefault();e.shiftKey?redo():undo();
  }else if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==="y"){
    e.preventDefault();redo();
  }else if(e.code==="Space"&&!e.repeat){
    e.preventDefault();playing?stopPlayback():playSelectedScope();
  }
});
function ioContent(){
  return $("ioFormat").value==="json"?JSON.stringify(project,null,2)+"\n":exportText(project);
}
$("openIO").addEventListener("click",()=>{$("ioText").value=ioContent();$("ioStatus").textContent="JSONと進行テキストの相互入出力に対応";$("ioDialog").showModal()});
$("ioClose").addEventListener("click",()=>$("ioDialog").close());
$("ioExport").addEventListener("click",()=>{$("ioText").value=ioContent();$("ioStatus").textContent="現在の進行を書き出しました"});
$("ioFormat").addEventListener("change",()=>{$("ioText").value=ioContent()});
$("ioFile").addEventListener("change",async e=>{
  const file=e.target.files?.[0];if(!file)return;
  if(file.size>1024*1024){$("ioStatus").textContent="1MBを超えるデータは読み込めません";return}
  try{$("ioText").value=await file.text();$("ioFormat").value=file.name.toLowerCase().endsWith(".json")?"json":"text";$("ioStatus").textContent="読込準備完了（まだ上書きしていません）"}catch(error){$("ioStatus").textContent="ファイルを読めません: "+error.message}
});
$("ioImport").addEventListener("click",()=>{
  const source=$("ioText").value;
  try{
    const incoming=source.trim().startsWith("{")?validateProject(JSON.parse(source)):importText(source);
    const before=copy(project);
    stopPlayback();project=incoming;
    history.push({type:"ratio_import",before,after:copy(incoming)});
    chooseFirst();saveSelection();save();render();$("ioStatus").textContent="進行を読み込みました";
    notice("読み込み成功。元に戻すで直前の進行に復帰できます");
  }catch(error){$("ioStatus").textContent="読み込み失敗（現在の進行は保持）: "+error.message}
});
$("ioDownload").addEventListener("click",()=>{
  const type=$("ioFormat").value,blob=new Blob([ioContent()],{type:type==="json"?"application/json":"text/plain"});
  const url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download="mu-chordbot-ratio."+(type==="json"?"json":"txt");document.body.append(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
});
// iOS Safari may interrupt AudioContext after brief focus loss. Unlock/resume
// during the originating pointer or keyboard gesture; deferred click handlers
// alone are not reliable activation points on all WebKit versions.
function resumeAudioContext({gesture=false}={}){
  if(document.visibilityState==="hidden")return;
  if(!engine.ctx&&!gesture)return;
  if(engine.ctx?.state==="running")return;
  void engine.ensure().catch(error=>{
    // A backgrounded page may legitimately refuse to resume; the next
    // explicit gesture retries without discarding the user's composition.
    if(gesture)notice(error.message||"音声を再開できません。再度タップしてください",true);
  });
}
document.addEventListener("pointerdown",event=>{
  if(event.target.closest(".ratio-app button,.ratio-app select,.ratio-app input[type=range]"))
    resumeAudioContext({gesture:true});
},{capture:true,passive:true});
document.addEventListener("keydown",event=>{
  if(!event.repeat&&(event.code==="Space"||event.code==="Enter"))
    resumeAudioContext({gesture:true});
},{capture:true});
let audioWasHidden=false;
function recoverAudioAfterFocus(){
  if(document.visibilityState==="hidden"||!engine.ctx)return;
  const ctx=engine.ctx;
  if(ctx.state==="suspended"||ctx.state==="interrupted"){
    resumeAudioContext();
    return;
  }
  if(!audioWasHidden||ctx.state!=="running")return;
  // WebKit has historically reported "running" with a frozen clock on
  // return from the background. Recover only if time fails to advance.
  audioWasHidden=false;
  const time=ctx.currentTime;
  setTimeout(()=>{
    if(document.visibilityState==="hidden"||ctx!==engine.ctx)return;
    if(ctx.state==="running"&&ctx.currentTime<=time+0.001){
      void ctx.suspend().then(()=>ctx.resume()).catch(()=>{
        notice("音声の再開には画面をタップしてください",true);
      });
    }
  },200);
}
document.addEventListener("visibilitychange",()=>{
  if(document.visibilityState==="hidden"){
    audioWasHidden=true;
    // Browser-managed background playback is not reliable on iOS: stop the
    // transport visibly instead of keeping a silently advancing timer.
    if(playing||tapVoiceIds.length)stopPlayback();
  }else recoverAudioAfterFocus();
});
window.addEventListener("pageshow",recoverAudioAfterFocus);
window.addEventListener("focus",recoverAudioAfterFocus);
window.addEventListener("pagehide",()=>stopPlayback());
boot();
