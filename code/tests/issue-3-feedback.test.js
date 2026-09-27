import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  detectImportKind,
  getAudioFailureMessage,
  getImportFailureMessage,
  getPersistenceStatus,
  resolvePersistenceSaveResult,
  getActiveVoiceIdsForFailureCleanup
} from "../src/operation-feedback.js";


const APP_SOURCE = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
const INDEX_HTML = readFileSync(new URL("../index.html", import.meta.url), "utf8");

test("persistence feedback uses a dedicated status surface", () => {
  assert.match(INDEX_HTML, /id="persistenceStatus"/);
  assert.match(APP_SOURCE, /persistenceStatus:\s*document\.getElementById\("persistenceStatus"\)/);
});

test("audio sync failure cleanup covers every active-note voice", () => {
  assert.deepEqual(
    getActiveVoiceIdsForFailureCleanup([{ id: "a" }, { id: "b" }, { id: "a" }, {}]),
    ["a", "b"]
  );
});

test("persistence status exposes waiting, saving, saved, and retry states", () => {
  assert.deepEqual(getPersistenceStatus("dirty"), {
    message: "未保存の変更があります。自動保存を待機中です。",
    tone: "info",
    retry: false
  });
  assert.deepEqual(getPersistenceStatus("saving"), {
    message: "保存中…",
    tone: "info",
    retry: false
  });
  assert.deepEqual(getPersistenceStatus("saved"), {
    message: "保存しました。",
    tone: "success",
    retry: false
  });
  assert.deepEqual(getPersistenceStatus("error", new Error("IndexedDB unavailable")), {
    message: "保存に失敗しました。再試行してください。 (IndexedDB unavailable)",
    tone: "error",
    retry: true
  });
});

test("import failure keeps a user-facing last-good-state message", () => {
  assert.equal(
    getImportFailureMessage(new SyntaxError("Unexpected token")),
    "読み込みに失敗しました。データは変更していません。 (Unexpected token)"
  );
});

test("audio failure keeps a user-facing retry message without changing state", () => {
  assert.equal(
    getAudioFailureMessage(new Error("AudioContext blocked")),
    "音声を開始できませんでした。再試行してください。 (AudioContext blocked)"
  );
});

test("successful persistence clears dirty state even when snapshot is unchanged", () => {
  assert.deepEqual(resolvePersistenceSaveResult(true), { dirty: false, status: "saved" });
  assert.deepEqual(resolvePersistenceSaveResult(false), { dirty: false, status: "unchanged" });
});

test("repository-known exported files remain accepted by import validation", () => {
  const cases = [
    [new URL("../default_project.mcb", import.meta.url), "project"],
    [new URL("../../project (2).mcb", import.meta.url), "project"],
    [new URL("../../default_library.mcbl", import.meta.url), "library"]
  ];
  for (const [url, expected] of cases) {
    const parsed = JSON.parse(readFileSync(url, "utf8"));
    assert.equal(detectImportKind(parsed), expected);
  }
});

test("malformed import documents are rejected before state mutation", () => {
  assert.throws(
    () => detectImportKind({ app: "muChordbot", extensionType: "mcb", payload: {} }),
    /project データが不完全/
  );
  assert.throws(
    () => detectImportKind({
      app: "muChordbot",
      extensionType: "mcbl",
      payload: { pitchPresets: [{}], chordPresets: [] }
    }),
    /library データが不完全/
  );
  assert.equal(
    detectImportKind({
      app: "muChordbot",
      extensionType: "mcbl",
      payload: { pitchPresets: [], chordPresets: [] }
    }),
    "library"
  );
});
