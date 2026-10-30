import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const pitchLibraryStart = html.indexOf('<section class="panel unified-panel active-notes-panel"');
const pitchLibrary = pitchLibraryStart < 0 ? "" : html.slice(pitchLibraryStart).split('<section class="panel unified-panel chord-library-panel">')[0];
const activeBlock = pitchLibrary?.split('<section class="library-block"')[1]?.split("</section>")[0];
const presetBlock = pitchLibrary?.split('<section class="library-block"')[2]?.split("</section>")[0];

test("pitch library starts with its two task headings instead of a duplicate wrapper heading", () => {
  assert.ok(pitchLibrary, "pitch library panel must exist");
  assert.match(html, /class="panel unified-panel active-notes-panel" aria-label="音高ライブラリ"/);
  assert.doesNotMatch(pitchLibrary, /class="panel-heading"/);
  assert.match(activeBlock || "", /aria-labelledby="activeNotesHeading"/);
  assert.match(activeBlock || "", /<h3 id="activeNotesHeading">現音高<\/h3>/);
  assert.match(presetBlock || "", /aria-labelledby="pitchPresetsHeading"/);
  assert.match(presetBlock || "", /<h3 id="pitchPresetsHeading">音高プリセット<\/h3>/);
});

test("active-note actions and preset status stay beside the list they control", () => {
  assert.match(activeBlock || "", /id="activeNotesSummary"/);
  assert.match(activeBlock || "", /id="activeNotesFilterInput"/);
  assert.match(activeBlock || "", /id="clearActiveNotesBtn"/);
  assert.match(presetBlock || "", /id="pitchPresetStatus"[^>]*aria-live="polite"/);
  assert.match(presetBlock || "", /id="pitchPresetFilterInput"/);
});

test("pitch library search placement is defined in the document, not repaired at startup", () => {
  assert.doesNotMatch(app, /pitchPresetFilterInput\.parentElement !== head/);
  assert.doesNotMatch(app, /active-notes-panel \.library-block strong/);
});
