// μChordbot ratio mode: ratio parsing, pitch notation and portable progression model.
// Hz conversion deliberately remains owned by ../src/pitch.js (frequencyFromPitch).
export const FORMAT = "mu-chordbot-ratio/v1";
const SEMITONES = Object.freeze({C:0,D:2,E:4,F:5,G:7,A:9,B:11});
const ACCIDENTAL = Object.freeze({"":0,"#":10000,b:-10000,"‡":5000,d:-5000});
const MAX_STEPS = 256;
function fail(message) { throw new Error(message); }
function text(value) { return String(value ?? "").trim(); }
function finite(value) { return typeof value === "number" && Number.isFinite(value); }
export function parsePitch(value) {
  const label = text(value).replace(/♯/g,"#").replace(/♭/g,"b");
  const match = /^([A-G])([#b‡d]?)(-?\d{1,2})(?:\s*([+-])\s*(\d+(?:\.\d+)?)\s*(?:¢|￠|c|cent)?)?$/.exec(label);
  if (!match) fail("音高は C4、A#5 +50￠、D‡5、Bd6 の形式で指定してください");
  const octave = Number(match[3]);
  const offset = match[5] ? Number(match[5]) * (match[4]==="-"?-1:1) : 0;
  if (octave < -1 || octave > 9 || !finite(offset) || Math.abs(offset)>1200) fail("オクターブ -1〜9、追加セント ±1200 以内で指定してください");
  return { label, octave, microStepInOctave:SEMITONES[match[1]]*10000+ACCIDENTAL[match[2]]+Math.round(offset*100),centOffset:offset };
}
export function numberFromFraction(value) {
  const s=text(value);
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?(?:\s*\/\s*(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)?$/i.test(s)) fail("比率「"+s+"」は正の整数・小数・分数で入力してください");
  const parts=s.split("/").map(Number);
  const n=parts[0]/(parts[1]===undefined?1:parts[1]);
  if(!finite(n)||n<=0||n>1e10) fail("比率「"+s+"」は有効な正数にしてください");
  return n;
}
export function parseRatio(value,presets=[]) {
  const input=text(value);
  const preset=presets.find(p=>text(p.name).toLocaleLowerCase()===input.toLocaleLowerCase());
  const source=preset?text(preset.ratios):input;
  const parts=source.split(/[,，:：]/).map(x=>x.trim());
  if(!source||parts.some(x=>!x)||parts.length>16) fail("コード比率は1〜16音をカンマまたはコロンで区切ってください");
  const values=parts.map(numberFromFraction);
  const min=Math.min(...values);
  return { ratios:values.map(x=>x/min).sort((a,b)=>a-b), name:preset?.name||null, bassRatio:min, source };
}
export function newProject() {
  return { format:FORMAT,title:"比率コード進行",settings:{bpm:110,loop:true,wave:"sine"},
    presets:[{name:"Major",ratios:"4,5,6"},{name:"Minor",ratios:"10,12,15"},{name:"11th",ratios:"8,11,12"},{name:"7th",ratios:"4,5,6,7"}],
    sections:[{id:"sA",name:"A",repeat:2,steps:[
      {id:"a1",expr:"Major",pitch:"C4",beats:4},
      {id:"a2",expr:"11th",pitch:"D‡4",beats:4},
      {id:"a3",expr:"Minor",pitch:"Bd3",beats:4}
    ]},{id:"sB",name:"B",repeat:1,steps:[
      {id:"b1",expr:"4:11/2:6",pitch:"G3",beats:2},
      {id:"b2",expr:"7:9:11",pitch:"A#3 +50￠",beats:2}
    ]}]
  };
}
export function validateProject(value) {
  if(!value || typeof value!=="object" || Array.isArray(value) || value.format!==FORMAT) fail("この簡易版に対応したプロジェクト形式ではありません");
  const s=value.settings||{};
  const bpm=Number(s.bpm);
  if(!finite(bpm)||bpm<20||bpm>300)fail("BPMは20〜300で指定してください");
  const wave=["sine","square","sawtooth"].includes(s.wave)?s.wave:"sine";
  if(!Array.isArray(value.presets)||value.presets.length>128)fail("名前付き比率は最大128件です");
  if(!Array.isArray(value.sections)||!value.sections.length||value.sections.length>32)fail("セクションは1〜32件必要です");
  const presets=[],names=new Set();
  for(const p of value.presets){
    const name=text(p.name),ratios=text(p.ratios);
    if(!name||name.length>64||/[,，:：|=@\[\]\r\n]/.test(name))fail("比率名は1〜64文字で区切り記号を含めないでください");
    if(names.has(name.toLocaleLowerCase()))fail("比率名が重複しています: "+name);
    names.add(name.toLocaleLowerCase());parseRatio(ratios);
    presets.push({name,ratios});
  }
  const sections=[],seen=new Set();let count=0;
  for(const [si,section] of value.sections.entries()){
    const name=text(section.name);
    if(!name||name.length>64||/[\[\]\r\n|]/.test(name))fail("セクション名の形式が不正です");
    const repeat=Number(section.repeat);
    if(!Number.isInteger(repeat)||repeat<1||repeat>16)fail("セクション反復は1〜16回です");
    if(!Array.isArray(section.steps)||!section.steps.length)fail("セクションにはコードが1つ以上必要です");
    count+=section.steps.length;if(count>MAX_STEPS)fail("コードは合計256件までです");
    let sectionId=text(section.id)||("s"+si);
    if(seen.has(sectionId))fail("IDが重複しています");
    seen.add(sectionId);
    const steps=section.steps.map((step,ti)=>{
      const expr=text(step.expr),pitch=text(step.pitch),beats=Number(step.beats);
      if(!finite(beats)||beats<0.25||beats>64)fail("拍数は0.25〜64拍です");
      parseRatio(expr,presets);parsePitch(pitch);
      const id=text(step.id)||("c"+si+"_"+ti);
      if(seen.has(id))fail("IDが重複しています");seen.add(id);
      return {id,expr,pitch,beats};
    });
    sections.push({id:sectionId,name,repeat,steps});
  }
  return {format:FORMAT,title:text(value.title).slice(0,120)||"無題",settings:{bpm,loop:!!s.loop,wave},presets,sections};
}
export function flatten(project,oneSection=null) {
  const out=[];
  for(const section of project.sections){
    if(oneSection && oneSection!==section.id)continue;
    for(let n=0;n<section.repeat;n++)for(const step of section.steps)out.push({sectionId:section.id,stepId:step.id,sectionName:section.name,...step});
  }
  return out;
}
export function exportText(project) {
  const lines=["# "+project.title,"@settings bpm="+project.settings.bpm+" loop="+(project.settings.loop?"on":"off")+" wave="+project.settings.wave];
  for(const p of project.presets)lines.push("@preset "+p.name+" = "+p.ratios);
  for(const section of project.sections){
    lines.push("","["+section.name+" x"+section.repeat+"]");
    for(const step of section.steps)lines.push(step.expr+" | "+step.pitch+" | "+step.beats);
  }
  return lines.join("\n")+"\n";
}
export function importText(raw){
  const project={format:FORMAT,title:"読み込んだ進行",settings:{bpm:110,loop:true,wave:"sine"},presets:[],sections:[]};
  let current=null;
  String(raw).split(/\r?\n/).forEach((line,index)=>{
    const s=line.trim(); if(!s||s.startsWith("//"))return;
    if(s.startsWith("#")){project.title=s.slice(1).trim();return}
    if(s.startsWith("@settings ")){
      const pairs=s.slice(10).split(/\s+/);
      for(const pair of pairs){
        const m=/^(bpm|loop|wave)=(.+)$/.exec(pair);
        if(!m)fail((index+1)+"行目の設定が不正です");
        if(m[1]==="bpm")project.settings.bpm=Number(m[2]);
        if(m[1]==="loop")project.settings.loop=m[2]==="on";
        if(m[1]==="wave")project.settings.wave=m[2];
      }
      return;
    }
    if(s.startsWith("@preset ")){
      const m=/^@preset\s+(.+?)\s*=\s*(.+)$/.exec(s);
      if(!m)fail((index+1)+"行目の比率名定義が不正です");
      project.presets.push({name:m[1],ratios:m[2]});return;
    }
    if(s.startsWith("[")){
      const m=/^\[(.+?)\s+x(\d+)\]$/.exec(s);
      if(!m)fail((index+1)+"行目は [A x2] の形式にしてください");
      current={name:m[1],repeat:Number(m[2]),steps:[]};project.sections.push(current);return;
    }
    if(!current){current={name:"A",repeat:1,steps:[]};project.sections.push(current)}
    const items=s.split("|").map(x=>x.trim());
    if(items.length>3||!items[0])fail((index+1)+"行目のコードが不正です");
    current.steps.push({expr:items[0],pitch:items[1]||"C4",beats:items[2]===undefined?4:Number(items[2])});
  });
  return validateProject(project);
}
