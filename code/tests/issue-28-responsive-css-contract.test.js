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

test("phone navigation and persistent actions share one row when width permits", () => {
  assert.match(css, /@media\s*\(min-width:\s*390px\)\s*and\s*\(max-width:\s*640px\)\s*\{/);
  assert.match(css, /@media\s*\(min-width:\s*390px\)\s*and\s*\(max-width:\s*640px\)[\s\S]*?\.brand-nav\s*\{\s*display:\s*contents/s);
  assert.match(css, /@media\s*\(min-width:\s*390px\)\s*and\s*\(max-width:\s*640px\)[\s\S]*?\.topbar\s*\{[^}]*grid-template-columns:\s*36px\s+minmax\(132px,\s*1fr\)\s+auto/s);
  assert.match(css, /@media\s*\(min-width:\s*390px\)\s*and\s*\(max-width:\s*640px\)[\s\S]*?\.history-buttons\s*\{[^}]*grid-template-columns:\s*40px\s+40px\s+64px\s+40px/s);
});

test("phone pitch canvas has an explicit height to fill its interactive surface", () => {
  assert.match(css, /#view-pitch\s+\.line-wrap\s*\{[^}]*min-height:\s*118px;[^}]*height:\s*118px/s);
});

test("tablet and phone chord choices scroll inside a bounded list", () => {
  assert.match(css, /@media\s*\(max-width:\s*1199px\)[\s\S]*?#view-progression\s+\.chord-grid\s*\{[^}]*max-height:\s*min\(34dvh,\s*280px\);[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain;/s);
});
