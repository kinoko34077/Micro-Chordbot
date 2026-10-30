import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const helper = source.split("function applyHistoryAction(direction) {")[1]?.split("function updateHistoryButtons")[0] || "";
const audioRestore = source.split("async function restoreHistoryAudio() {")[1]?.split("\n}")[0] || "";

test("Undo and Redo share one conditional save path for buttons and keyboard", () => {
  assert.ok(helper, "common history helper exists");
  assert.match(helper, /if \(changed\)\s*\{\s*markProjectDirty\(\);[\s\S]*?\}/);
  assert.match(source, /undoBtn\.addEventListener\("click", \(\) => applyHistoryAction\("undo"\)\)/);
  assert.match(source, /redoBtn\.addEventListener\("click", \(\) => applyHistoryAction\("redo"\)\)/);
  assert.match(source, /ev\.preventDefault\(\);\s+applyHistoryAction\("undo"\)/);
  assert.match(source, /ev\.preventDefault\(\);\s+applyHistoryAction\("redo"\)/);
  assert.match(source, /if \(isNativeUndoTarget\(ev\.target\)\) return/);
});

test("Undo and Redo restore active-note and selected progression audio", () => {
  assert.ok(audioRestore, "history audio restore helper exists");
  assert.match(helper, /if \(changed\)\s*\{[\s\S]*?markProjectDirty\(\);[\s\S]*?restoreHistoryAudio\(\)/);
  assert.match(audioRestore, /await syncAudioToActiveNotes\(\)/);
  assert.match(audioRestore, /if \(playingPartId && playingPartIndex >= 0\)[\s\S]*?playProgressionPart\(/);
  assert.match(audioRestore, /previewProgressionPart\(selectedPart\)/);
});
