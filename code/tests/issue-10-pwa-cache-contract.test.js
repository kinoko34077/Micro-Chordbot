import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import {cp, mkdtemp, readFile, readdir, rm, writeFile} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {promisify} from "node:util";
import vm from "node:vm";
import {fileURLToPath} from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const codeRoot = path.join(repoRoot, "code");
const generator = path.join(codeRoot, "tools", "generate-pwa-cache.mjs");

async function walkJs(root, relative = "") {
  const entries = await readdir(path.join(root, relative), {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    const next = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walkJs(root, next));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(next.split(path.sep).join("/"));
    }
  }
  return files;
}

async function readManifest(siteRoot) {
  const source = await readFile(path.join(siteRoot, "pwa-cache-manifest.js"), "utf8");
  const context = {self: {}};
  vm.runInNewContext(source, context);
  return context.self.__MU_CHORDBOT_PWA_CACHE__;
}

async function runGenerator(siteRoot) {
  const {stdout} = await execFileAsync(process.execPath, [generator, "--site", siteRoot]);
  return JSON.parse(stdout.trim());
}

function staticImports(source) {
  return [...source.matchAll(/from\s+["'](\.\.?\/[^"']+\.js)["']/g)].map((match) => match[1]);
}

test("generated precache manifest covers the complete static runtime module graph", async () => {
  const manifest = await readManifest(codeRoot);
  const assets = new Set(manifest.assets);
  const modules = await walkJs(path.join(codeRoot, "src"));

  for (const module of modules) {
    const asset = `./src/${module}`;
    assert.ok(assets.has(asset), `missing runtime module from precache: ${asset}`);

    const source = await readFile(path.join(codeRoot, "src", module), "utf8");
    for (const specifier of staticImports(source)) {
      const resolved = path.posix.normalize(path.posix.join("./src", path.posix.dirname(module), specifier));
      const normalized = resolved.startsWith(".") ? resolved : `./${resolved}`;
      assert.ok(assets.has(normalized), `missing imported module from precache: ${normalized}`);
    }
  }

  for (const required of [
    "./",
    "./index.html",
    "./styles.css",
    "./manifest.webmanifest",
    "./default_project.mcb",
    "./pwa-version.js",
    "./pwa-cache-manifest.js",
  ]) {
    assert.ok(assets.has(required), `missing offline asset: ${required}`);
  }
});

test("generator is deterministic and a default-project-only change advances the cache version", async () => {
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "mcb-pwa-"));
  const tempCode = path.join(tempRoot, "code");
  try {
    await cp(codeRoot, tempCode, {recursive: true});

    const first = await runGenerator(tempCode);
    const firstVersionSource = await readFile(path.join(tempCode, "pwa-version.js"), "utf8");
    const firstManifestSource = await readFile(path.join(tempCode, "pwa-cache-manifest.js"), "utf8");

    const second = await runGenerator(tempCode);
    assert.equal(second.version, first.version);
    assert.equal(await readFile(path.join(tempCode, "pwa-version.js"), "utf8"), firstVersionSource);
    assert.equal(await readFile(path.join(tempCode, "pwa-cache-manifest.js"), "utf8"), firstManifestSource);

    const defaultPath = path.join(tempCode, "default_project.mcb");
    const before = await readFile(defaultPath);
    await writeFile(defaultPath, Buffer.concat([before, Buffer.from("\nissue-10-version-probe\n")]));

    const changed = await runGenerator(tempCode);
    assert.notEqual(changed.version, first.version);
    assert.deepEqual(changed.assets, first.assets);
  } finally {
    await rm(tempRoot, {recursive: true, force: true});
  }
});

test("clean-profile install set is sufficient for an offline module launch", async () => {
  const manifest = await readManifest(codeRoot);
  const cached = new Map();

  for (const asset of manifest.assets) {
    const relative = asset === "./" ? "index.html" : asset.replace(/^\.\//, "");
    cached.set(asset, await readFile(path.join(codeRoot, relative)));
  }

  const seen = new Set();
  const visit = async (asset) => {
    if (seen.has(asset)) return;
    seen.add(asset);
    assert.ok(cached.has(asset), `offline cache miss: ${asset}`);

    if (!asset.endsWith(".js") || !asset.startsWith("./src/")) return;
    const source = cached.get(asset).toString("utf8");
    const importerDir = path.posix.dirname(asset);
    for (const specifier of staticImports(source)) {
      const resolved = path.posix.normalize(path.posix.join(importerDir, specifier));
      await visit(resolved.startsWith(".") ? resolved : `./${resolved}`);
    }
  };

  await visit("./src/app.js");
  assert.ok(seen.size >= 9, "expected the complete app module graph to be traversed");
});

test("service worker update replaces only versioned caches and never resets IndexedDB", async () => {
  const source = await readFile(path.join(codeRoot, "service-worker.js"), "utf8");
  assert.match(source, /cache:\s*"reload"/);
  assert.match(source, /key\.startsWith\(CACHE_PREFIX\)/);
  assert.match(source, /key !== CACHE_NAME/);
  assert.doesNotMatch(source, /indexedDB|deleteDatabase/i);
  assert.match(source, /cache\.match\(event\.request\)/);
});
