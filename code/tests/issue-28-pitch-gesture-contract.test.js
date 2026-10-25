import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const audio = await readFile(new URL("../src/audio.js", import.meta.url), "utf8");

const dragStep = source.split("async function applyDragPitch(finalize = false) {")[1]?.split("\nasync function toggleCurrentNote()")[0];
const pointerUp = source.split('canvas.addEventListener("pointerup", async (ev) => {')[1]?.split('canvas.addEventListener("pointercancel"')[0];
const pointerCancel = source.split('canvas.addEventListener("pointercancel", (ev) => {')[1]?.split('canvas.addEventListener("dblclick"')[0];

test("pointermove computes transient candidates without changing persisted notes", () => {
  assert.ok(dragStep, "drag step must exist");
  assert.match(dragStep, /dragContext\.candidate\s*=\s*\{/);
  assert.doesNotMatch(dragStep, /\bnote\.(?:id|octave|microStepInOctave|cent)\s*=/);
  assert.doesNotMatch(dragStep, /dedupeActiveNotes\(/);
  assert.match(dragStep, /updateDraggedActiveNoteVoice\(dragContext\.candidate\)/);
});

test("pointerup commits once and preserves unrelated notes on collision", () => {
  assert.ok(pointerUp);
  assert.match(pointerUp, /const collision = /);
  assert.match(pointerUp, /if \(source && candidate && !collision\)/);
  assert.match(pointerUp, /source\.id = targetId/);
  assert.match(pointerUp, /trackStateChange\("active_note_drag"/);
  assert.doesNotMatch(pointerUp, /dedupeActiveNotes\(/);
});

test("preview has stable voice ID and cancel discards preview", () => {
  assert.match(audio, /updateVoice\(id, freq,/);
  assert.match(source, /audio\.updateVoice\(DRAG_PREVIEW_VOICE_ID,/);
  assert.ok(pointerCancel);
  assert.match(pointerCancel, /audio\.stopVoice\(DRAG_PREVIEW_VOICE_ID\)/);
  assert.doesNotMatch(pointerCancel, /trackStateChange\(/);
});

test("touch double tap deletion and mouse double click both remain present", () => {
  assert.match(source, /lastPitchTouchTap\.noteId === hitNote\.id/);
  assert.match(source, /canvas\.addEventListener\("dblclick"/);
});
