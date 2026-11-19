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
// One gesture moves diatonic notes across octave boundaries while the
// five accidental columns are chosen independently. This preserves optional
// explicit cent text already present in the project (e.g. "A#5 +50￠").
export const FLICK_LETTERS=Object.freeze(["C","D","E","F","G","A","B"]);
export const FLICK_ACCIDENTALS=Object.freeze(["b","d","","‡","#"]);
export function flickPitch(value,diatonicDelta,accidentalIndex){
  const original=parsePitch(value);
  const match=/^([A-G])([#b‡d]?)(-?\d{1,2})(.*)$/.exec(original.label);
  if(!match)fail("音高の表記を読み取れません");
  if(!Number.isInteger(diatonicDelta)||!Number.isInteger(accidentalIndex)||accidentalIndex<0||accidentalIndex>=FLICK_ACCIDENTALS.length)
    fail("音高操作の値が不正です");
  const abs=Number(match[3])*7+FLICK_LETTERS.indexOf(match[1]);
  const next=Math.max(-7,Math.min(9*7+6,abs+diatonicDelta));
  const octave=Math.floor(next/7),letter=FLICK_LETTERS[next-octave*7];
  const pitch=letter+FLICK_ACCIDENTALS[accidentalIndex]+octave+match[4];
  parsePitch(pitch);
  return pitch;
}

// 24EDO quartertone positions. The visible 7x5 cells overlap at
// enharmonic spellings; finger motion is chromatic at 50-cent increments,
// rather than clamping the accidental column.
const FLICK_QUARTERS=Object.freeze({C:0,D:4,E:8,F:10,G:14,A:18,B:22});
const FLICK_DELTAS=Object.freeze([-2,-1,0,1,2]);
function flickParts(value){
  const parsed=parsePitch(value);
  const match=/^([A-G])([#b‡d]?)(-?\d{1,2})(.*)$/.exec(parsed.label);
  if(!match)fail("音高を読み取れません");
  return {letter:match[1],acc:FLICK_ACCIDENTALS.indexOf(match[2]),
    octave:Number(match[3]),suffix:match[4],centOffset:parsed.centOffset};
}
export function flickCellQuarter(letter,accidentalIndex,octave){
  if(!(letter in FLICK_QUARTERS)||!Number.isInteger(accidentalIndex)||
     accidentalIndex<0||accidentalIndex>=5||!Number.isInteger(octave))
    fail("四分音表の位置が不正です");
  return octave*24+FLICK_QUARTERS[letter]+FLICK_DELTAS[accidentalIndex];
}
export function flickGridPitch(value,rowDelta,quarterDelta){
  const base=flickParts(value);
  if(!Number.isInteger(rowDelta)||!Number.isInteger(quarterDelta))
    fail("スライド値が不正です");
  const row=Math.max(-7,Math.min(9*7+6,
    base.octave*7+FLICK_LETTERS.indexOf(base.letter)+rowDelta));
  const rowOctave=Math.floor(row/7),rowLetter=FLICK_LETTERS[row-rowOctave*7];
  const originQuarter=flickCellQuarter(rowLetter,base.acc,rowOctave);
  const target=Math.max(-26,Math.min(240,originQuarter+quarterDelta));
  // Pick a notation with the correct *absolute* pitch. Prefer the
  // expected vertical row when multiple spellings are enharmonic; do
  // not change pitch merely to fit an accidental inside its five columns.
  const options=[];
  for(let octave=Math.max(-1,rowOctave-2);octave<=Math.min(9,rowOctave+2);octave++){
    for(let ni=0;ni<FLICK_LETTERS.length;ni++){
      const letter=FLICK_LETTERS[ni];
      for(let acc=0;acc<5;acc++)if(flickCellQuarter(letter,acc,octave)===target)
        options.push({letter,acc,octave,rowDistance:Math.abs(octave*7+ni-row),
          accDistance:Math.abs(acc-base.acc)});
    }
  }
  options.sort((a,b)=>a.rowDistance-b.rowDistance||a.accDistance-b.accDistance||a.acc-b.acc);
  const selected=options[0];
  if(!selected)fail("有効な音高候補がありません");
  const result=selected.letter+FLICK_ACCIDENTALS[selected.acc]+selected.octave+base.suffix;
  parsePitch(result);
  return result;
}
// All spellings for the same sounding 24EDO note should light up,
// including notes on different diatonic rows, e.g. D# and Eb.
export function flickEnharmonicCells(value){
  const base=flickParts(value);
  const tone=flickCellQuarter(base.letter,base.acc,base.octave);
  const matches=[];
  for(const letter of FLICK_LETTERS)for(let acc=0;acc<5;acc++)
    for(const octave of [base.octave-1,base.octave,base.octave+1]){
      if(octave < -1 || octave > 9)continue;
      if(flickCellQuarter(letter,acc,octave)===tone)
        matches.push({letter,acc,octave});
    }
  return matches;
}

// A 4x4 beat sheet displays four consecutive numbered beats. Each
// row has four quarter-beat positions ending on that whole beat:
//   0.25 0.50 0.75 1.00
//   1.25 1.50 1.75 2.00  ... 3.25–4, then pages 5–8 etc.
// The normal μChordbot editor stores duration as numerator/denominator,
// where the quarter-note equivalent is numerator*4/denominator. Keep legacy
// numeric ratio projects playable without silently rewriting their timing.
export function quarterBeats(step){
  return Number(step.beats)*4/Number(step.beatUnit||4);
}
export function normalizeLegacyBeat(value){
  const beats=Number(value);
  if(!Number.isFinite(beats)||beats<.25||beats>64)fail("拍数は0.25〜64拍です");
  if(Number.isInteger(beats))return {beats,beatUnit:4};
  for(const unit of [8,16,32]){
    const numerator=beats*unit/4;
    if(Number.isInteger(numerator)&&numerator>=1&&numerator<=64)
      return {beats:numerator,beatUnit:unit};
  }
  return {beats,beatUnit:4}; // keep a pre-existing non-quarter decimal losslessly
}
export function parseBeatNotation(value){
  const m=/^\s*(\d+(?:\.\d+)?)\s*\/\s*(\d+)\s*(?:拍)?\s*$/.exec(String(value));
  if(!m)fail("拍数は 分子/分母（例 4/4、3/8）で指定してください");
  const beats=Number(m[1]),beatUnit=Number(m[2]);
  if(!Number.isFinite(beats)||beats<=0||beats>64||!Number.isInteger(beatUnit)||beatUnit<1||beatUnit>32)
    fail("拍の分子は1〜64、分母は1〜32です");
  return {beats,beatUnit};
}
export function beatLabel(step){return String(step.beats)+"/"+String(step.beatUnit||4)+"拍"}
export function beatFractionGridValue(numerator,denominator,rowDelta,columnDelta){
  if(![numerator,denominator,rowDelta,columnDelta].every(Number.isInteger))
    fail("分子・分母のスライド値が不正です");
  return {beats:Math.max(1,Math.min(64,numerator+rowDelta)),
    beatUnit:Math.max(1,Math.min(32,denominator+columnDelta))};
}
export function beatFractionGridCells(step){
  const num=Math.max(1,Math.min(64,Math.ceil(step.beats)));
  const den=Math.max(1,Math.min(32,Number(step.beatUnit||4)));
  const firstNumerator=Math.floor((num-1)/4)*4+1;
  const firstDenominator=Math.floor((den-1)/4)*4+1;
  return {firstNumerator,firstDenominator,rows:Array.from({length:4},(_,r)=>
    Array.from({length:4},(_,c)=>({
      beats:Math.min(64,firstNumerator+r),beatUnit:Math.min(32,firstDenominator+c)
    })))};
}
export function parseNamedRatio(value){
  const m=/^\s*\[([^\]\[\r\n]+)\]\s*(.+)\s*$/.exec(String(value));
  if(!m)fail("名前と比率は [名前]4:5:6 の形式で入力してください");
  const name=m[1].trim(),ratios=m[2].trim();
  if(!name||name.length>64||/[,，:：|=@\[\]\r\n]/.test(name))
    fail("比率名は1〜64文字で区切り記号を含めないでください");
  parseRatio(ratios);
  return {name,ratios};
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
  const inline=/^\s*\[([^\[\]\r\n]+)\]\s*(.+)$/.exec(input);
  const preset=presets.find(p=>text(p.name).toLocaleLowerCase()===input.toLocaleLowerCase());
  const source=inline?text(inline[2]):preset?text(preset.ratios):input;
  const parts=source.split(/[,，:：]/).map(x=>x.trim());
  if(!source||parts.some(x=>!x)||parts.length>16) fail("コード比率は1〜16音をカンマまたはコロンで区切ってください");
  const values=parts.map(numberFromFraction);
  const min=Math.min(...values);
  return { ratios:values.map(x=>x/min).sort((a,b)=>a-b), name:inline?text(inline[1]):preset?.name||null, bassRatio:min, source };
}
export function newProject() {
  return { format:FORMAT,title:"比率コード進行",settings:{bpm:110,loop:true,wave:"sine"},
    presets:[{name:"Major",ratios:"4,5,6"},{name:"Minor",ratios:"10,12,15"},{name:"11th",ratios:"8,11,12"},{name:"7th",ratios:"4,5,6,7"}],
    sections:[{id:"sA",name:"A",chunkId:"chunk-1",chunkName:"チャンク 1",repeat:2,steps:[
      {id:"a1",expr:"Major",pitch:"C4",beats:4},
      {id:"a2",expr:"11th",pitch:"D‡4",beats:4},
      {id:"a3",expr:"Minor",pitch:"Bd3",beats:4}
    ]},{id:"sB",name:"B",chunkId:"chunk-1",chunkName:"チャンク 1",repeat:1,steps:[
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
  const sections=[],seen=new Set(),chunkNames=new Map(),closedChunks=new Set();let count=0,lastChunk=null;
  for(const [si,section] of value.sections.entries()){
    const name=text(section.name);
    if(!name||name.length>64||/[\[\]\r\n|]/.test(name))fail("セクション名の形式が不正です");
    const chunkId=text(section.chunkId)||"chunk-1";
    const chunkName=text(section.chunkName)||"チャンク 1";
    if(chunkId.length>128||/[\r\n]/.test(chunkId)||!chunkName||chunkName.length>64||/[\r\n]/.test(chunkName))
      fail("チャンク名・IDの形式が不正です");
    if(chunkId!==lastChunk){
      if(closedChunks.has(chunkId))fail("チャンクのセクションは連続して配置してください");
      if(lastChunk!==null)closedChunks.add(lastChunk);
      lastChunk=chunkId;
    }
    if(chunkNames.has(chunkId)&&chunkNames.get(chunkId)!==chunkName)fail("同一チャンクの名称が一致しません");
    chunkNames.set(chunkId,chunkName);
    const repeat=Number(section.repeat);
    if(!Number.isInteger(repeat)||repeat<1||repeat>16)fail("セクション反復は1〜16回です");
    if(!Array.isArray(section.steps)||!section.steps.length)fail("セクションにはコードが1つ以上必要です");
    count+=section.steps.length;if(count>MAX_STEPS)fail("コードは合計256件までです");
    let sectionId=text(section.id)||("s"+si);
    if(seen.has(sectionId))fail("IDが重複しています");
    seen.add(sectionId);
    const steps=section.steps.map((step,ti)=>{
      const expr=text(step.expr),pitch=text(step.pitch);
      const beat=step.beatUnit===undefined?
        normalizeLegacyBeat(step.beats):
        {beats:Number(step.beats),beatUnit:Number(step.beatUnit)};
      const {beats,beatUnit}=beat;
      if(!finite(beats)||beats<=0||beats>64||!Number.isInteger(beatUnit)||beatUnit<1||beatUnit>32)
        fail("拍の分子は1〜64、分母は1〜32です");
      parseRatio(expr,presets);parsePitch(pitch);
      const id=text(step.id)||("c"+si+"_"+ti);
      if(seen.has(id))fail("IDが重複しています");seen.add(id);
      return {id,expr,pitch,beats,beatUnit};
    });
    sections.push({id:sectionId,name,chunkId,chunkName,repeat,steps});
  }
  return {format:FORMAT,title:text(value.title).slice(0,120)||"無題",settings:{bpm,loop:!!s.loop,wave},presets,sections};
}
export function chunksOf(project) {
  const chunks=[];
  for(const section of project.sections){
    const chunkId=section.chunkId||"chunk-1";
    let chunk=chunks.at(-1);
    if(!chunk||chunk.id!==chunkId){
      chunk={id:chunkId,name:section.chunkName||"チャンク 1",sections:[]};
      chunks.push(chunk);
    }
    chunk.sections.push(section);
  }
  return chunks;
}
export function flatten(project,oneSection=null,oneChunk=null) {
  const out=[];
  for(const section of project.sections){
    if(oneSection && oneSection!==section.id)continue;
    if(oneChunk && oneChunk!==(section.chunkId||"chunk-1"))continue;
    for(let n=0;n<section.repeat;n++)for(const step of section.steps)out.push({chunkId:section.chunkId||"chunk-1",chunkName:section.chunkName||"チャンク 1",sectionId:section.id,stepId:step.id,sectionName:section.name,...step});
  }
  return out;
}
export function exportText(project) {
  const lines=["# "+project.title,"@settings bpm="+project.settings.bpm+" loop="+(project.settings.loop?"on":"off")+" wave="+project.settings.wave];
  for(const p of project.presets)lines.push("@preset "+p.name+" = "+p.ratios);
  let currentChunkId=null;
  for(const section of project.sections){
    const chunkId=section.chunkId||"chunk-1";
    if(currentChunkId!==chunkId){
      lines.push("","@chunk "+(section.chunkName||"チャンク 1"));
      currentChunkId=chunkId;
    }
    lines.push("","["+section.name+" x"+section.repeat+"]");
    for(const step of section.steps)lines.push(step.expr+" | "+step.pitch+" | "+step.beats+"/"+(step.beatUnit||4));
  }
  return lines.join("\n")+"\n";
}
export function importText(raw){
  const project={format:FORMAT,title:"読み込んだ進行",settings:{bpm:110,loop:true,wave:"sine"},presets:[],sections:[]};
  let current=null,chunkId="chunk-1",chunkName="チャンク 1",chunkCount=0;
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
    if(s.startsWith("@chunk ")){
      if(current&&current.steps.length===0)fail((index+1)+"行目の前のセクションが空です");
      const name=s.slice(7).trim();
      if(!name||name.length>64)fail((index+1)+"行目のチャンク名が不正です");
      if(chunkCount>0&&!project.sections.some(section=>section.chunkId===chunkId))
        fail((index+1)+"行目のチャンクにはセクションが必要です");
      chunkId="chunk-"+(++chunkCount);
      chunkName=name;current=null;return;
    }
    if(s.startsWith("[")){
      const m=/^\[(.+?)\s+x(\d+)\]$/.exec(s);
      if(!m)fail((index+1)+"行目は [A x2] の形式にしてください");
      current={name:m[1],chunkId,chunkName,repeat:Number(m[2]),steps:[]};project.sections.push(current);return;
    }
    if(!current){current={name:"A",chunkId,chunkName,repeat:1,steps:[]};project.sections.push(current)}
    const items=s.split("|").map(x=>x.trim());
    if(items.length>3||!items[0])fail((index+1)+"行目のコードが不正です");
    const beat=items[2]===undefined?{beats:4,beatUnit:4}:
      items[2].includes("/")?parseBeatNotation(items[2]):
      {beats:Number(items[2])};
    current.steps.push({expr:items[0],pitch:items[1]||"C4",...beat});
  });
  if(chunkCount>0&&!project.sections.some(section=>section.chunkId===chunkId))
    fail("最後のチャンクにはセクションが必要です");
  return validateProject(project);
}
