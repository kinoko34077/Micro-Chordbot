import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const helper = source.split("function applyHistoryAction(direction) {")[1]?.split("function updateHistoryButtons")[0] || "";

test("Undo and Redo share one conditional save path for buttons and keyboard", () => {
  assert.ok(helper, "common history helper exists");
  assert.match(helper, /if \(changed\) markProjectDirty\(\)/);
  assert.match(source, /undoBtn\.addEventListener\("click", \(\) => applyHistoryAction\("undo"\)\)/);
  assert.match(source, /redoBtn\.addEventListener\("click", \(\) => applyHistoryAction\("redo"\)\)/);
  assert.match(source, /ev\.preventDefault\(\);\s+applyHistoryAction\("undo"\)/);
  assert.match(source, /ev\.preventDefault\(\);\s+applyHistoryAction\("redo"\)/);
  assert.match(source, /if \(isNativeUndoTarget\(ev\.target\)\) return/);
});
