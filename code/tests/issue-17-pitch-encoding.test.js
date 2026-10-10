import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {CURRENT_PITCH_ENCODING, LEGACY_PITCH_ENCODING, detectPitchEncoding, migratePitchScale, buildProjectPayload} from "../src/project-state.js";
import * as pitch from "../src/pitch.js";

const fixture = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const modern = fixture("../default_project.mcb");
const old = fixture("../../project (2).mcb");
const baseState = (root) => ({
  settings: {a4Hz:440},pitchDraft:{octave:4,microStepInOctave:root},activeNotes:[],pitchPresets:[],
  chordPresets:[{id:"C",baseRoot:{octave:4,microStepInOctave:root}}],
  progression:{parts:[{id:"P",root:{octave:4,microStepInOctave:root}}]},
  progressionEditor:{}
});

test("historical and modern same-version fixtures are distinguishable by preset unit pairs", () => {
  assert.equal(modern.specVersion,old.specVersion);
  assert.equal(detectPitchEncoding(modern),CURRENT_PITCH_ENCODING);
  assert.equal(detectPitchEncoding(old),LEGACY_PITCH_ENCODING);
});

test("small valid modern pitches remain exact after multiple migration passes", () => {
  for (const n of [100,3000]) {
    const s=baseState(n);
    for(let i=0;i<3;i++) migratePitchScale(s,pitch,{encoding:CURRENT_PITCH_ENCODING});
    assert.equal(s.chordPresets[0].baseRoot.microStepInOctave,n);
    assert.equal(s.progression.parts[0].root.microStepInOctave,n);
    assert.equal(s.pitchDraft.microStepInOctave,n);
  }
});

test("legacy data is normalized once, then marked output never migrates again", () => {
  const s=baseState(2700);
  migratePitchScale(s,pitch,{encoding:detectPitchEncoding(old)});
  assert.equal(s.progression.parts[0].root.microStepInOctave,90000);
  const doc=buildProjectPayload(s);
  assert.equal(detectPitchEncoding(doc),CURRENT_PITCH_ENCODING);
  migratePitchScale(s,pitch,{encoding:detectPitchEncoding(doc)});
  assert.equal(s.progression.parts[0].root.microStepInOctave,90000);
});

test("unknown evidence never guesses legacy encoding from small values", () => {
  const s=baseState(100);
  assert.equal(detectPitchEncoding({payload:{pitchPresets:[]}}),"unknown");
  migratePitchScale(s,pitch,{encoding:"unknown"});
  assert.equal(s.progression.parts[0].root.microStepInOctave,100);
});
