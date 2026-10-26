import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const css=await readFile(new URL("../styles.css",import.meta.url),"utf8");
const js=await readFile(new URL("../src/app.js",import.meta.url),"utf8");

test("chord-choice width has one accurately named visual owner",()=>{
  assert.match(css,/--chord-choice-width:\s*124px/);
  assert.match(css,/\.chord-grid\s*\{[^}]*var\(--chord-choice-width\)/s);
  assert.match(js,/setProperty\("--chord-choice-width"/);
  assert.match(js,/setLabelLead\(els\.progressionCellWidthInput, "コード候補幅 px"\)/);
  assert.doesNotMatch(css,/--progression-cell-width/);
});
test("progression grid width remains driven exclusively by user column count",()=>{
  assert.match(css,/\.progression-chunk-grid\s*\{[^}]*grid-template-columns:\s*repeat\(var\(--progression-columns\)/s);
  assert.doesNotMatch(css,/\.progression-chunk-grid\s*\{[^}]*var\(--chord-choice-width\)/s);
});
