import {AudioEngine} from "../src/audio.js";
import {frequencyFromPitch} from "../src/pitch.js";
import {HistoryManager, isNativeUndoTarget} from "../src/history.js";
import {newProject,validateProject,parsePitch,parseRatio,flatten,importText,exportText} from "./model.mjs";

const $=id=>document.getElementById(id);
const copy=value=>JSON.parse(JSON.stringify(value));
const STORE="muChordbot.ratioMode.v1";
const history=new HistoryManager(100);
const engine=new AudioEngine();
let project,saveAllowed=true,selection={sectionId:null,stepId:null};
let timer=null,runId=0,playing=false;
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
  chooseFirst();
  render();
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
function mutate(change){
  try{
    const before=copy(project),draft=copy(project);
    change(draft);
    const next=validateProject(draft);
    if(JSON.stringify(before)===JSON.stringify(next))return true;
    stopPlayback();
    project=next;
    history.push({type:"ratio_edit",before,after:copy(next)});
    chooseFirst();
    save();notice("");render();
    return true;
  }catch(error){notice(error.message||String(error),true);return false}
}
function setSelection(sid,cid){
  selection={sectionId:sid,stepId:cid};
  renderSelection();
}
function restore(snapshot){
  stopPlayback();
  project=copy(snapshot);
  chooseFirst();save();render();notice("");
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
function makeCard(section,step,index){
  const card=document.createElement("button");
  card.type="button";card.className="chord-card";
  card.dataset.sid=section.id;card.dataset.cid=step.id;
  card.setAttribute("aria-label",section.name+" のコード "+(index+1)+" を選択");
  const count=document.createElement("span");count.className="count";count.textContent=String(index+1).padStart(2,"0");
  const name=document.createElement("span");name.className="chord-name";name.textContent=step.expr;
  const pitch=document.createElement("span");pitch.className="base-note";pitch.textContent=step.pitch;
  const duration=document.createElement("span");duration.className="duration";duration.textContent=step.beats+" 拍";
  card.append(count,name,pitch,duration);
  card.addEventListener("click",()=>setSelection(section.id,step.id));
  return card;
}
function renderTimeline(){
  const timeline=$("timeline"),scroll=timeline.scrollLeft;
  const fragment=document.createDocumentFragment();
  project.sections.forEach(section=>{
    const container=document.createElement("section");container.className="section";
    container.setAttribute("aria-label","セクション "+section.name);
    const header=document.createElement("div");header.className="section-header";
    const heading=document.createElement("span");heading.className="section-title";heading.textContent="SECTION "+section.name;
    const repeat=document.createElement("span");repeat.className="section-repeat";repeat.textContent="×"+section.repeat;
    header.append(heading,repeat);
    const cards=document.createElement("div");cards.className="cards";
    section.steps.forEach((step,index)=>cards.append(makeCard(section,step,index)));
    const add=document.createElement("button");add.type="button";add.className="section-add";add.textContent="+";
    add.title="このセクションにコードを追加";add.setAttribute("aria-label",section.name+" にコードを追加");
    add.addEventListener("click",()=>{
      const copyOf=section.steps.at(-1);
      const next={id:id("c"),expr:copyOf?.expr||"4,5,6",pitch:copyOf?.pitch||"C4",beats:copyOf?.beats||4};
      if(mutate(d=>d.sections.find(s=>s.id===section.id).steps.push(next)))setSelection(section.id,next.id);
    });
    cards.append(add);container.append(header,cards);fragment.append(container);
  });
  timeline.replaceChildren(fragment);timeline.scrollLeft=scroll;
}
function renderPresets(){
  const chips=$("presetChips");chips.replaceChildren();
  for(const preset of project.presets){
    const chip=document.createElement("button");chip.type="button";chip.textContent=preset.name+"  "+preset.ratios;
    chip.title="選択コードへ "+preset.name+" を設定";
    chip.addEventListener("click",()=>mutate(d=>{selectedLocation(d).step.expr=preset.name}));
    chips.append(chip);
    const del=document.createElement("button");del.type="button";del.textContent="×";del.className="preset-remove";del.title=preset.name+" を登録解除";
    del.setAttribute("aria-label",preset.name+" を登録解除");
    del.addEventListener("click",()=>mutate(d=>{
      const p=d.presets.find(x=>x.name===preset.name);
      for(const s of d.sections)for(const step of s.steps)if(step.expr.toLocaleLowerCase()===p.name.toLocaleLowerCase())step.expr=p.ratios;
      d.presets=d.presets.filter(x=>x.name!==preset.name);
    }));
    chips.append(del);
  }
}
function renderSelection(){
  const loc=selectedLocation();
  if(!loc.step)return;
  selection={sectionId:loc.section.id,stepId:loc.step.id};
  const step=loc.step;
  $("selectionLabel").textContent=loc.section.name+" / "+(loc.index+1);
  $("editExpr").value=step.expr;
  $("editPitch").value=step.pitch;
  $("editBeats").value=step.beats;
  $("editSectionName").value=loc.section.name;
  $("editRepeat").value=loc.section.repeat;
  for(const card of $("timeline").querySelectorAll(".chord-card")){
    const active=card.dataset.sid===selection.sectionId&&card.dataset.cid===selection.stepId;
    card.classList.toggle("selected",active);
    card.setAttribute("aria-pressed",active?"true":"false");
  }
  $("moveLeft").disabled=loc.index===0;
  $("moveRight").disabled=loc.index===loc.section.steps.length-1;
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
  if(which==="expr")success=mutate(d=>selectedLocation(d).step.expr=value.trim());
  if(which==="pitch")success=mutate(d=>selectedLocation(d).step.pitch=value.trim());
  if(which==="beats")success=mutate(d=>selectedLocation(d).step.beats=Number(value));
  if(which==="sectionName")success=mutate(d=>selectedLocation(d).section.name=value.trim());
  if(which==="repeat")success=mutate(d=>selectedLocation(d).section.repeat=Number(value));
  field.setAttribute("aria-invalid",success?"false":"true");
}
[["editExpr","expr"],["editPitch","pitch"],["editBeats","beats"],["editSectionName","sectionName"],["editRepeat","repeat"]].forEach(([key,kind])=>{
  $(key).addEventListener("change",e=>commitField(kind,e.target.value,e.target));
  $(key).addEventListener("input",e=>e.target.removeAttribute("aria-invalid"));
});
$("title").addEventListener("change",e=>mutate(d=>d.title=e.target.value));
$("bpm").addEventListener("change",e=>mutate(d=>d.settings.bpm=Number(e.target.value)));
$("loop").addEventListener("change",e=>mutate(d=>d.settings.loop=e.target.checked));
$("wave").addEventListener("change",e=>mutate(d=>d.settings.wave=e.target.value));
$("undo").addEventListener("click",undo);
$("redo").addEventListener("click",redo);
$("newSection").addEventListener("click",()=>{
  const sec={id:id("s"),name:"Section "+(project.sections.length+1),repeat:1,steps:[{id:id("c"),expr:"4,5,6",pitch:"C4",beats:4}]};
  if(mutate(d=>d.sections.push(sec)))setSelection(sec.id,sec.steps[0].id);
});
$("addStep").addEventListener("click",()=>{
  const {section,step,index}=selectedLocation();
  const next={...copy(step),id:id("c")};
  if(mutate(d=>d.sections.find(s=>s.id===section.id).steps.splice(index+1,0,next)))setSelection(section.id,next.id);
});
$("duplicate").addEventListener("click",()=>$("addStep").click());
$("remove").addEventListener("click",()=>{
  const {section,index}=selectedLocation();
  if(mutate(d=>d.sections.find(s=>s.id===section.id).steps.splice(index,1)))chooseFirst(),renderSelection();
});
$("removeSection").addEventListener("click",()=>{
  const {section}=selectedLocation();
  if(mutate(d=>d.sections=d.sections.filter(s=>s.id!==section.id)))chooseFirst(),renderSelection();
});
function swap(delta){
  const {section,index}=selectedLocation();const target=index+delta;
  if(target<0||target>=section.steps.length)return;
  mutate(d=>{const steps=d.sections.find(s=>s.id===section.id).steps;[steps[index],steps[target]]=[steps[target],steps[index]]});
}
$("moveLeft").addEventListener("click",()=>swap(-1));
$("moveRight").addEventListener("click",()=>swap(1));
$("addPreset").addEventListener("click",()=>{
  const name=$("presetName").value.trim(),ratios=$("presetRatio").value.trim();
  if(mutate(d=>d.presets.push({name,ratios}))){$("presetName").value="";$("presetRatio").value=""}
});
function stopPlayback(){
  runId++;playing=false;clearTimeout(timer);timer=null;
  engine.stopAll();$("play").textContent="▶ 再生";
  document.querySelectorAll(".chord-card.playing").forEach(el=>el.classList.remove("playing"));
}
async function startVoices(step,token){
  const {freqs}=calculate(step);
  await engine.ensure();
  if(token!==runId)return false;
  engine.stopAll();
  const amplitude=Math.max(.045,.26/Math.sqrt(freqs.length));
  await Promise.all(freqs.map((freq,index)=>engine.startVoice("ratio-"+index,freq,project.settings.wave,amplitude)));
  if(token!==runId){engine.stopAll();return false}
  return true;
}
function highlightStep(step){
  for(const card of document.querySelectorAll(".chord-card")){
    card.classList.toggle("playing",card.dataset.cid===step.id);
  }
}
function startPlayback(sectionId=null){
  stopPlayback();
  const steps=flatten(project,sectionId);if(!steps.length)return;
  const token=runId;let index=0;playing=true;$("play").textContent="❚❚ 再生中";
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
    chooseFirst();save();render();$("ioStatus").textContent="進行を読み込みました";
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
