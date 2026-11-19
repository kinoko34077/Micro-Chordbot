import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {parsePitch,parseRatio,numberFromFraction,newProject,validateProject,chunksOf,flatten,exportText,importText} from "../ratio-mode/model.mjs";
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
  assert.deepEqual(loaded.sections.map(s=>({name:s.name,repeat:s.repeat,steps:s.steps.map(c=>[c.expr,c.pitch,c.beats])})),
    original.sections.map(s=>({name:s.name,repeat:s.repeat,steps:s.steps.map(c=>[c.expr,c.pitch,c.beats])})));
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
  assert.deepEqual(restored.sections.map(x=>x.steps),legacy.sections.map(x=>x.steps));
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
