import {AudioEngine} from "../src/audio.js";
import {frequencyFromPitch} from "../src/pitch.js";
import {HistoryManager, isNativeUndoTarget} from "../src/history.js";
import {newProject,validateProject,parsePitch,parseRatio,flatten,importText,exportText} from "./model.mjs";

const $=id=>document.getElementById(id);
const copy=value=>JSON.parse(JSON.stringify(value));
const STORE="muChordbot.ratioMode.v1";
const UI_STORE="muChordbot.ratioMode.ui.v1";
const history=new HistoryManager(100);
const engine=new AudioEngine();
let project,saveAllowed=true,selection={sectionId:null,stepId:null};
let timer=null,runId=0,playing=false,playingStepId=null,voiceCount=0;
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
    if(ui&&typeof ui.sectionId==="string"&&typeof ui.stepId==="string")selection=ui;
  }catch(error){/* UI-only state is non-authoritative. */}
  chooseFirst();render();
}
function saveSelection(){
  try{localStorage.setItem(UI_STORE,JSON.stringify(selection))}catch(error){/* UI selection optional. */}
}
function save(){
  if(!saveAllowed){$("saveState").textContent="保存停止";return}
  try{localStorage.setItem(STORE,JSON.stringify(project));$("saveState").textContent="端末内保存済み"}
  catch(error){saveAllowed=false;$("saveState").textContent="保存停止";notice("端末内保存に失敗しました。入出力からファイルへ退避してください。",true)}
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
    chooseFirst();save();notice("");render();
    if(playing&&playingStepId)void refreshPlayingVoices();
    else if(audition)void preview();
    return true;
  }catch(error){notice(error.message||String(error),true);return false}
}
function setSelection(sid,cid){
  selection={sectionId:sid,stepId:cid};
  saveSelection();renderSelection();
}
function restore(snapshot){
  const wasPlaying=playing;
  stopPlayback();project=copy(snapshot);
  chooseFirst();saveSelection();save();render();notice("");
  if(wasPlaying)startPlayback(); else void preview();
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
function makeCard(section,step,index){
  const card=document.createElement("button");card.type="button";
  card.className="progression-cell";card.dataset.sid=section.id;card.dataset.cid=step.id;
  card.draggable=true;
  card.style.width=Math.max(96,Math.min(206,84+step.beats*13))+"px";
  card.setAttribute("aria-label",section.name+" のコード "+(index+1)+" "+step.expr+" "+step.pitch+" "+step.beats+"拍");
  const name=document.createElement("span");name.className="cell-title";name.textContent=step.expr;
  const note=document.createElement("span");note.className="cell-note";note.textContent=step.pitch;
  const meta=document.createElement("span");meta.className="cell-meta";meta.textContent=(index+1)+" · "+step.beats+"拍";
  card.append(name,note,meta);
  card.addEventListener("click",()=>setSelection(section.id,step.id));
  card.addEventListener("dblclick",()=>{setSelection(section.id,step.id);void preview()});
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
  return card;
}
function renderTimeline(){
  const timeline=$("timeline"),left=timeline.scrollLeft,fragment=document.createDocumentFragment();
  for(const section of project.sections){
    const wrap=document.createElement("section");wrap.className="progression-chunk";
    const header=document.createElement("div");header.className="progression-chunk-head";
    header.textContent=section.name+" ×"+section.repeat;
    header.title="ダブルクリックでセクション名を変更";
    header.addEventListener("dblclick",()=>{
      setSelection(section.id,section.steps[0].id);
      $("sectionDetails").open=true;$("editSectionName").focus();$("editSectionName").select();
    });
    const grid=document.createElement("div");grid.className="progression-chunk-grid";
    section.steps.forEach((step,index)=>grid.append(makeCard(section,step,index)));
    const add=document.createElement("button");add.type="button";
    add.className="progression-cell progression-cell-add";add.textContent="+";
    add.title=section.name+" にコードを追加";add.setAttribute("aria-label",section.name+" にコードを追加");
    add.addEventListener("click",()=>{
      const previous=section.steps.at(-1);
      const next={id:id("c"),expr:previous?.expr||"4,5,6",pitch:previous?.pitch||"C4",beats:previous?.beats||4};
      if(mutate(d=>d.sections.find(s=>s.id===section.id).steps.push(next),{structural:true})){
        setSelection(section.id,next.id);
        requestAnimationFrame(()=>document.querySelector('.progression-cell[data-cid="'+next.id+'"]')?.scrollIntoView({inline:"nearest",block:"nearest"}));
      }
    });
    grid.append(add);wrap.append(header,grid);fragment.append(wrap);
  }
  timeline.replaceChildren(fragment);timeline.scrollLeft=left;
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
    const del=document.createElement("button");del.type="button";del.textContent="×";del.className="preset-remove";del.title=preset.name+" を登録解除";
    del.setAttribute("aria-label",preset.name+" を登録解除");
    del.addEventListener("click",()=>mutate(d=>{
      const p=d.presets.find(x=>x.name===preset.name);
      for(const s of d.sections)for(const step of s.steps)if(step.expr.toLocaleLowerCase()===p.name.toLocaleLowerCase())step.expr=p.ratios;
      d.presets=d.presets.filter(x=>x.name!==preset.name);
    }));
    item.append(chip,del);fragment.append(item);
  }
  chips.replaceChildren(fragment);chips.scrollTop=scroll;
}
function renderSectionNav(){
  const select=$("sectionJump");
  select.replaceChildren(...project.sections.map(s=>{
    const opt=document.createElement("option");opt.value=s.id;opt.textContent=s.name;return opt;
  }));
  const idx=Math.max(0,project.sections.findIndex(s=>s.id===selection.sectionId));
  select.value=project.sections[idx].id;
  $("sectionCounter").textContent=(idx+1)+"/"+project.sections.length;
  $("prevSection").disabled=idx===0;
  $("nextSection").disabled=idx===project.sections.length-1;
}

