const DB_NAME = "muChordbotDB";
const STORE_NAME = "project";
const KEY = "current";
const DEFAULT_PROJECT_URL = "./default_project.mcb";

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveProject(stateWithoutHistory) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(stateWithoutHistory, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

async function loadDefaultProject() {
  const response = await fetch(DEFAULT_PROJECT_URL, { cache: "no-cache" });
  if (!response.ok) {
    throw new Error(`Default project load failed: ${response.status}`);
  }
  const projectFile = await response.json();
  const payload = projectFile?.payload;
  if (!payload || projectFile?.app !== "muChordbot" || projectFile?.extensionType !== "mcb") {
    throw new Error("Default project file is invalid.");
  }
  return payload;
}

export async function loadProject() {
  const db = await openDb();
  const value = await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
  db.close();

  if (value) {
    return value;
  }

  try {
    const defaultProject = await loadDefaultProject();
    await saveProject(defaultProject);
    return defaultProject;
  } catch (error) {
    console.warn(error);
    return null;
  }
}
