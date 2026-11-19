import {AudioEngine} from "../src/audio.js";
import {frequencyFromPitch} from "../src/pitch.js";
import {HistoryManager, isNativeUndoTarget} from "../src/history.js";
import {newProject,validateProject,parsePitch,parseRatio,flickPitch,FLICK_LETTERS,FLICK_ACCIDENTALS,chunksOf,flatten,importText,exportText} from "./model.mjs";

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
      remove.className="ratio-section-remove";remove.textContent="×";
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
      const next={id:id("c"),expr:"4,5,6",pitch:previous?.pitch||"C4",beats:4};
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
  $("selectionLabel").textContent=String(loc.index+1);
  if(document.activeElement!==$("editExpr"))$("editExpr").value=step.expr;
  if(!pitchGesture&&document.activeElement!==$("editPitch"))$("editPitch").value=step.pitch;
  if(document.activeElement!==$("editBeats"))$("editBeats").value=step.beats;
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
  renderTimeline();renderPresets();renderPresetManager();renderSelection();renderHistory();
}
function commitField(which,value,field){
  let success=false;
  if(which==="expr")success=mutate(d=>selectedLocation(d).step.expr=value.trim(),{audition:true});
  if(which==="pitch")success=mutate(d=>selectedLocation(d).step.pitch=value.trim(),{audition:true});
  if(which==="beats"&&field.dataset.dragging!=="true")success=mutate(d=>selectedLocation(d).step.beats=Number(value));

  field.setAttribute("aria-invalid",success?"false":"true");
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
      const draft=copy(project);
      if(which==="expr")selectedLocation(draft).step.expr=value.trim();
      else selectedLocation(draft).step.pitch=value.trim();
      try{validateProject(draft)}catch(error){return}
      mutate(d=>{selectedLocation(d).step[which==="expr"?"expr":"pitch"]=value.trim()},{audition:true});
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
$("openPresetManager").addEventListener("click",()=>{$("presetManager").showModal();$("presetName").focus()});
$("closePresetManager").addEventListener("click",()=>$("presetManager").close());
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

bindNumberScrub($("editBeats"),{
  get:()=>selectedLocation().step.beats,
  commit:value=>mutate(d=>{selectedLocation(d).step.beats=value}),
  min:.25,max:64,step:1,fineStep:.25
});
bindPitchFlick($("editPitch"));
$("title").addEventListener("change",e=>mutate(d=>d.title=e.target.value));
$("bpm").addEventListener("change",e=>mutate(d=>d.settings.bpm=Number(e.target.value)));
$("loop").addEventListener("change",e=>mutate(d=>d.settings.loop=e.target.checked));
$("wave").addEventListener("change",e=>mutate(d=>d.settings.wave=e.target.value));
$("undo").addEventListener("click",undo);
$("redo").addEventListener("click",redo);
const makeSection=(chunkId,chunkName,n)=>({
  id:id("s"),chunkId,chunkName,name:"Section "+n,repeat:1,
  steps:[{id:id("c"),expr:"4,5,6",pitch:"C4",beats:4}]
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
    {id:id("c"),expr:"4,5,6",pitch:step.pitch,beats:4};
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
