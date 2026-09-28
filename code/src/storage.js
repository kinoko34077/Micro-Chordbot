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
  return { ...projectFile, defaultProjectSourceId: DEFAULT_PROJECT_SOURCE_ID };
}
async function readStoredProject() {
  let db = null;
  try {
    db = await withTimeout(openDb(), DB_TIMEOUT_MS, "Project DB open");
    const value = await withTimeout(new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(KEY);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error || new Error("Project DB read failed"));
    }), DB_TIMEOUT_MS, "Project DB read");
    return { status: value == null ? "absent" : "loaded", value };
  } catch (error) {
    return {
      status: "read_failed",
      error: error instanceof Error ? error : new Error(String(error || "Project DB read failed"))
    };
  } finally {
    db?.close();
  }
}

export async function loadProjectResult() {
  const readResult = await readStoredProject();

  if (readResult.status === "read_failed") {
    console.warn("Project DB load failed. Using an in-memory fallback without persisting it.", readResult.error);
    try {
      const project = await loadDefaultProject();
      return { status: "read_failed", project, error: readResult.error };
    } catch (fallbackError) {
      return { status: "read_failed", project: null, error: readResult.error, fallbackError };
    }
  }
  if (readResult.status === "loaded") {
    const project = readResult.value;
    if (project?.defaultProjectSourceId !== DEFAULT_PROJECT_SOURCE_ID) {
      const defaultProject = await loadDefaultProject();
      await saveProject(defaultProject);
      return { status: "initialized", project: defaultProject };
    }
    lastSavedSnapshot = JSON.stringify(project);
    return { status: "loaded", project };
  }

  const defaultProject = await loadDefaultProject();
  await saveProject(defaultProject);
  lastSavedSnapshot = JSON.stringify(defaultProject);
  return { status: "initialized", project: defaultProject };
}

export async function loadProject() {
  const result = await loadProjectResult();
  return result.project;
}
