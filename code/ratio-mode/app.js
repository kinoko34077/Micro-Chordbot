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
let project,saveAllowed=true,selection={sectionId:null,stepId:null},columns=4;
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
  }catch(error){/* UI-only state is non-authoritative. */}
  chooseFirst();render();
}
function saveSelection(){
  try{localStorage.setItem(UI_STORE,JSON.stringify({...selection,columns}))}catch(error){/* UI selection optional. */}
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
    chooseFirst();save();if(saveAllowed)notice("");render();
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
  chooseFirst();saveSelection();save();render();if(saveAllowed)notice("");
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
  card.setAttribute("aria-label",section.name+" のコード "+(index+1)+" "+step.expr+" "+step.pitch+" "+step.beats+"拍、押すと試聴");
  const name=document.createElement("span");name.className="cell-title";name.textContent=step.expr;
  const note=document.createElement("span");note.className="cell-note";note.textContent=step.pitch;
  const meta=document.createElement("span");meta.className="cell-meta";meta.textContent=(index+1)+" · "+step.beats+"拍";
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
function renderTimeline(){
  const timeline=$("timeline"),top=timeline.scrollTop,fragment=document.createDocumentFragment();
  for(const section of project.sections){
    const wrap=document.createElement("section");wrap.className="progression-chunk";
    const header=document.createElement("button");header.type="button";header.className="progression-chunk-head";
    header.textContent=section.name+" ×"+section.repeat;
    header.title="セクション名と反復回数を編集";
    header.setAttribute("aria-label",section.name+" の設定");
    header.addEventListener("click",()=>{
      setSelection(section.id,section.steps[0].id);
      $("sectionDetails").showModal();$("editSectionName").focus();$("editSectionName").select();
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
  timeline.replaceChildren(fragment);timeline.scrollTop=top;
  updateGridColumns();
}

function removePreset(name){
  if(mutate(d=>{
    const p=d.presets.find(x=>x.name===name);
    if(!p)throw new Error("対象の比率が見つかりません");
    for(const section of d.sections)for(const step of section.steps)
      if(step.expr.toLocaleLowerCase()===name.toLocaleLowerCase())step.expr=p.ratios;
    d.presets=d.presets.filter(x=>x.name!==name);
  }))renderPresetManager();
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
    const del=document.createElement("button");del.type="button";del.className="preset-remove";
    del.textContent="×";del.title=preset.name+" を解除";
    del.setAttribute("aria-label",preset.name+" を登録解除");
    del.addEventListener("click",e=>{e.stopPropagation();removePreset(preset.name)});
    item.append(chip,del);fragment.append(item);
  }
  chips.replaceChildren(fragment);chips.scrollTop=scroll;
}
function renderPresetManager(){
  const select=$("presetManageSelect"),value=select.value;
  const options=[new Option("新規登録",""),...project.presets.map(p=>new Option(p.name,p.name))];
  select.replaceChildren(...options);
  select.value=project.presets.some(p=>p.name===value)?value:"";
  $("addPreset").textContent=select.value?"変更を保存":"登録";
}
function updateGridColumns(){
  const track=$("timeline"),width=track.clientWidth||window.innerWidth;
  const min=window.innerWidth<=640?116:window.innerWidth<=950?104:88;
  const max=Math.max(1,Math.floor((width-16+6)/(min+6)));
  const actual=Math.min(columns,max);
  track.style.setProperty("--progression-columns",String(actual));
  track.dataset.columns=String(actual);
  $("columnActual").textContent=actual===columns?actual+"列":actual+"列表示";
  $("gridColumns").value=String(columns);
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
  $("removeSection").disabled=project.sections.length===1;
  try{
    const result=calculate(step);
    $("hzReadout").textContent="最下音 "+hz(result.baseHz)+"Hz · "+result.freqs.length+"音";
  }catch(error){$("hzReadout").textContent="音高／比率エラー: "+error.message}
}
function render(){
  $("title").value=project.title;$("bpm").value=project.settings.bpm;
  $("loop").checked=project.settings.loop;$("wave").value=project.settings.wave;
  renderTimeline();renderPresets();renderPresetManager();renderSelection();renderHistory();
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
    const value=e.target.value,field=e.target,origin={...selection};
    const timer=setTimeout(()=>{
      if(field.value!==value||selection.stepId!==origin.stepId||selection.sectionId!==origin.sectionId)return;
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
$("openPresetManager").addEventListener("click",()=>{$("presetManager").showModal();$("presetName").focus()});
$("closePresetManager").addEventListener("click",()=>$("presetManager").close());
$("closeSectionEditor").addEventListener("click",()=>$("sectionDetails").close());
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
$("presetManageSelect").addEventListener("change",e=>{
  const selected=project.presets.find(p=>p.name===e.target.value);
  $("presetName").value=selected?.name||"";
  $("presetRatio").value=selected?.ratios||"";
  $("addPreset").textContent=selected?"変更を保存":"登録";
});

$("gridColumns").addEventListener("change",e=>{
  const v=Number(e.target.value);
  if(!Number.isInteger(v)||v<1||v>12){e.target.value=String(columns);return}
  columns=v;saveSelection();updateGridColumns();
});
window.addEventListener("resize",updateGridColumns);
$("addPreset").addEventListener("click",()=>{
  const previous=$("presetManageSelect").value;
  const name=$("presetName").value.trim(),ratios=$("presetRatio").value.trim();
  if(mutate(d=>{
    if(!previous){d.presets.push({name,ratios});return}
    const preset=d.presets.find(p=>p.name===previous);
    if(!preset)throw new Error("編集対象が見つかりません");
    preset.name=name;preset.ratios=ratios;
    for(const section of d.sections)for(const step of section.steps){
      if(step.expr.toLocaleLowerCase()===previous.toLocaleLowerCase())step.expr=name;
    }
  })){
    $("presetManageSelect").value="";$("presetName").value="";$("presetRatio").value="";
    renderPresetManager();
  }
});
function stopPlayback(){
  clearTimeout(tapTimer);tapVersion++;tapVoiceIds=[];
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
    },Math.max(320,Math.min(850,step.beats*60000/project.settings.bpm)));
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
