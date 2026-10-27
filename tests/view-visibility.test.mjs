import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../code/styles.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../code/src/app.js", import.meta.url), "utf8");

test("inactive progression view is not displayed by phone-specific CSS", () => {
  assert.match(css, /\.view\s*\{\s*display:\s*none\s*;/);
  assert.match(css, /\.view#view-progression\.active\s*\{\s*display:\s*block\s*;/);
  assert.match(css, /\.view#view-progression\.active\s*\{\s*display:\s*grid\s*;/);
  assert.doesNotMatch(css, /\.view#view-progression\s*\{\s*display:\s*(?:block|grid)\s*;/);
});

test("the single view-state controller keeps selected and combined visibility distinct", () => {
  const controller = app.match(/function syncWorkspaceViewState\(view\)\s*\{([\s\S]*?)\n\}\n\nfunction setView/);
  assert.ok(controller, "workspace view controller exists");
  assert.match(controller[1], /sec\.classList\.toggle\("active", shouldShow\)/);
  assert.match(controller[1], /sec\.id === `view-\$\{nextView\}`/);
  assert.match(controller[1], /desktopWorkspace\s*\?/);
});

test("desktop workspaces keep pitch on the left and progression editing on the right", () => {
  const main = css.match(/body\.workspace-combined main\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  const pitch = css.match(/body\.workspace-combined #view-pitch\.active\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  const progression = css.match(/body\.workspace-combined #view-progression\.active\s*\{([\s\S]*?)\n\}/)?.[1] || "";
  assert.match(main, /grid-template-columns:/);
  assert.match(main, /8px[\s\S]*?minmax\(0,\s*1fr\)/);
  assert.match(pitch, /grid-column:\s*1\s*;/);
  assert.match(progression, /display:\s*grid\s*;/);
  assert.match(progression, /grid-column:\s*3\s*;/);
  assert.match(progression, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s*;/);
  assert.doesNotMatch(progression, /display:\s*contents\s*;/);
  assert.match(app, /data-workspace-resizer="pitch-progression"/);
  assert.doesNotMatch(app, /workspace-mid-col|workspace-resizer-right/);
});
