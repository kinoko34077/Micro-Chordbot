import assert from "node:assert/strict";
import test from "node:test";
import {readFile} from "node:fs/promises";
import {parsePitch,parseRatio,numberFromFraction,newProject,validateProject,flatten,exportText,importText} from "../ratio-mode/model.mjs";
import {frequencyFromPitch} from "../src/pitch.js";
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
