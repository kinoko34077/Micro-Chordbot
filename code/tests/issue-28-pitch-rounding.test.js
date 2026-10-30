import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const roundUnitChange = source.split('els.roundUnitInput.addEventListener("change", () => {')[1]?.split("  });")[0];
const roundingModeChange = source.split('els.roundingModeSelect.addEventListener("change", () => {')[1]?.split("  });")[0];
const roundingCommit = source.split("function commitPitchRoundingSettings(")[1]?.split("\n}\n")[0];
const roundingAudio = source.split("async function refreshPitchRoundingVoices(")[1]?.split("\n}\n")[0];
const pitchLine = source.split("function renderLine() {")[1]?.split("\n}\n")[0];

test("rounding settings refresh the pitch line and audible pitch immediately", () => {
  assert.ok(roundUnitChange, "round unit change handler must exist");
  assert.ok(roundingModeChange, "rounding mode change handler must exist");
  assert.match(roundUnitChange, /commitPitchRoundingSettings\(/);
  assert.match(roundingModeChange, /commitPitchRoundingSettings\(/);
  assert.ok(roundingCommit, "rounding changes must use a shared update path");
  assert.match(roundingCommit, /render\(\)/);
  assert.match(roundingCommit, /refreshPitchRoundingVoices\(resumeMomentaryPreview\)/);
});

test("rounding changes preserve a currently auditioned pitch preview", () => {
  assert.ok(roundingCommit);
  assert.match(roundingCommit, /MOMENTARY_VOICE_ID/);
  assert.match(roundingCommit, /!dragContext/);
  assert.ok(roundingAudio);
  assert.match(roundingAudio, /if \(resumeMomentaryPreview\) previewDraftPitchVoice\(\)/);
});

test("the pitch line distinguishes the raw draft pitch from its rounded playback pitch", () => {
  assert.ok(pitchLine);
  assert.match(pitchLine, /roundPitchPosition\(state\.pitchDraft\.octave,\s*state\.pitchDraft\.microStepInOctave\)/);
  assert.match(pitchLine, /drawDraftX\s*=\s*clamp\(roundedX/);
  assert.match(pitchLine, /arc\(drawOriginalX/);
});

test("rounding refresh glides existing chord voices without resetting progression timing", () => {
  assert.ok(roundingAudio);
  assert.match(roundingAudio, /startVoiceWithFeedback\(/);
  assert.match(roundingAudio, /syncScopedVoiceSpecs\(\s*PROGRESSION_VOICE_PREFIX,[\s\S]*?true\s*\)/);
  assert.doesNotMatch(roundingAudio, /playProgressionPart\(|clearProgressionPlaybackTimer\(/);
});
