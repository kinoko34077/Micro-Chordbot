import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const css = await readFile(new URL("../styles.css", import.meta.url), "utf8");
const app = await readFile(new URL("../src/app.js", import.meta.url), "utf8");
const html = await readFile(new URL("../index.html", import.meta.url), "utf8");

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
  assert.match(css, /@media\s*\(max-width:\s*1199px\)[\s\S]*?#view-progression\s+\.chord-grid\s*\{[^}]*max-height:\s*clamp\(160px,\s*34dvh,\s*280px\);[^}]*overflow-y:\s*auto;[^}]*overscroll-behavior:\s*contain;/s);
});


test("progression chord choices preserve filtered-list scroll across selection rerenders", () => {
  assert.match(app, /chordChoiceFilter:\s*null/);
  assert.match(app, /const keepScrollPosition = progressionUi\.chordChoiceFilter === filterText;/);
  assert.match(app, /grid\.scrollTop = keepScrollPosition \? Math\.min\(previousScrollTop, maxScrollTop\) : 0;/);
});


test("settings use role groups and a bounded single content scroller", () => {
  assert.match(css, /\.settings-drawer\s*\{[^}]*grid-template-rows:\s*auto\s+auto\s+minmax\(0,\s*1fr\);/s);
  assert.match(css, /\.settings-drawer\s*\{[^}]*overflow:\s*hidden;/s);
  assert.match(css, /\.settings-drawer-body\s*\{[^}]*overflow-y:\s*auto;/s);
  assert.match(css, /\.settings-drawer\s+\.settings-list-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(88px,\s*1fr\)\)/s);
  assert.match(css, /\.settings-drawer\s+\.settings-audio-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(112px,\s*1fr\)\)/s);
  assert.match(css, /\.settings-task-section\s*\{[^}]*border-bottom:/s);
  assert.match(css, /@media\s*\(max-width:\s*640px\)[\s\S]*?\.settings-drawer\s*\{[^}]*inset:\s*0;/s);
  assert.match(html, /class="settings-task-section settings-preferences-panel"/);
  assert.match(html, /id="settingsListHeading">一覧の幅/);
  assert.match(html, /id="settingsCellHeading">進行セル/);
  assert.match(html, /class="settings-task-section settings-runtime-panel"/);
  assert.match(html, /aria-labelledby="settingsAudioHeading"/);
});
