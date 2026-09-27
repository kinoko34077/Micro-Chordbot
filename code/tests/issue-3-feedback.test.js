import test from "node:test";
import assert from "node:assert/strict";
import {
  detectImportKind,
  getAudioFailureMessage,
  getImportFailureMessage,
  getPersistenceStatus,
  resolvePersistenceSaveResult
} from "../src/operation-feedback.js";

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
