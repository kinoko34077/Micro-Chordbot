import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {parsePitch,parseRatio,flickPitch,flickGridPitch,flickEnharmonicCells,parseNamedRatio,chordExpression,setChordExpression,parseBeatNotation,beatLabel,quarterBeats,moveChord,moveSection,moveChunk,beatFractionGridValue,beatFractionGridCells,FLICK_LETTERS,FLICK_ACCIDENTALS,numberFromFraction,newProject,validateProject,chunksOf,flatten,sequenceForScope,nextSequencePosition,exportText,importText} from "../ratio-mode/model.mjs";
import {frequencyFromPitch} from "../src/pitch.js";
import {AudioEngine} from "../src/audio.js";
const hz=(s)=>{const p=parsePitch(s);return frequencyFromPitch(440,p.octave,p.microStepInOctave)};
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,"frequency mismatch: "+a+" vs "+b);

test("24EDO half sharp and half flat are exactly ±50 cents",()=>{
  assert.equal(parsePitch("D‡5").microStepInOctave,25000);
  assert.equal(parsePitch("Bd6").microStepInOctave,105000);
  assert.equal(parsePitch("A#5 +50￠").microStepInOctave,105000);
  assert.equal(parsePitch("C4 +50¢").microStepInOctave,5000);
  close(hz("D‡5"),hz("D5 +50￠"));
  close(hz("Bd6"),hz("B6 -50¢"));
  close(hz("A#5 +50￠"),hz("Bd5"));
  close(hz("C4"),440*Math.pow(2,-9/12));
});
test("7x5 flick pitch mapping wraps B4/C5 in both directions without losing cents",()=>{
  assert.deepEqual(FLICK_LETTERS,["C","D","E","F","G","A","B"]);
  assert.deepEqual(FLICK_ACCIDENTALS,["b","d","","‡","#"]);
  assert.equal(flickPitch("B4",1,2),"C5");
  assert.equal(flickPitch("C5",-1,2),"B4");
  assert.equal(flickPitch("B4",8,2),"C6");
  assert.equal(flickPitch("C5",-8,2),"B3");
  assert.equal(flickPitch("B4",1,3),"C‡5");
  assert.equal(flickPitch("C5",-1,1),"Bd4");
  assert.equal(flickPitch("A#5 +50￠",2,0),"Cb6 +50￠");
  assert.equal(flickPitch("B9",10,2),"B9");
  assert.equal(flickPitch("C-1",-5,2),"C-1");
  assert.throws(()=>flickPitch("C4",1,8));
  close(hz(flickPitch("B4",1,2)),hz("C5"));
});

