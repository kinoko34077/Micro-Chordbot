import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getPersistenceRecoveryAction, getPersistenceStatus } from "../src/operation-feedback.js";

const DEFAULT_PROJECT = JSON.parse(
  readFileSync(new URL("../default_project.mcb", import.meta.url), "utf8")
);
const APP_SOURCE = readFileSync(new URL("../src/app.js", import.meta.url), "utf8");

function installDefaultFetch() {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => structuredClone(DEFAULT_PROJECT)
  });
}

function installIndexedDb(readOutcomes) {
  const outcomes = [...readOutcomes];
  const writes = [];
  globalThis.indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = createDb(outcomes, writes);
        request.onsuccess?.();
      });
      return request;
    }
  };
  return writes;
}
function createDb(outcomes, writes) {
  return {
    transaction(_store, mode) {
      const tx = {};
      tx.objectStore = () => ({
        get() {
          const request = {};
          queueMicrotask(() => {
            const outcome = outcomes.shift() ?? { kind: "absent" };
            if (outcome.kind === "error") {
              request.error = new Error(outcome.message || "read failed");
              request.onerror?.();
              return;
            }
            request.result = outcome.kind === "value"
              ? structuredClone(outcome.value)
              : undefined;
            request.onsuccess?.();
          });
          return request;
        },
        put(value, key) {
          writes.push({ value: structuredClone(value), key, mode });
          queueMicrotask(() => tx.oncomplete?.());
        }
      });
      return tx;
    },
    close() {}
  };
}

async function freshStorage(label) {
  return import(`../src/storage.js?issue6=${label}-${Date.now()}-${Math.random()}`);
}
test("transient IndexedDB read failure never persists the fallback default", async () => {
  installDefaultFetch();
  const writes = installIndexedDb([{ kind: "error", message: "temporary read failure" }]);
  const { loadProjectResult } = await freshStorage("read-failure");

  const result = await loadProjectResult();

  assert.equal(result.status, "read_failed");
  assert.equal(result.project?.app, "muChordbot");
  assert.match(result.error?.message || "", /temporary read failure/);
  assert.equal(writes.length, 0);
});

test("authoritative absence initializes and persists the default project once", async () => {
  installDefaultFetch();
  const writes = installIndexedDb([{ kind: "absent" }]);
  const { loadProjectResult } = await freshStorage("absent");

  const result = await loadProjectResult();

  assert.equal(result.status, "initialized");
  assert.equal(result.project?.app, "muChordbot");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].key, "current");
});

const EXISTING_PROJECT = {
  ...DEFAULT_PROJECT,
  defaultProjectSourceId: "project-7",
  payload: {
    ...DEFAULT_PROJECT.payload,
    settings: { ...DEFAULT_PROJECT.payload.settings, a4Hz: 432 }
  }
};
test("existing project loads without persistence mutation", async () => {
  installDefaultFetch();
  const writes = installIndexedDb([{ kind: "value", value: EXISTING_PROJECT }]);
  const { loadProjectResult } = await freshStorage("existing");

  const result = await loadProjectResult();

  assert.equal(result.status, "loaded");
  assert.equal(result.project.payload.settings.a4Hz, 432);
  assert.equal(writes.length, 0);
});

test("retry after transient read failure can recover the durable project", async () => {
  installDefaultFetch();
  const writes = installIndexedDb([
    { kind: "error", message: "temporary read failure" },
    { kind: "value", value: EXISTING_PROJECT }
  ]);
  const { loadProjectResult } = await freshStorage("retry");

  const first = await loadProjectResult();
  const second = await loadProjectResult();

  assert.equal(first.status, "read_failed");
  assert.equal(second.status, "loaded");
  assert.equal(second.project.payload.settings.a4Hz, 432);
  assert.equal(writes.length, 0);
});

test("startup recovery retry is a read retry, not a forced fallback save", () => {
  assert.doesNotMatch(APP_SOURCE, /retryPersistBtn\?\.addEventListener[\s\S]{0,180}persistLoop\(true\)/);
  assert.match(APP_SOURCE, /retryProjectLoad/);
  assert.match(APP_SOURCE, /persistenceAuthorityReady/);
});


test("uncertain startup state exposes a retry warning and pauses autosave", () => {
  const view = getPersistenceStatus("load-error", new Error("temporary read failure"));
  assert.equal(view.tone, "error");
  assert.equal(view.retry, true);
  assert.ok(view.message.length > 10);
  assert.match(APP_SOURCE, /async function persistLoop[\s\S]{0,180}if \(!persistenceAuthorityReady\)/);
});


test("retry policy preserves edits once an uncertain read proves the store was empty", () => {
  assert.equal(getPersistenceRecoveryAction("initialized", true), "persist-current");
  assert.equal(getPersistenceRecoveryAction("loaded", true), "conflict");
  assert.equal(getPersistenceRecoveryAction("loaded", false), "apply-loaded");
});
