import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {detectImportKind} from "../src/operation-feedback.js";

const fixture = JSON.parse(readFileSync(new URL("../default_project.mcb", import.meta.url), "utf8"));

test("rejects id-only entities and incomplete settings before project mutation", () => {
  const broken = structuredClone(fixture);
  broken.payload.pitchPresets = [{id: "INCOMPLETE"}];
  assert.throws(() => detectImportKind(broken), /project データが不完全/);
  broken.payload.pitchPresets = fixture.payload.pitchPresets;
  broken.payload.settings = {};
  assert.throws(() => detectImportKind(broken), /project データが不完全/);
  broken.payload.settings = fixture.payload.settings;
  broken.payload.progression.parts = [{id: "INCOMPLETE"}];
  assert.throws(() => detectImportKind(broken), /project データが不完全/);
});

test("rejects conflicting file kind markers and broken tone references", () => {
  const mismatched = structuredClone(fixture);
  mismatched.extensionType = "mcbl";
  assert.throws(() => detectImportKind(mismatched), /対応していない/);
  const invalid = structuredClone(fixture);
  invalid.payload.chordPresets[0].tones[0] = {label: "No pitch"};
  assert.throws(() => detectImportKind(invalid), /project データが不完全/);
});

test("known complete current and historical project/library fixtures are accepted", () => {
  for (const path of ["../default_project.mcb", "../../project (2).mcb", "../../default_library.mcbl"]) {
    const doc = JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
    assert.ok(["project", "library"].includes(detectImportKind(doc)));
  }
});