test("corrected pitch drag follows top-to-bottom C–B rows with continuous octaves",()=>{
  assert.equal(flickGridPitch("B4",1,0),"C5");
  assert.equal(flickGridPitch("C5",-1,0),"B4");
  assert.equal(flickGridPitch("B4",-1,0),"A4");
  assert.equal(flickGridPitch("C4",1,0),"D4");
  assert.equal(flickGridPitch("D#4",0,1),"Ed4","D# +50 cents must cross right to Ed");
  assert.equal(flickGridPitch("Eb4",0,-1),"D‡4","Eb -50 cents must cross left to D‡");
  assert.equal(flickGridPitch("C#4",0,1),"Dd4");
  assert.equal(flickGridPitch("Cb4",0,-1),"Bd3");
  assert.equal(flickGridPitch("D#4",0,2),"E4");
  assert.equal(flickGridPitch("E#4",0,1),"F‡4");
  assert.equal(flickGridPitch("B4",1,1),"C‡5");
  assert.equal(flickGridPitch("A#5 +50￠",0,1),"Bd5 +50￠");
  assert.equal(flickGridPitch("B9",100,100),"B#9");
  assert.equal(flickGridPitch("C-1",-100,-100),"Cb-1");
  close(hz(flickGridPitch("D#4",0,1)),hz("Ed4"));
});
test("enharmonic spellings share selection without treating distinct quartertones as equal",()=>{
  const locations=p=>flickEnharmonicCells(p).map(x=>x.letter+FLICK_ACCIDENTALS[x.acc]+x.octave);
  assert.deepEqual(locations("D#4").sort(),["D#4","Eb4"].sort());
  assert.deepEqual(locations("Eb4").sort(),["D#4","Eb4"].sort());
  assert.deepEqual(locations("C#5").sort(),["C#5","Db5"].sort());
  assert.deepEqual(locations("D‡4"),[{letter:"D",acc:3,octave:4}].map(x=>x.letter+FLICK_ACCIDENTALS[x.acc]+x.octave));
  assert.ok(!locations("D‡4").includes("Ed4"),"D‡ and Ed differ by a full semitone");
  assert.ok(locations("C5").includes("B#4"),"enharmonic across octave boundary");
});
test("numerator/denominator gesture has independent row and column moves",()=>{
  assert.deepEqual(beatFractionGridValue(4,4,1,0),{beats:5,beatUnit:4});
  assert.deepEqual(beatFractionGridValue(4,4,0,1),{beats:4,beatUnit:5});
  assert.deepEqual(beatFractionGridValue(4,4,-2,-2),{beats:2,beatUnit:2});
  assert.deepEqual(beatFractionGridValue(64,32,12,12),{beats:64,beatUnit:32});
  assert.deepEqual(beatFractionGridValue(1,1,-12,-12),{beats:1,beatUnit:1});
  const grid=beatFractionGridCells({beats:4,beatUnit:4});
  assert.equal(grid.rows.length,4);assert.equal(grid.rows[0].length,4);
  assert.deepEqual(grid.rows[0][0],{beats:6,beatUnit:3});
  assert.deepEqual(grid.rows[3][3],{beats:3,beatUnit:6});
  const next=beatFractionGridCells({beats:7,beatUnit:7},grid);
  assert.equal(next.firstNumerator,4);assert.equal(next.firstDenominator,4);
  assert.deepEqual(beatFractionGridValue(1.3,4,0,1),{beats:1.3,beatUnit:5});
  assert.deepEqual(beatFractionGridValue(1.3,4,1,0),{beats:2.3,beatUnit:4});
  assert.deepEqual(parseBeatNotation("3/8"),{beats:3,beatUnit:8});
  assert.deepEqual(parseBeatNotation("4/4拍"),{beats:4,beatUnit:4});
  assert.equal(beatLabel({beats:3,beatUnit:8}),"3/8拍");
  assert.equal(quarterBeats({beats:3,beatUnit:8}),1.5);
  assert.throws(()=>parseBeatNotation("0.25"));
  assert.throws(()=>parseBeatNotation("5/0"));
});
test("old numeric beat data migrates without changing duration, incl fractional",()=>{
  const old=newProject();
  old.sections[0].steps[0].beats=.25;
  old.sections[0].steps[1].beats=1.5;
  const next=validateProject(old),steps=next.sections[0].steps;
  assert.deepEqual([steps[0].beats,steps[0].beatUnit],[1,16]);
  assert.deepEqual([steps[1].beats,steps[1].beatUnit],[3,8]);
  assert.equal(quarterBeats(steps[0]),.25);
  assert.equal(quarterBeats(steps[1]),1.5);
  assert.deepEqual(importText(exportText(next)).sections[0].steps.map(x=>[x.beats,x.beatUnit]),
    steps.map(x=>[x.beats,x.beatUnit]));
});
test("inline [name]ratio grammar and ratio aliases are equivalent",()=>{
  assert.deepEqual(parseNamedRatio("[Bright]4:11/2:6"),{name:"Bright",ratios:"4:11/2:6"});
  assert.deepEqual(parseRatio("[Bright]4:11/2:6").ratios,parseRatio("8:11:12").ratios);
  assert.throws(()=>parseNamedRatio("[Bad]4:0"),Error);
  assert.throws(()=>parseNamedRatio("Bright 4:5:6"),Error);
});
test("base is always minimum numeric ratio and equivalent fraction expressions match",()=>{
  assert.deepEqual(parseRatio("8:11:12").ratios,parseRatio("4:11/2:6").ratios);
  assert.deepEqual(parseRatio("6,4,5").ratios,[1,1.25,1.5]);
  assert.deepEqual(parseRatio("Major",[{name:"Major",ratios:"4,5,6"}]).ratios,[1,1.25,1.5]);
  assert.equal(numberFromFraction("11/2"),5.5);
});
test("invalid ratios and note spellings fail without modifying data",()=>{
  for(const value of ["0,5","4,0","4:1/0","4,","-1,2","4,NaN"]){
    assert.throws(()=>parseRatio(value),Error,value);
  }
  for(const value of ["H4","D‡","Bdd6","A#5 +2000¢","D‡5 plus 50","C4 -5oops"]){
    assert.throws(()=>parsePitch(value),Error,value);
  }
  const good=newProject(),snapshot=JSON.stringify(good);
  good.sections[0].steps[0].pitch="invalid";
  assert.throws(()=>validateProject(good));
  assert.equal(JSON.parse(snapshot).sections[0].steps[0].pitch,"C4");
});
test("text/JSON roundtrip preserve named ratios, pitch cents, sections, beats and repetitions",()=>{
  const original=validateProject(newProject());
  const loaded=importText(exportText(original));
  assert.deepEqual(loaded.settings,original.settings);
  assert.deepEqual(loaded.presets,original.presets);
  assert.deepEqual(loaded.sections.map(s=>({name:s.name,repeat:s.repeat,steps:s.steps.map(c=>[c.expr,c.pitch,c.beats,c.beatUnit])})),
    original.sections.map(s=>({name:s.name,repeat:s.repeat,steps:s.steps.map(c=>[c.expr,c.pitch,c.beats,c.beatUnit])})));
  assert.equal(flatten(loaded).length,original.sections.reduce((n,s)=>n+s.repeat*s.steps.length,0));
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(original))),original);
});
test("μChordbot menu links to same-site mode and offline generator includes the mode",async()=>{
  const menu=await readFile(new URL("../src/app.js",import.meta.url),"utf8");
  const generator=await readFile(new URL("../tools/generate-pwa-cache.mjs",import.meta.url),"utf8");
  const html=await readFile(new URL("../ratio-mode/index.html",import.meta.url),"utf8");
  assert.match(menu,/href="\.\/ratio-mode\/"/);
  assert.match(menu,/周波数比・簡易版/);
  for(const asset of ["index.html","app.js","model.mjs","style.css"]){
    assert.ok(generator.includes("./ratio-mode/"+asset),"missing PWA asset: "+asset);
  }
  for(const part of ["id=\"timeline\"","id=\"editPitch\"","id=\"editExpr\"","id=\"ioDialog\"","id=\"preview\""])assert.ok(html.includes(part),part);
});

