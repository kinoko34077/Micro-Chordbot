const DB_NAME = "muChordbotDB";
const STORE_NAME = "project";
const KEY = "current";
const DEFAULT_PROJECT_URL = "./default_project.mcb";
const DEFAULT_PROJECT_SOURCE_ID = "project-7";
const DB_TIMEOUT_MS = 900;
let lastSavedSnapshot = "";

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    })
  ]);
}

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
  const storedValue = stateWithoutHistory?.app === "muChordbot"
    ? { ...stateWithoutHistory, defaultProjectSourceId: DEFAULT_PROJECT_SOURCE_ID }
    : stateWithoutHistory;
  const nextSnapshot = JSON.stringify(storedValue);
  if (nextSnapshot === lastSavedSnapshot) {
    return false;
  }
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(storedValue, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
  lastSavedSnapshot = nextSnapshot;
  return true;
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
  return {
    ...projectFile,
    defaultProjectSourceId: DEFAULT_PROJECT_SOURCE_ID
  };
}

export async function loadProject() {
  let db = null;
  let value = null;
  try {
    db = await withTimeout(openDb(), DB_TIMEOUT_MS, "Project DB open");
    value = await withTimeout(new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    }), DB_TIMEOUT_MS, "Project DB read");
  } catch (error) {
    console.warn("Project DB load failed. Falling back to default project.", error);
  } finally {
    db?.close();
  }

  if (value) {
    if (value?.defaultProjectSourceId !== DEFAULT_PROJECT_SOURCE_ID) {
      const defaultProject = await loadDefaultProject();
      await saveProject(defaultProject).catch(() => {});
      return defaultProject;
    }
    lastSavedSnapshot = JSON.stringify(value);
    return value;
  }

  try {
    const defaultProject = await loadDefaultProject();
    await saveProject(defaultProject).catch(() => {});
    lastSavedSnapshot = JSON.stringify(defaultProject);
    return defaultProject;
  } catch (error) {
    console.warn(error);
    return null;
  }
}