function renderSelection(){
  const loc=selectedLocation();if(!loc.step)return;
  selection={sectionId:loc.section.id,stepId:loc.step.id};
  const step=loc.step;
  $("selectionLabel").textContent=loc.section.name+" / "+(loc.index+1);
  $("editExpr").value=step.expr;$("editPitch").value=step.pitch;$("editBeats").value=step.beats;
  $("editSectionName").value=loc.section.name;$("editRepeat").value=loc.section.repeat;
  renderSectionNav();
  for(const card of $("timeline").querySelectorAll(".progression-cell[data-cid]")){
    const active=card.dataset.sid===selection.sectionId&&card.dataset.cid===selection.stepId;
    card.classList.toggle("active",active);
    card.setAttribute("aria-pressed",active?"true":"false");
  }
  const match=/^([A-G])([#b‡d]?)/.exec(step.pitch);
  for(const btn of $("progRootLetterButtons").querySelectorAll("button")){
    const active=btn.dataset.note===match?.[1];
    btn.classList.toggle("active",active);
    btn.setAttribute("aria-pressed",active?"true":"false");
  }
  for(const btn of document.querySelectorAll(".ratio-accidentals button"))
    btn.classList.toggle("active",btn.dataset.acc===(match?.[2]||""));
  $("moveLeft").disabled=loc.index===0;$("moveRight").disabled=loc.index===loc.section.steps.length-1;
  $("remove").disabled=loc.section.steps.length===1;
  $("removeSection").disabled=project.sections.length===1;
  try{
    const result=calculate(step);
    $("hzReadout").textContent="最下音 "+hz(result.baseHz)+"Hz · "+result.freqs.length+"音";
  }catch(error){$("hzReadout").textContent="音高／比率エラー: "+error.message}
}
function render(){
  $("title").value=project.title;$("bpm").value=project.settings.bpm;
  $("loop").checked=project.settings.loop;$("wave").value=project.settings.wave;
  renderTimeline();renderPresets();renderSelection();renderHistory();
}
function commitField(which,value,field){
  let success=false;
  if(which==="expr")success=mutate(d=>selectedLocation(d).step.expr=value.trim(),{audition:true});
  if(which==="pitch")success=mutate(d=>selectedLocation(d).step.pitch=value.trim(),{audition:true});
  if(which==="beats")success=mutate(d=>selectedLocation(d).step.beats=Number(value));
  if(which==="sectionName")success=mutate(d=>selectedLocation(d).section.name=value.trim());
  if(which==="repeat")success=mutate(d=>selectedLocation(d).section.repeat=Number(value));
  field.setAttribute("aria-invalid",success?"false":"true");
}
[["editExpr","expr"],["editPitch","pitch"],["editBeats","beats"],["editSectionName","sectionName"],["editRepeat","repeat"]].forEach(([key,kind])=>{
  $(key).addEventListener("change",e=>commitField(kind,e.target.value,e.target));
  $(key).addEventListener("input",e=>e.target.removeAttribute("aria-invalid"));
});
// Type-and-audition without waiting for a field blur; incomplete pitches stay editable.
const typingTimers=new Map();
for(const [key,which] of [["editExpr","expr"],["editPitch","pitch"]]){
  $(key).addEventListener("input",e=>{
    clearTimeout(typingTimers.get(key));
    const value=e.target.value,field=e.target;
    const timer=setTimeout(()=>{
      if(field.value!==value)return;
      const draft=copy(project);
      if(which==="expr")selectedLocation(draft).step.expr=value.trim();
      else selectedLocation(draft).step.pitch=value.trim();
      try{validateProject(draft)}catch(error){return}
      mutate(d=>{selectedLocation(d).step[which==="expr"?"expr":"pitch"]=value.trim()},{audition:true});
    },260);
    typingTimers.set(key,timer);
  });
}
$("presetSearch").addEventListener("input",()=>{$("presetChips").scrollTop=0;renderPresets()});
$("masterVolume").addEventListener("input",e=>engine.setMasterVolume(Number(e.target.value)));
$("progMenuToggleBtn").addEventListener("click",()=>{
  const btn=$("progMenuToggleBtn"),open=btn.getAttribute("aria-expanded")!=="true";
  btn.setAttribute("aria-expanded",String(open));
  $("progToolbarActions").classList.toggle("open",open);
});
$("sectionJump").addEventListener("change",e=>{
  const section=project.sections.find(s=>s.id===e.target.value);
  if(section)setSelection(section.id,section.steps[0].id);
});
function moveSection(delta){
  const idx=project.sections.findIndex(s=>s.id===selection.sectionId),sec=project.sections[idx+delta];
  if(sec)setSelection(sec.id,sec.steps[0].id);
}
$("prevSection").addEventListener("click",()=>moveSection(-1));
$("nextSection").addEventListener("click",()=>moveSection(1));
$("progRootLetterButtons").addEventListener("click",e=>{
  const letter=e.target.closest("[data-note]")?.dataset.note;
  if(!letter)return;
  const pitch=selectedLocation().step.pitch,next=pitch.replace(/^[A-G]/,letter);
  mutate(d=>selectedLocation(d).step.pitch=next,{audition:true});
});
document.querySelector(".ratio-accidentals").addEventListener("click",e=>{
  const btn=e.target.closest("button[data-acc]");if(!btn)return;
  const pitch=selectedLocation().step.pitch;
  const next=pitch.replace(/^([A-G])([#b‡d]?)/,(full,letter)=>letter+btn.dataset.acc);
  mutate(d=>selectedLocation(d).step.pitch=next,{audition:true});
});
$("title").addEventListener("change",e=>mutate(d=>d.title=e.target.value));
$("bpm").addEventListener("change",e=>mutate(d=>d.settings.bpm=Number(e.target.value)));
$("loop").addEventListener("change",e=>mutate(d=>d.settings.loop=e.target.checked));
$("wave").addEventListener("change",e=>mutate(d=>d.settings.wave=e.target.value));
$("undo").addEventListener("click",undo);
$("redo").addEventListener("click",redo);
$("newSection").addEventListener("click",()=>{
  const sec={id:id("s"),name:"Section "+(project.sections.length+1),repeat:1,steps:[{id:id("c"),expr:"4,5,6",pitch:"C4",beats:4}]};
  if(mutate(d=>d.sections.push(sec),{structural:true}))setSelection(sec.id,sec.steps[0].id);
});
$("addStep").addEventListener("click",()=>{
  const {section,step,index}=selectedLocation();
  const next={...copy(step),id:id("c")};
  if(mutate(d=>d.sections.find(s=>s.id===section.id).steps.splice(index+1,0,next),{structural:true}))setSelection(section.id,next.id);
});
$("duplicate").addEventListener("click",()=>$("addStep").click());
$("remove").addEventListener("click",()=>{
  const {section,index}=selectedLocation();
  if(mutate(d=>d.sections.find(s=>s.id===section.id).steps.splice(index,1),{structural:true}))chooseFirst(),renderSelection();
});
$("removeSection").addEventListener("click",()=>{
  const {section}=selectedLocation();
  if(mutate(d=>d.sections=d.sections.filter(s=>s.id!==section.id),{structural:true}))chooseFirst(),renderSelection();
});
function swap(delta){
  const {section,index}=selectedLocation();const target=index+delta;
  if(target<0||target>=section.steps.length)return;
  mutate(d=>{const steps=d.sections.find(s=>s.id===section.id).steps;[steps[index],steps[target]]=[steps[target],steps[index]]},{structural:true});
}
$("moveLeft").addEventListener("click",()=>swap(-1));
$("moveRight").addEventListener("click",()=>swap(1));
$("addPreset").addEventListener("click",()=>{
  const name=$("presetName").value.trim(),ratios=$("presetRatio").value.trim();
  if(mutate(d=>d.presets.push({name,ratios}))){$("presetName").value="";$("presetRatio").value=""}
});
function stopPlayback(){
  runId++;playing=false;playingStepId=null;voiceCount=0;clearTimeout(timer);timer=null;
  engine.stopAll();$("play").textContent="▶ 選択から再生";
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
function startPlayback(sectionId=null){
  stopPlayback();
  const steps=flatten(project,sectionId);if(!steps.length)return;
  const token=runId;
  const selectedIndex=steps.findIndex(s=>s.stepId===selection.stepId);
  let index=selectedIndex>=0?selectedIndex:0;
  playing=true;$("play").textContent="❚❚ 再生中";
  const advance=async()=>{
    if(token!==runId||!playing)return;
    if(index>=steps.length){if(project.settings.loop)index=0;else{stopPlayback();return}}
    const step=steps[index++];
    try{
      const ok=await startVoices(step,token);
      if(!ok)return;
      highlightStep(step);
      const duration=step.beats*60000/project.settings.bpm;
      timer=setTimeout(advance,duration);
    }catch(error){stopPlayback();notice(error.message||"再生できません",true)}
  };
  void advance();
}
async function preview(){
  const step=selectedLocation().step;
  stopPlayback();
  const token=runId;
  try{
    const ok=await startVoices(step,token);if(!ok)return;
    highlightStep(step);
    timer=setTimeout(()=>{if(token===runId)stopPlayback()},Math.min(1800,step.beats*60000/project.settings.bpm));
  }catch(error){stopPlayback();notice(error.message||"試聴できません",true)}
}
$("play").addEventListener("click",()=>playing?stopPlayback():startPlayback());
$("playSection").addEventListener("click",()=>startPlayback(selection.sectionId));
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
window.addEventListener("pagehide",()=>stopPlayback());
boot();
