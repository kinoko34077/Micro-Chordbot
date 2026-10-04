import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const DEFAULT_PROJECT = JSON.parse(
  readFileSync(new URL("../default_project.mcb", import.meta.url), "utf8")
);

function installDefaultFetch() {
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => structuredClone(DEFAULT_PROJECT)
  });
}

function installIndexedDb(initialValue) {
  let stored = initialValue === undefined ? undefined : structuredClone(initialValue);
  const writes = [];

  globalThis.indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        request.result = {
          transaction(_store, mode) {
            const tx = {};
            tx.objectStore = () => ({
              get() {
                const getRequest = {};
                queueMicrotask(() => {
                  getRequest.result = stored === undefined ? undefined : structuredClone(stored);
                  getRequest.onsuccess?.();
                });
                return getRequest;
              },
              put(value, key) {
                stored = structuredClone(value);
                writes.push({ value: structuredClone(value), key, mode });
                queueMicrotask(() => tx.oncomplete?.());
              }
            });
            return tx;
          },
          close() {}
        };
        request.onsuccess?.();
      });
      return request;
    }
  };

  return {
    writes,
    getStored: () => stored === undefined ? undefined : structuredClone(stored)
  };
}

async function freshStorage(label) {
  return import(`../src/storage.js?issue9=${label}-${Date.now()}-${Math.random()}`);
}

function legacyUserProject() {
  const project = structuredClone(DEFAULT_PROJECT);
  delete project.defaultProjectSourceId;
  project.payload.settings = {
    ...project.payload.settings,
    a4Hz: 432
  };
  return project;
}

test("markerless valid full project migrates without default overwrite", async () => {
  installDefaultFetch();
  const legacy = legacyUserProject();
  const db = installIndexedDb(legacy);
  const { loadProjectResult } = await freshStorage("legacy-user");

  const result = await loadProjectResult();

  assert.equal(result.status, "loaded");
  assert.equal(result.project.payload.settings.a4Hz, 432);
  assert.equal(result.project.defaultProjectSourceId, "project-7");
  assert.equal(db.writes.length, 1);
  assert.equal(db.writes[0].value.payload.settings.a4Hz, 432);
  assert.equal(db.writes[0].value.defaultProjectSourceId, "project-7");
});

test("legacy migration is idempotent after the marker is persisted", async () => {
  installDefaultFetch();
  const db = installIndexedDb(legacyUserProject());
  const { loadProjectResult } = await freshStorage("idempotent");

  const first = await loadProjectResult();
  const second = await loadProjectResult();

  assert.equal(first.status, "loaded");
  assert.equal(second.status, "loaded");
  assert.equal(second.project.payload.settings.a4Hz, 432);
  assert.equal(db.writes.length, 1);
});

test("known historical payload-only default state refreshes to current default", async () => {
  installDefaultFetch();
  const db = installIndexedDb(structuredClone(DEFAULT_PROJECT.payload));
  const { loadProjectResult } = await freshStorage("legacy-default");

  const result = await loadProjectResult();

  assert.equal(result.status, "initialized");
  assert.equal(result.project.app, "muChordbot");
  assert.equal(result.project.defaultProjectSourceId, "project-7");
  assert.equal(db.writes.length, 1);
});

test("unknown markerless project shape fails closed without durable mutation", async () => {
  installDefaultFetch();
  const db = installIndexedDb({
    app: "muChordbot",
    extensionType: "mcb",
    exportType: "project",
    payload: { settings: { a4Hz: 432 } }
  });
  const { loadProjectResult } = await freshStorage("unsupported");

  const result = await loadProjectResult();

  assert.equal(result.status, "recovery_required");
  assert.equal(result.project, null);
  assert.match(result.error?.message || "", /安全に移行できません|recovery/i);
  assert.equal(db.writes.length, 0);
});

test("unknown source marker fails closed instead of being replaced", async () => {
  installDefaultFetch();
  const legacy = legacyUserProject();
  legacy.defaultProjectSourceId = "project-unknown";
  const db = installIndexedDb(legacy);
  const { loadProjectResult } = await freshStorage("unknown-marker");

  const result = await loadProjectResult();

  assert.equal(result.status, "recovery_required");
  assert.equal(result.project, null);
  assert.equal(db.writes.length, 0);
});
