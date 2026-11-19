import {AudioEngine} from "../src/audio.js";
import {frequencyFromPitch} from "../src/pitch.js";
import {HistoryManager, isNativeUndoTarget} from "../src/history.js";
import {newProject,validateProject,parsePitch,parseRatio,parseNamedRatio,parseBeatNotation,beatLabel,quarterBeats,flickGridPitch,flickEnharmonicCells,beatFractionGridValue,beatFractionGridCells,FLICK_LETTERS,FLICK_ACCIDENTALS,chunksOf,flatten,importText,exportText} from "./model.mjs";

const $=id=>document.getElementById(id);
const copy=value=>JSON.parse(JSON.stringify(value));
const STORE="muChordbot.ratioMode.v1";
const UI_STORE="muChordbot.ratioMode.ui.v1";
const history=new HistoryManager(100);
const engine=new AudioEngine();
let project,saveAllowed=true,selection={sectionId:null,stepId:null},columns=4,playScope="all";
let timer=null,runId=0,playing=false,playingStepId=null,voiceCount=0;
let tapVersion=0,tapTimer=null,tapVoiceIds=[];
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
function mutate(change,{structural=false,audition=false}={}){
  try{
    const before=copy(project),draft=copy(project);change(draft);
    const next=validateProject(draft);
    if(JSON.stringify(before)===JSON.stringify(next))return true;
    if(structural)stopPlayback();
    project=next;history.push({type:"ratio_edit",before,after:copy(next)});
    chooseFirst();saveSelection();save();if(saveAllowed)notice("");render();
    if(playing&&playingStepId)void refreshPlayingVoices();
    else if(audition)void preview();
    return true;
  }catch(error){notice(error.message||String(error),true);return false}
}
function setSelection(sid,cid){
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
  $("editExpr").value=current.expr;$("editPitch").value=current.pitch;
  $("editBeats").value=current.beats+"/"+(current.beatUnit||4);
  // History restores data, not unsolicited sound.
  if(wasPlaying)startPlayback();
}
function undo(){history.undo(restore);renderHistory()}
function redo(){history.redo(restore);renderHistory()}
function renderHistory(){
  $("undo").disabled=!history.canUndo();
  $("redo").disabled=!history.canRedo();
}
function calculate(step){
  const parsed=parseRatio(step.expr,project.presets);
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
  const name=document.createElement("span");name.className="cell-title";name.textContent=step.expr;
  const note=document.createElement("span");note.className="cell-note";note.textContent=step.pitch;
  const meta=document.createElement("span");meta.className="cell-meta";meta.textContent=beatLabel(step);
  card.append(name,note,meta);
  card.addEventListener("click",()=>{setSelection(section.id,step.id);void auditionCard(step)});
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
  field.classList.add("exact-editing");
  field.readOnly=false;field.focus();field.select();
}
// In a 7x5 sheet the rows read B, A, G, F, E, D, C from TOP to BOTTOM.
// Moving UP raises pitch, following the bottom-C, top-B orientation.
let pitchGesture=null,beatGesture=null;
function bindPitchFlick(field){
  let lastTap=null;
  field.readOnly=true;
  field.addEventListener("blur",()=>{field.classList.remove("exact-editing");field.readOnly=true});
  field.addEventListener("dblclick",event=>{
    event.preventDefault();lastTap=null;
    activatePreciseInput(field);
  });
  field.addEventListener("pointerdown",event=>{
    if(event.button!==0||!event.isPrimary||pitchGesture)return;
    if(field.classList.contains("exact-editing"))return;
    const now=performance.now();
    const isDouble=event.detail>=2 || (lastTap&&now-lastTap.time<350&&
      Math.hypot(event.clientX-lastTap.x,event.clientY-lastTap.y)<18);
    // Decide on release: a fast second pointerdown might turn into a
    // drag, which must remain a flick rather than opening the keyboard.
    const {section,step}=selectedLocation();
    const parsed=parsePitch(step.pitch).label;
    const match=/^([A-G])([#b‡d]?)(-?\d{1,2})/.exec(parsed);
    if(!match)return;
    event.preventDefault();
    resumeAudioContext({gesture:true});
    pitchGesture={pointerId:event.pointerId,sectionId:section.id,stepId:step.id,
      original:step.pitch,candidate:step.pitch,x:event.clientX,y:event.clientY,
      moved:false,audioAt:0,doubleCandidate:isDouble};
    field.setPointerCapture(event.pointerId);
    placeGesturePanel(field,flickPanel,260,268);
    highlightFlickPitch(parsed);flickPanel.hidden=false;
  });
  field.addEventListener("pointermove",event=>{
    const g=pitchGesture;if(!g||g.pointerId!==event.pointerId)return;
    const dx=event.clientX-g.x,dy=event.clientY-g.y;
    if(!g.moved&&Math.hypot(dx,dy)<7)return;
    g.moved=true;lastTap=null;
    const next=flickGridPitch(g.original,Math.round(-dy/23),Math.round(dx/28));
    if(next===g.candidate)return;
    g.candidate=next;field.value=next;highlightFlickPitch(next);
    const now=performance.now();
    if(now-g.audioAt>=110){
      g.audioAt=now;
      const audition={...selectedLocation().step,pitch:next};
      try{calculate(audition);void auditionCard(audition)}
      catch(error){/* notation can legitimately exceed audible Hz range */}
    }
  });
  function finish(event,accept){
    const g=pitchGesture;if(!g||g.pointerId!==event.pointerId)return;
    pitchGesture=null;flickPanel.hidden=true;
    if(field.hasPointerCapture(event.pointerId))field.releasePointerCapture(event.pointerId);
    const current=selectedLocation();
    if(accept&&g.moved&&g.candidate!==g.original&&
       current.section.id===g.sectionId&&current.step.id===g.stepId){
      // One gesture, one valid state mutation, one Undo entry.
      if(!mutate(d=>{d.sections.find(s=>s.id===g.sectionId)
          .steps.find(x=>x.id===g.stepId).pitch=g.candidate}))
        field.value=current.step.pitch;
    }else{
      field.value=current.step.pitch;
      if(accept&&!g.moved){
        if(g.doubleCandidate){lastTap=null;activatePreciseInput(field)}
        else lastTap={time:performance.now(),x:event.clientX,y:event.clientY};
      }
    }
  }
  field.addEventListener("pointerup",event=>finish(event,true));
  field.addEventListener("pointercancel",event=>finish(event,false));
  window.addEventListener("blur",()=>{
    if(!pitchGesture)return;
    pitchGesture=null;flickPanel.hidden=true;field.value=selectedLocation().step.pitch;
  });
}
function highlightBeats(value){
  const grid=beatFractionGridCells(value);
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
  for(const cell of beatsGrid.children)
    cell.classList.toggle("selected",
      Number(cell.dataset.num)===Number(value.beats)&&
      Number(cell.dataset.den)===Number(value.beatUnit));
  $("beatsFlickValue").textContent=beatLabel(value);
}
function bindBeatFlick(field){
  let lastTap=null;
  field.addEventListener("blur",()=>field.classList.remove("exact-editing"));
  field.addEventListener("dblclick",e=>{e.preventDefault();lastTap=null;activatePreciseInput(field)});
  field.addEventListener("pointerdown",event=>{
    if(event.button!==0||!event.isPrimary||beatGesture)return;
    if(field.classList.contains("exact-editing"))return;
    const now=performance.now();
    const isDouble=event.detail>=2||(lastTap&&now-lastTap.time<350&&
      Math.hypot(event.clientX-lastTap.x,event.clientY-lastTap.y)<18);
    event.preventDefault();
    const {section,step}=selectedLocation();
    const original={beats:step.beats,beatUnit:step.beatUnit||4};
    beatGesture={pointerId:event.pointerId,sectionId:section.id,stepId:step.id,
      original,current:original,x:event.clientX,y:event.clientY,moved:false,doubleCandidate:isDouble};
    field.setPointerCapture(event.pointerId);
    placeGesturePanel(field,beatsPanel,270,225);
    highlightBeats(original);beatsPanel.hidden=false;
  });
  field.addEventListener("pointermove",event=>{
    const g=beatGesture;if(!g||g.pointerId!==event.pointerId)return;
    const dx=event.clientX-g.x,dy=event.clientY-g.y;
    if(!g.moved&&Math.hypot(dx,dy)<7)return;
    g.moved=true;lastTap=null;
    const value=beatFractionGridValue(Math.round(g.original.beats),g.original.beatUnit,
      Math.round(dy/29),Math.round(dx/33));
    g.current=value;field.value=value.beats+"/"+value.beatUnit;
    highlightBeats(value);
  });
  function finish(event,accept){
    const g=beatGesture;if(!g||g.pointerId!==event.pointerId)return;
    beatGesture=null;beatsPanel.hidden=true;
    if(field.hasPointerCapture(event.pointerId))field.releasePointerCapture(event.pointerId);
    const current=selectedLocation();
    if(accept&&g.moved&&
       (g.current.beats!==g.original.beats||g.current.beatUnit!==g.original.beatUnit)&&
       current.section.id===g.sectionId&&current.step.id===g.stepId){
      if(!mutate(d=>{
        const st=d.sections.find(s=>s.id===g.sectionId).steps.find(x=>x.id===g.stepId);
        st.beats=g.current.beats;st.beatUnit=g.current.beatUnit;
      }))field.value=current.step.beats+"/"+(current.step.beatUnit||4);
    }else{
      field.value=current.step.beats+"/"+(current.step.beatUnit||4);
      if(accept&&!g.moved){
        if(g.doubleCandidate){lastTap=null;activatePreciseInput(field)}
        else lastTap={time:performance.now(),x:event.clientX,y:event.clientY};
      }
    }
  }
  field.addEventListener("pointerup",e=>finish(e,true));
  field.addEventListener("pointercancel",e=>finish(e,false));
  window.addEventListener("blur",()=>{
    if(!beatGesture)return;
    beatGesture=null;beatsPanel.hidden=true;
    const current=selectedLocation().step;
    field.value=current.beats+"/"+(current.beatUnit||4);
  });
}
// Repeat count has its own integral range; unlike beats it does not use a
// fraction grid. One drag still contributes exactly one Undo action.
function bindNumberScrub(field,{get,commit,min,max,step,fineStep=step}){
  let gesture=null;
  field.addEventListener("pointerdown",event=>{
    if(event.button!==0||!event.isPrimary||gesture)return;
    const original=get();
    gesture={pointerId:event.pointerId,originY:event.clientY,original,
      value:original,increment:event.altKey||event.shiftKey?fineStep:step,moved:false};
    field.setPointerCapture(event.pointerId);
  });
  field.addEventListener("pointermove",event=>{
    const g=gesture;if(!g||g.pointerId!==event.pointerId)return;
    const dy=g.originY-event.clientY;
    if(!g.moved&&Math.abs(dy)<7)return;
    g.moved=true;
    const units=Math.round(dy/18);
    g.value=Math.min(max,Math.max(min,Math.round((g.original+units*g.increment)*100)/100));
    field.dataset.dragging="true";
    field.value=String(g.value);
  });
  function finish(event,accept){
    const g=gesture;if(!g||g.pointerId!==event.pointerId)return;
    gesture=null;
    if(field.hasPointerCapture(event.pointerId))field.releasePointerCapture(event.pointerId);
    field.dataset.dragging="false";
    if(accept&&g.moved&&g.value!==g.original)commit(g.value);
    else field.value=String(get());
  }
  field.addEventListener("pointerup",event=>finish(event,true));
  field.addEventListener("pointercancel",event=>finish(event,false));
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
    repeat.title="上下へスライドして反復回数を変更。タップで直接入力";
    bindNumberScrub(repeat,{
      get:()=>project.sections.find(s=>s.id===section.id)?.repeat??section.repeat,
      commit:value=>mutate(d=>{d.sections.find(s=>s.id===section.id).repeat=value}),
      min:1,max:16,step:1
    });
    repeat.addEventListener("change",()=>{
      if(repeat.dataset.dragging==="true")return;
      const value=Number(repeat.value);
      if(!Number.isInteger(value)||value<1||value>16){
        repeat.value=String(project.sections.find(s=>s.id===section.id).repeat);return;
      }
      mutate(d=>{d.sections.find(s=>s.id===section.id).repeat=value});
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
  row.hidden=false;presetEditorActive=true;
  field.focus();field.select();
}
function finishPresetEdit(commit){
  if(!presetEditorActive)return;
  if(!commit){
    presetEditorActive=false;editingPresetName=null;
    $("presetInlineRow").hidden=true;return;
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
}
function renderPresets(){
  const chips=$("presetChips"),scroll=chips.scrollTop,filter=$("presetSearch").value.trim().toLocaleLowerCase();
  const fragment=document.createDocumentFragment();
  for(const preset of project.presets){
    if(filter&&!((preset.name+" "+preset.ratios).toLocaleLowerCase().includes(filter)))continue;
    const item=document.createElement("div");item.className="preset-item";
    const chip=document.createElement("button");chip.type="button";chip.className="ratio-preset";
    const name=document.createElement("strong");name.textContent=preset.name;
    const ratio=document.createElement("small");ratio.textContent=preset.ratios;
    chip.append(name,ratio);chip.title="選択コードへ "+preset.name+" を設定";
    chip.addEventListener("click",()=>mutate(d=>{selectedLocation(d).step.expr=preset.name},{audition:true}));
    chip.addEventListener("dblclick",e=>{e.preventDefault();beginPresetEdit(preset.name)});
    const edit=document.createElement("button");edit.type="button";edit.className="preset-edit";
    edit.textContent="✎";edit.title=preset.name+" を直接編集";
    edit.setAttribute("aria-label",preset.name+" をその場で編集");
    edit.addEventListener("click",()=>beginPresetEdit(preset.name));
    const del=document.createElement("button");del.type="button";del.className="preset-remove";
    del.textContent="×";del.title=preset.name+" を解除";
    del.setAttribute("aria-label",preset.name+" を登録解除");
    del.addEventListener("click",e=>{e.stopPropagation();removePreset(preset.name)});
    item.append(chip,edit,del);fragment.append(item);
  }
  chips.replaceChildren(fragment);chips.scrollTop=scroll;
}
function setRatioExpression(d,value){
  const expression=value.trim();
  if(expression.startsWith("[")){
    const entry=parseNamedRatio(expression);
    const existing=d.presets.find(p=>p.name.toLocaleLowerCase()===entry.name.toLocaleLowerCase());
    if(existing){existing.name=entry.name;existing.ratios=entry.ratios}
    else d.presets.push(entry);
    selectedLocation(d).step.expr=entry.name;
  }else selectedLocation(d).step.expr=expression;
}
function updateGridColumns(){
  const track=$("timeline"),width=track.clientWidth||window.innerWidth;
  const min=window.innerWidth<=640?116:window.innerWidth<=950?104:88;
  const max=Math.max(1,Math.floor((width-16+6)/(min+6)));
  const actual=Math.min(columns,max);
  track.style.setProperty("--progression-columns",String(actual));
  track.dataset.columns=String(actual);
  $("gridColumns").value=String(columns);
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
  if(document.activeElement!==$("editExpr"))$("editExpr").value=step.expr;
  if(!pitchGesture&&document.activeElement!==$("editPitch"))$("editPitch").value=step.pitch;
  if(!beatGesture&&document.activeElement!==$("editBeats"))$("editBeats").value=step.beats+"/"+(step.beatUnit||4);
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
function commitField(which,value,field){
  let success=false;
  if(which==="expr")success=mutate(d=>setRatioExpression(d,value),{audition:true});
  if(which==="pitch")success=mutate(d=>selectedLocation(d).step.pitch=value.trim(),{audition:true});
  if(which==="beats"&&field.dataset.dragging!=="true")success=mutate(d=>{
    const fraction=parseBeatNotation(value);
    selectedLocation(d).step.beats=fraction.beats;
    selectedLocation(d).step.beatUnit=fraction.beatUnit;
  });

  field.setAttribute("aria-invalid",success?"false":"true");
  // Once [name]ratios is committed, the actual chord expression is its
  // registered name. Present that authoritative value immediately in place.
  if(success&&which==="expr"&&value.trim().startsWith("["))
    field.value=selectedLocation().step.expr;
}
[["editExpr","expr"],["editPitch","pitch"],["editBeats","beats"]].forEach(([key,kind])=>{
  $(key).addEventListener("change",e=>commitField(kind,e.target.value,e.target));
  $(key).addEventListener("input",e=>e.target.removeAttribute("aria-invalid"));
});
// Type-and-audition without waiting for a field blur; incomplete pitches stay editable.
const typingTimers=new Map();
for(const [key,which] of [["editExpr","expr"],["editPitch","pitch"]]){
  $(key).addEventListener("input",e=>{
    clearTimeout(typingTimers.get(key));
    const value=e.target.value,field=e.target,origin={...selection};
    const timer=setTimeout(()=>{
      if(field.value!==value||field.dataset.composing==="true"||selection.stepId!==origin.stepId||selection.sectionId!==origin.sectionId)return;
      if(which==="expr"&&value.trim().startsWith("["))return; // named registration is atomic on Enter/blur
      const draft=copy(project);
      if(which==="expr")setRatioExpression(draft,value);
      else selectedLocation(draft).step.pitch=value.trim();
      try{validateProject(draft)}catch(error){return}
      mutate(d=>which==="expr"?setRatioExpression(d,value):selectedLocation(d).step.pitch=value.trim(),{audition:true});
    },260);
    typingTimers.set(key,timer);
  });
  $(key).addEventListener("compositionstart",e=>{
    e.target.dataset.composing="true";clearTimeout(typingTimers.get(key));
  });
  $(key).addEventListener("compositionend",e=>{
    e.target.dataset.composing="false";
    e.target.dispatchEvent(new Event("input",{bubbles:true}));
  });
}
$("presetSearch").addEventListener("input",()=>{$("presetChips").scrollTop=0;renderPresets()});
$("openPresetManager").addEventListener("click",()=>beginPresetEdit());
// Pressing Cancel must win over the field's on-blur auto-commit.
$("presetInlineCancel").addEventListener("pointerdown",e=>{e.preventDefault();finishPresetEdit(false)});
$("presetInlineCancel").addEventListener("click",()=>finishPresetEdit(false));
$("presetInlineInput").addEventListener("keydown",e=>{
  if(e.isComposing)return;
  if(e.key==="Enter"){e.preventDefault();finishPresetEdit(true)}
  if(e.key==="Escape"){e.preventDefault();finishPresetEdit(false)}
});
$("presetInlineInput").addEventListener("blur",()=>{if(presetEditorActive)finishPresetEdit(true)});
$("editExpr").addEventListener("keydown",e=>{
  if(e.key==="Enter"&&!e.isComposing){e.preventDefault();e.target.blur()}
});
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
$("progMenuToggleBtn").addEventListener("click",()=>{
  const btn=$("progMenuToggleBtn"),open=btn.getAttribute("aria-expanded")!=="true";
  btn.setAttribute("aria-expanded",String(open));
  $("progToolbarActions").classList.toggle("open",open);
});
$("chunkJump").addEventListener("change",e=>{
  const chunk=chunksOf(project).find(c=>c.id===e.target.value);
  if(chunk)setSelection(chunk.sections[0].id,chunk.sections[0].steps[0].id);
});

bindBeatFlick($("editBeats"));
bindPitchFlick($("editPitch"));
$("title").addEventListener("change",e=>mutate(d=>d.title=e.target.value));
$("bpm").addEventListener("change",e=>mutate(d=>d.settings.bpm=Number(e.target.value)));
$("loop").addEventListener("change",e=>mutate(d=>d.settings.loop=e.target.checked));
$("wave").addEventListener("change",e=>mutate(d=>d.settings.wave=e.target.value));
$("undo").addEventListener("click",undo);
$("redo").addEventListener("click",redo);
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
$("gridColumns").addEventListener("change",e=>{
  const v=Number(e.target.value);
  if(!Number.isInteger(v)||v<1||v>12){e.target.value=String(columns);return}
  columns=v;saveSelection();updateGridColumns();
});
window.addEventListener("resize",updateGridColumns);
function stopPlayback(){
  clearTimeout(tapTimer);tapVersion++;tapVoiceIds=[];
  runId++;playing=false;playingStepId=null;voiceCount=0;clearTimeout(timer);timer=null;
  engine.stopAll();$("play").textContent="▶ 再生";$("play").classList.remove("playing");
  document.querySelectorAll(".progression-cell.playing").forEach(el=>el.classList.remove("playing"));
}
async function startVoices(step,token){
  const {freqs}=calculate(step);
  await engine.ensure();
  engine.setMasterVolume(Number($("masterVolume").value));
  if(token!==runId)return false;
  engine.stopAll();voiceCount=freqs.length;playingStepId=step.id;
  const amplitude=Math.max(.045,.26/Math.sqrt(freqs.length));
  await Promise.all(freqs.map((freq,index)=>engine.startVoice("ratio-"+index,freq,project.settings.wave,amplitude)));
  if(token!==runId){engine.stopAll();return false}
  return true;
}
async function refreshPlayingVoices(){
  const step=project.sections.flatMap(s=>s.steps).find(s=>s.id===playingStepId);
  if(!step||!engine.ctx)return;
  const token=runId;
  try{
    const {freqs}=calculate(step),amplitude=Math.max(.045,.26/Math.sqrt(freqs.length));
    for(let i=freqs.length;i<voiceCount;i++)engine.stopVoice("ratio-"+i);
    await Promise.all(freqs.map((freq,i)=>engine.startVoice("ratio-"+i,freq,project.settings.wave,amplitude)));
    if(token===runId)voiceCount=freqs.length;
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
  playing=true;$("play").textContent="▶ 再生";$("play").classList.add("playing");
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
async function auditionCard(step){
  const version=++tapVersion;
  clearTimeout(tapTimer);
  for(const id of tapVoiceIds)engine.stopVoice(id);
  tapVoiceIds=[];
  const ownIds=[];
  try{
    const {freqs}=calculate(step);
    await engine.ensure();
    if(version!==tapVersion)return;
    engine.setMasterVolume(Number($("masterVolume").value));
    const gain=Math.min(.13,.22/Math.sqrt(freqs.length));
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
async function preview(){
  const step=selectedLocation().step;
  stopPlayback();
  const token=runId;
  try{
    const ok=await startVoices(step,token);if(!ok)return;
    highlightStep(step);
    timer=setTimeout(()=>{if(token===runId)stopPlayback()},Math.min(1800,quarterBeats(step)*60000/project.settings.bpm));
  }catch(error){stopPlayback();notice(error.message||"試聴できません",true)}
}
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
    e.preventDefault();playing?stopPlayback():startPlayback();
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
