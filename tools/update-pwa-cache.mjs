import {createHash} from "node:crypto";
import {readdir, readFile, writeFile} from "node:fs/promises";
import {dirname, join, relative, resolve} from "node:path";
import {fileURLToPath} from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_SITE_DIR = join(REPO_ROOT, "code");
const DEFAULT_SERVICE_WORKER = join(DEFAULT_SITE_DIR, "service-worker.js");

export const SHELL_ASSETS = Object.freeze([
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./default_project.mcb",
  "./icons/icon-192.svg",
  "./icons/icon-512.svg"
]);

async function listJavaScriptFiles(root, directory = root) {
  const entries = await readdir(directory, {withFileTypes: true});
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listJavaScriptFiles(root, path));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push(path);
    }
  }
  return files
    .map((path) => `./${relative(root, path).replaceAll("\\", "/")}`)
    .sort((a, b) => a.localeCompare(b, "en"));
}

export async function collectPwaAssets(siteDir = DEFAULT_SITE_DIR) {
  const runtimeAssets = await listJavaScriptFiles(siteDir, join(siteDir, "src"));
  return [...SHELL_ASSETS, ...runtimeAssets];
}

function assetPath(siteDir, asset) {
  if (asset === "./") return join(siteDir, "index.html");
  return join(siteDir, asset.replace(/^\.\//, ""));
}

export function computeCacheNameFromEntries(entries) {
  const hash = createHash("sha256");
  hash.update("mu-chordbot-pwa-cache-v1\0");
  for (const {asset, bytes} of [...entries].sort((a, b) => a.asset.localeCompare(b.asset, "en"))) {
    hash.update(asset);
    hash.update("\0");
    hash.update(bytes);
    hash.update("\0");
  }
  return `mu-chordbot-${hash.digest("hex").slice(0, 20)}`;
}

export async function buildCacheManifest(siteDir = DEFAULT_SITE_DIR) {
  const assets = await collectPwaAssets(siteDir);
  const entries = [];
  for (const asset of assets) {
    entries.push({asset, bytes: await readFile(assetPath(siteDir, asset))});
  }
  return {assets, cacheName: computeCacheNameFromEntries(entries)};
}

export function renderManifestBlock({assets, cacheName}) {
  return [
    "/* PWA_CACHE_MANIFEST_START */",
    `const CACHE_NAME = ${JSON.stringify(cacheName)};`,
    `const ASSETS = ${JSON.stringify(assets, null, 2)};`,
    "/* PWA_CACHE_MANIFEST_END */"
  ].join("\n");
}

export async function updateServiceWorker({
  siteDir = DEFAULT_SITE_DIR,
  serviceWorkerPath = DEFAULT_SERVICE_WORKER
} = {}) {
  const manifest = await buildCacheManifest(siteDir);
  const current = await readFile(serviceWorkerPath, "utf8");
  const start = "/* PWA_CACHE_MANIFEST_START */";
  const end = "/* PWA_CACHE_MANIFEST_END */";
  const startIndex = current.indexOf(start);
  const endIndex = current.indexOf(end);
  if (startIndex < 0 || endIndex < startIndex) {
    throw new Error("service-worker.js is missing PWA cache manifest markers");
  }
  const after = endIndex + end.length;
  const next = current.slice(0, startIndex) + renderManifestBlock(manifest) + current.slice(after);
  await writeFile(serviceWorkerPath, next, "utf8");
  return manifest;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const manifest = await updateServiceWorker();
  process.stdout.write(`${manifest.cacheName} ${manifest.assets.length} assets\n`);
}
