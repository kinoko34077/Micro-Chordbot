import {createHash} from "node:crypto";
import {readdir, readFile, writeFile} from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const out = {site: "code"};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--site") {
      out.site = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

async function walkJs(root, relative = "") {
  const dir = path.join(root, relative);
  const entries = await readdir(dir, {withFileTypes: true});
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

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b, "en"));
}

async function fileBytes(siteRoot, asset) {
  const relative = asset === "./" ? "index.html" : asset.replace(/^\.\//, "");
  return readFile(path.join(siteRoot, relative));
}

async function main() {
  const {site} = parseArgs(process.argv.slice(2));
  const siteRoot = path.resolve(site);
  const runtimeModules = (await walkJs(path.join(siteRoot, "src"))).map((file) => `./src/${file}`);

  const contentAssets = uniqueSorted([
    "./index.html",
    "./styles.css",
    "./manifest.webmanifest",
    "./default_project.mcb",
    "./icons/icon-192.svg",
    "./icons/icon-512.svg",
    ...runtimeModules,
  ]);

  const hash = createHash("sha256");
  for (const asset of contentAssets) {
    hash.update(asset);
    hash.update("\0");
    hash.update(await fileBytes(siteRoot, asset));
    hash.update("\0");
  }
  const version = `sha256-${hash.digest("hex").slice(0, 16)}`;

  const assets = uniqueSorted([
    "./",
    ...contentAssets,
    "./pwa-version.js",
    "./pwa-cache-manifest.js",
  ]);

  const versionSource =
    `window.__MU_CHORDBOT_PWA_VERSION__ = ${JSON.stringify(version)};\n`;

  const manifestSource =
    "self.__MU_CHORDBOT_PWA_CACHE__ = Object.freeze({\n" +
    `  version: ${JSON.stringify(version)},\n` +
    "  assets: Object.freeze(" + JSON.stringify(assets, null, 2) + ")\n" +
    "});\n";

  await writeFile(path.join(siteRoot, "pwa-version.js"), versionSource, "utf8");
  await writeFile(path.join(siteRoot, "pwa-cache-manifest.js"), manifestSource, "utf8");

  process.stdout.write(JSON.stringify({version, assets}) + "\n");
}

await main();