test("legacy ratio v1 files become a single safe chunk without loss of chord data",()=>{
  const legacy=JSON.parse(JSON.stringify(newProject()));
  for(const section of legacy.sections){
    delete section.chunkId;delete section.chunkName;
  }
  const restored=validateProject(legacy);
  assert.equal(chunksOf(restored).length,1);
  assert.equal(chunksOf(restored)[0].name,"チャンク 1");
  assert.deepEqual(restored.sections.map(x=>x.steps.map(s=>[s.expr,s.pitch,s.beats])),
    legacy.sections.map(x=>x.steps.map(s=>[s.expr,s.pitch,s.beats])));
  assert.ok(restored.sections.every(x=>x.steps.every(s=>s.beatUnit===4)));
  const oldText=exportText(restored).replace(/^@chunk .+\n/m,"");
  assert.equal(chunksOf(importText(oldText)).length,1,"old text without @chunk must still import");
  assert.deepEqual(importText(oldText).sections.map(x=>x.steps.map(c=>[c.expr,c.pitch,c.beats])),
    restored.sections.map(x=>x.steps.map(c=>[c.expr,c.pitch,c.beats])));
});
test("chunk > section > chord: grouping, roundtrip, scope playback, invalid orphan rejection",()=>{
  const draft=JSON.parse(JSON.stringify(newProject()));
  draft.sections.push({
    id:"third-section",chunkId:"chunk-2",chunkName:"間奏",name:"C",repeat:3,
    steps:[{id:"third-step",expr:"4:11/2:6",pitch:"G4",beats:2}]
  });
  const data=validateProject(draft),chunks=chunksOf(data);
  assert.equal(chunks.length,2);
  assert.deepEqual(chunks.map(c=>[c.name,c.sections.map(s=>s.name)]),[
    ["チャンク 1",["A","B"]],["間奏",["C"]]
  ]);
  assert.equal(flatten(data,null,"chunk-2").length,3);
  assert.equal(flatten(data,"third-section","chunk-2").length,3);
  assert.equal(flatten(data,null,"chunk-1").length,8);
  assert.deepEqual(chunksOf(importText(exportText(data))).map(c=>[c.name,c.sections.map(s=>s.name)]),
    chunks.map(c=>[c.name,c.sections.map(s=>s.name)]));
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(data))),data);
  const broken=JSON.parse(JSON.stringify(data));
  broken.sections.push({...broken.sections[0],id:"orphan",steps:[{id:"newstep",expr:"Major",pitch:"C4",beats:4}]});
  assert.throws(()=>validateProject(broken),/連続/);
  assert.throws(()=>importText(exportText(data)+"\n@chunk 空\n"),/セクションが必要/);
});

