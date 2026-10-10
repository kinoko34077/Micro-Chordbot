import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

// Evaluate actual app persistence code with deferred asynchronous writes.
const app = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");
function sourceSection(start, end) {
  const a = app.indexOf(start);
  const b = app.indexOf(end, a);
  assert.ok(a >= 0 && b > a, "source anchors exist");
  return app.slice(a, b);
}
const dirtyFunction = sourceSection("function markProjectDirty() {", "\nfunction tableWidthKey");
const saveFunction = sourceSection("async function persistLoop(force = false) {", "\nasync function init()");

function harness() {
  const writes = [];
  const statuses = [];
  const value = { current: 1 };
  const scope = {
    value, writes, statuses,
    window: { setTimeout: () => 1 },
    clearTimeout: () => {},
    setPersistenceStatus: (status) => statuses.push(status),
    buildProjectPayloadForSave: () => ({ value: value.current }),
    resolvePersistenceSaveResult: (changed) => ({
      dirty: false, status: changed ? "saved" : "unchanged"
    }),
    saveProject: (snapshot) => new Promise((resolve, reject) => {
      writes.push({ snapshot, resolve, reject });
    }),
    Error, Promise
  };
  vm.createContext(scope);
  const declarations = [
    "let persistDirty = false;",
    "let persistRevision = 0;",
    "let persistInFlight = null;",
    "let persistTimerId = null;",
    "let persistenceAuthorityReady = true;",
    "let persistenceLoadError = null;",
    dirtyFunction, saveFunction,
    "globalThis.api = { markProjectDirty, persistLoop,",
    " dirty: () => persistDirty,",
    " revision: () => persistRevision,",
    " authorized: (value) => { persistenceAuthorityReady = value; } };"
  ].join("\n");
  vm.runInContext(declarations, scope);
  return scope;
}
async function awaitWriterCount(h, count) {
  for (let i = 0; i < 20 && h.writes.length < count; i++) await Promise.resolve();
  assert.equal(h.writes.length, count, "expected write count " + count);
}
test("new edit during an in-flight save is durably written in series", async () => {
  const h = harness();
  h.api.markProjectDirty();
  const pending = h.api.persistLoop();
  await awaitWriterCount(h, 1);
  assert.equal(h.writes[0].snapshot.value, 1);
  h.value.current = 2;
  h.api.markProjectDirty();
  const shared = h.api.persistLoop();
  assert.equal(h.writes.length, 1, "no overlapping IndexedDB writer");
  h.writes[0].resolve(true);
  await awaitWriterCount(h, 2);
  assert.equal(h.writes[1].snapshot.value, 2);
  assert.equal(h.api.dirty(), true, "newer project still dirty");
  h.writes[1].resolve(true);
  assert.equal(await pending, true);
  await shared;
  assert.equal(h.api.dirty(), false);
  assert.equal(h.statuses.at(-1), "saved");
});
test("multiple edits during an in-flight save collapse to latest revision", async () => {
  const h = harness();
  h.api.markProjectDirty();
  const saving = h.api.persistLoop();
  await awaitWriterCount(h, 1);
  for (const next of [2, 3, 4]) {
    h.value.current = next;
    h.api.markProjectDirty();
  }
  h.writes[0].resolve(true);
  await awaitWriterCount(h, 2);
  assert.equal(h.writes[1].snapshot.value, 4);
  h.writes[1].resolve(true);
  await saving;
  assert.equal(h.writes.length, 2);
  assert.equal(h.api.dirty(), false);
});
test("failed write leaves dirty and explicit retry writes latest state", async () => {
  const h = harness();
  h.api.markProjectDirty();
  const pending = h.api.persistLoop();
  await awaitWriterCount(h, 1);
  h.value.current = 2;
  h.api.markProjectDirty();
  h.writes[0].reject(new Error("disk full"));
  await assert.rejects(pending, /disk full/);
  assert.equal(h.api.dirty(), true);
  assert.equal(h.statuses.at(-1), "error");
  const retry = h.api.persistLoop(true);
  await awaitWriterCount(h, 2);
  assert.equal(h.writes[1].snapshot.value, 2);
  h.writes[1].resolve(true);
  await retry;
  assert.equal(h.api.dirty(), false);
});
test("uncertain loading authority always blocks forced save", async () => {
  const h = harness();
  h.api.authorized(false);
  h.api.markProjectDirty();
  assert.equal(await h.api.persistLoop(true), false);
  assert.equal(h.writes.length, 0);
  assert.equal(h.api.dirty(), true);
  h.api.authorized(true);
  const pending = h.api.persistLoop(true);
  await awaitWriterCount(h, 1);
  h.writes[0].resolve(true);
  await pending;
  assert.equal(h.api.dirty(), false);
});
test("authority revoked during an await cannot falsely signal saved", async () => {
  const h = harness();
  h.api.markProjectDirty();
  const pending = h.api.persistLoop();
  await awaitWriterCount(h, 1);
  h.api.authorized(false);
  h.writes[0].resolve(true);
  assert.equal(await pending, false);
  assert.equal(h.api.dirty(), true);
  assert.notEqual(h.statuses.at(-1), "saved");
});
test("unchanged save result must also flush newer revision", async () => {
  const h = harness();
  h.api.markProjectDirty();
  const pending = h.api.persistLoop();
  await awaitWriterCount(h, 1);
  h.value.current = 2;
  h.api.markProjectDirty();
  h.writes[0].resolve(false);
  await awaitWriterCount(h, 2);
  assert.equal(h.writes[1].snapshot.value, 2);
  h.writes[1].resolve(true);
  assert.equal(await pending, true);
  assert.equal(h.api.dirty(), false);
});


test("failed IndexedDB write closes its connection and retry persists", async () => {
  let closed = 0;
  let attempts = 0;
  globalThis.indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          close() { closed += 1; },
          transaction() {
            const tx = {};
            tx.objectStore = () => ({
              put() {
                queueMicrotask(() => {
                  attempts += 1;
                  if (attempts === 1) {
                    tx.error = new Error("simulated transaction failure");
                    tx.onerror?.();
                  } else {
                    tx.oncomplete?.();
                  }
                });
              }
            });
            return tx;
          }
        };
        request.onsuccess?.();
      });
      return request;
    }
  };
  const storage = await import("../src/storage.js?issue24-close=" + Date.now());
  const sample = {app: "muChordbot", payload: {key: "latest"}};
  await assert.rejects(storage.saveProject(sample), /simulated transaction failure/);
  assert.equal(closed, 1, "failed transaction closes database connection");
  assert.equal(await storage.saveProject(sample), true);
  assert.equal(closed, 2, "retry closes its successful database connection");
  assert.equal(attempts, 2);
});

