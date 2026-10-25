import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");

test("mobile rules have a single ordered max-width 640px cascade", () => {
  assert.equal((css.match(/@media\s*\(max-width:\s*640px\)/g) || []).length, 1);
});

test("JS-owned hidden state is respected across viewports", () => {
  assert.match(css, /^\[hidden\]\s*\{\s*display:\s*none\s*!important;/m);
  assert.match(app, /els\.progToolbarActions\.hidden = compact && !progressionUi\.isMenuOpen;/);
  assert.match(app, /els\.progressionEditorBody\.hidden = compact && !editorExpanded;/);
  assert.doesNotMatch(app, /const editorExpanded = [^;]*Boolean\(state\.progression\.selectedPartId\)/);
});

test("user-configured progression columns remain authoritative on narrow screens", () => {
  assert.match(css, /\.progression-chunk-grid\s*\{\s*grid-template-columns:\s*repeat\(var\(--progression-columns\)/);
  assert.match(app, /--progression-columns/);
  assert.match(app, /progColumnsSelect/);
});