test("shared audio engine recovers WebKit interrupted or suspended contexts",async()=>{
  const original=globalThis.AudioContext;
  class FakeAudioContext{
    constructor(){this.state="interrupted";this.destination={};this.resumeCalls=0}
    createGain(){return {gain:{value:0.3},connect(){}}}
    async resume(){this.resumeCalls++;this.state="running"}
  }
  try{
    globalThis.AudioContext=FakeAudioContext;
    const engine=new AudioEngine();
    await engine.ensure();
    assert.equal(engine.ctx.resumeCalls,1);
    assert.equal(engine.ctx.state,"running");
    engine.ctx.state="suspended";
    await engine.ensure();
    assert.equal(engine.ctx.resumeCalls,2);
  }finally{
    if(original===undefined)delete globalThis.AudioContext;
    else globalThis.AudioContext=original;
  }
});

test("named chord local override never mutates shared preset, and survives text and JSON",()=>{
  const p=validateProject(newProject()),st=p.sections[0].steps[0];
  setChordExpression(p,st,"[Major]4:5:7");
  assert.equal(st.expr,"[Major]4:5:7");
  assert.equal(p.presets[0].ratios,"4,5,6");
  assert.equal(chordExpression(st,p.presets),"[Major]4:5:7");
  assert.equal(importText(exportText(p)).sections[0].steps[0].expr,st.expr);
  assert.equal(validateProject(JSON.parse(JSON.stringify(p))).sections[0].steps[0].expr,st.expr);
  setChordExpression(p,st,"[Major]8:10:12");assert.equal(st.expr,"Major");
});

test("stable-ID chord reorder supports before/end and cross-section with one semantic move",()=>{
  const project=validateProject(newProject());
  const a=project.sections[0],b=project.sections[1],ids=a.steps.map(s=>s.id);
  assert.equal(moveChord(project,a.id,ids[0],a.id,ids[2]),true);
  assert.deepEqual(a.steps.map(s=>s.id),[ids[1],ids[0],ids[2]]);
  assert.equal(moveChord(project,a.id,ids[2],b.id,b.steps[1].id),true);
  assert.deepEqual(b.steps.map(s=>s.id),["b1",ids[2],"b2"]);
  assert.equal(a.steps.length,2);
  assert.equal(moveChord(project,a.id,ids[1],b.id),true);
  assert.equal(b.steps.at(-1).id,ids[1]);
  assert.throws(()=>moveChord(project,a.id,ids[0],b.id),/1つ以上残して/);
  assert.equal(a.steps.length,1);
  assert.equal(moveChord(project,b.id,ids[1],b.id,ids[1]),false);
  assert.ok(validateProject(project));
});

test("stable section move respects chunk grouping and protects last section",()=>{
  const p=validateProject(newProject());
  const source=p.sections[0].id,other=p.sections[1].id;
  const extra={...structuredClone(p.sections[0]),id:"s-extra",name:"Extra",repeat:1,
    steps:[{...structuredClone(p.sections[0].steps[0]),id:"c-extra"}]};
  p.sections.push(extra);
  assert.equal(moveSection(p,extra.id,source,false),true);
  assert.deepEqual(p.sections.map(s=>s.id),[extra.id,source,other]);
  assert.equal(moveSection(p,extra.id,extra.id),false);
  const newChunk={...structuredClone(extra),id:"s-other-chunk",chunkId:"chunk-other",chunkName:"Other",
    steps:[{...structuredClone(extra.steps[0]),id:"c-other-chunk"}]};
  p.sections.push(newChunk);
  assert.equal(moveSection(p,extra.id,newChunk.id,true),true);
  assert.equal(p.sections.at(-1).id,extra.id);
  assert.equal(p.sections.at(-1).chunkId,"chunk-other");
  assert.equal(p.sections.at(-1).chunkName,"Other");
  assert.ok(validateProject(p));
  const singleton={...structuredClone(newChunk),id:"s-solo",chunkId:"chunk-solo",chunkName:"Solo",
    steps:[{...structuredClone(newChunk.steps[0]),id:"c-solo"}]};
  p.sections.push(singleton);
  assert.throws(()=>moveSection(p,singleton.id,newChunk.id),/セクションを1つ以上残して/);
  assert.ok(validateProject(p));
});

