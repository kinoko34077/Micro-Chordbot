import assert from "node:assert/strict";
import {readFile, readdir} from "node:fs/promises";
import {join, relative, resolve} from "node:path";
import test from "node:test";
import vm from "node:vm";

import {
  buildCacheManifest,
  computeCacheNameFromEntries,
  collectPwaAssets
} from "../../tools/update-pwa-cache.mjs";

const REPO_ROOT = resolve(new URL("../../", import.meta.url).pathname);
const SITE_DIR = join(REPO_ROOT, "code");
const SERVICE_WORKER_PATH = join(SITE_DIR, "service-worker.js");
const DEPLOY_WORKFLOW_PATH = join(REPO_ROOT, ".github/workflows/deploy-pages.yml");

async function listJs(root, dir = root) {
  const entries = await readdir(dir, {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await listJs(root, path));
    if (entry.isFile() && entry.name.endsWith(".js")) files.push(path);
  }
  return files.map((path) => `./${relative(SITE_DIR, path).replaceAll("\\", "/")}`).sort();
}

test("precache manifest covers the complete runtime JavaScript set", async () => {
  const assets = await collectPwaAssets(SITE_DIR);
  const runtimeFiles = await listJs(join(SITE_DIR, "src"));

  for (const asset of runtimeFiles) {
    assert.ok(assets.includes(asset), `missing runtime asset: ${asset}`);
  }

  assert.ok(assets.includes("./default_project.mcb"));
  assert.ok(assets.includes("./index.html"));
  assert.equal(new Set(assets).size, assets.length, "precache assets must be unique");
});

test("cache generation changes when deployed default-project bytes change", async () => {
  const manifest = await buildCacheManifest(SITE_DIR);
  const originalDefault = await readFile(join(SITE_DIR, "default_project.mcb"));
  const entries = [];

  for (const asset of manifest.assets) {
    const path = asset === "./"
      ? join(SITE_DIR, "index.html")
      : join(SITE_DIR, asset.replace(/^\.\//, ""));
    entries.push({asset, bytes: await readFile(path)});
  }

  const first = computeCacheNameFromEntries(entries);
  const changed = computeCacheNameFromEntries(entries.map((entry) =>
    entry.asset === "./default_project.mcb"
      ? {asset: entry.asset, bytes: Buffer.concat([originalDefault, Buffer.from("\n")])}
      : entry
  ));

  assert.notEqual(first, changed);
});

test("service worker install precaches every declared asset and supports offline module fallback", async () => {
  const source = await readFile(SERVICE_WORKER_PATH, "utf8");
  const listeners = new Map();
  const cached = new Map();

  const cacheApi = {
    async addAll(assets) {
      for (const asset of assets) cached.set(new URL(asset, "https://example.test/app/").href, {asset});
    },
    async put(request, response) {
      cached.set(typeof request === "string" ? request : request.url, response);
    }
  };

  const context = {
    URL,
    Promise,
    Error,
    console,
    self: {
      location: {origin: "https://example.test"},
      clients: {claim: async () => {}},
      skipWaiting: async () => {},
      addEventListener(type, handler) { listeners.set(type, handler); }
    },
    caches: {
      open: async () => cacheApi,
      keys: async () => [],
      delete: async () => true,
      match: async (request) => cached.get(typeof request === "string" ? request : request.url)
    },
    fetch: async () => { throw new Error("offline"); }
  };

  vm.runInNewContext(source, context, {filename: "service-worker.js"});

  let installPromise;
  listeners.get("install")({waitUntil(promise) { installPromise = promise; }});
  await installPromise;

  const assets = await collectPwaAssets(SITE_DIR);
  for (const asset of assets) {
    assert.ok(cached.has(new URL(asset, "https://example.test/app/").href), `not precached: ${asset}`);
  }

  for (const asset of assets.filter((value) => value.startsWith("./src/"))) {
    let responsePromise;
    listeners.get("fetch")({
      request: {method: "GET", url: new URL(asset, "https://example.test/app/").href},
      respondWith(promise) { responsePromise = promise; }
    });
    const response = await responsePromise;
    assert.equal(response.asset, asset, `offline fallback failed: ${asset}`);
  }
});

test("default project is network-first with cached fallback and deployment regenerates after copy", async () => {
  const source = await readFile(SERVICE_WORKER_PATH, "utf8");
  assert.match(source, /isDefaultProject/);
  assert.match(source, /isShellAsset \|\| isDefaultProject/);
  assert.match(source, /fetch\(event\.request, \{ cache: "no-store" \}\)/);

  const deploy = await readFile(DEPLOY_WORKFLOW_PATH, "utf8");
  const copyIndex = deploy.indexOf('cp "project (2).mcb" code/default_project.mcb');
  const generateIndex = deploy.indexOf("node tools/update-pwa-cache.mjs");
  const uploadIndex = deploy.indexOf("actions/upload-pages-artifact");
  assert.ok(copyIndex >= 0 && generateIndex > copyIndex && uploadIndex > generateIndex);
  assert.doesNotMatch(source, /indexedDB|deleteDatabase/);
});
