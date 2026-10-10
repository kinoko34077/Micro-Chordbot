import assert from "node:assert/strict";
import test from "node:test";
import {isNativeUndoTarget} from "../src/history.js";

const element = (tagName, type = "text") => ({tagName, type});
const eventTarget = (editor) => ({closest: () => editor});

test("native text inputs and textareas retain browser undo and redo", () => {
  assert.equal(isNativeUndoTarget(eventTarget(element("INPUT", "text"))), true);
  assert.equal(isNativeUndoTarget(eventTarget(element("INPUT", "number"))), true);
  assert.equal(isNativeUndoTarget(eventTarget(element("TEXTAREA"))), true);
  assert.equal(isNativeUndoTarget(eventTarget(element("DIV"))), true);
});

test("buttons, checkboxes, canvas and document scope keep application history shortcuts", () => {
  assert.equal(isNativeUndoTarget(eventTarget(element("INPUT", "checkbox"))), false);
  assert.equal(isNativeUndoTarget(eventTarget(element("INPUT", "button"))), false);
  assert.equal(isNativeUndoTarget({closest: () => null}), false);
  assert.equal(isNativeUndoTarget(null), false);
});