test("stable chunk reorder keeps entire chunk sections contiguous and roundtrips text/JSON",()=>{
  const p=validateProject(newProject());
  const second={...structuredClone(p.sections[0]),id:"s-third",name:"Third",chunkId:"chunk-2",
    chunkName:"間奏",steps:[{...structuredClone(p.sections[0].steps[0]),id:"c-third"}]};
  const third={...structuredClone(second),id:"s-fourth",name:"Fourth",chunkId:"chunk-3",
    chunkName:"終結",steps:[{...structuredClone(second.steps[0]),id:"c-fourth"}]};
  p.sections.push(second,third);
  const sourceIds=p.sections.filter(s=>s.chunkId==="chunk-1").map(s=>s.id);
  const before=JSON.stringify(p);
  assert.equal(moveChunk(p,"chunk-3","chunk-1"),true);
  assert.deepEqual(chunksOf(p).map(c=>c.id),["chunk-3","chunk-1","chunk-2"]);
  assert.deepEqual(p.sections.filter(s=>s.chunkId==="chunk-1").map(s=>s.id),sourceIds);
  assert.equal(moveChunk(p,"chunk-1",null),true);
  assert.deepEqual(chunksOf(p).map(c=>c.id),["chunk-3","chunk-2","chunk-1"]);
  assert.equal(moveChunk(p,"chunk-3","chunk-2"),false);
  assert.throws(()=>moveChunk(p,"nonexistent","chunk-2"),/見つかりません/);
  assert.throws(()=>moveChunk(p,"chunk-1","nonexistent"),/見つかりません/);
  const normalized=validateProject(p);
  // Text IO intentionally remints internal chunk IDs; verify musical order
  // and contents, not transient identities. JSON preserves stable IDs.
  const semantic=p=>chunksOf(p).map(c=>[c.name,c.sections.map(s=>
    [s.name,s.repeat,s.steps.map(x=>[x.expr,x.pitch,x.beats,x.beatUnit])])]);
  assert.deepEqual(semantic(importText(exportText(normalized))),semantic(normalized));
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(normalized))),normalized);
  assert.notEqual(JSON.stringify(p),before);
});

test("transport occurrence planner keeps repeat identity and rejoins surviving chord after deletion",()=>{
  const project=validateProject(newProject());
  const whole=sequenceForScope(project,null,null);
  const section=sequenceForScope(project,"sA",null);
  assert.deepEqual(section.map(s=>s.stepId),["a1","a2","a3","a1","a2","a3"]);
  assert.equal(whole.length,section.length+2);
  assert.equal(sequenceForScope(project,null,"no-such-chunk").length,0);
  assert.notEqual(section[0].occurrence,section[3].occurrence,
    "repeated chord occurrences must have stable distinct keys");
  const selected={last:null,initialStepId:"a2",priorSequence:[],priorIndex:-1};
  assert.equal(nextSequencePosition(whole,selected),1,"play starts from selected chord");
  assert.equal(nextSequencePosition(whole,{...selected,initialStepId:"missing"}),0);
  const active={last:whole[1].occurrence,initialStepId:"a2",
    priorSequence:whole.map(s=>s.occurrence),priorIndex:1};
  assert.equal(nextSequencePosition(whole,active),2,"existing occurrence continues at next beat");
  const changed=structuredClone(project);
  changed.sections[0].steps=changed.sections[0].steps.filter(s=>s.id!=="a2");
  const next=sequenceForScope(changed,null,null);
  const index=nextSequencePosition(next,active);
  assert.equal(next[index].stepId,"a3","deleted sounding chord must rejoin surviving old successor");
  assert.equal(nextSequencePosition([],active),0,"no remaining candidate returns sequence end");
  assert.deepEqual(sequenceForScope(project,"sA",null),section,"planner must not mutate project");
});
