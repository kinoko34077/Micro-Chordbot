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

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isIdentifiedObjectArray(value) {
  return Array.isArray(value) && value.every(
    (item) => isRecord(item) && typeof item.id === "string" && item.id.trim()
  );
}

function isRecognizedProjectPayload(payload) {
  return Boolean(
    isRecord(payload) &&
    isRecord(payload.settings) &&
    isIdentifiedObjectArray(payload.pitchPresets) &&
    isIdentifiedObjectArray(payload.chordPresets) &&
    isRecord(payload.progression) &&
    isIdentifiedObjectArray(payload.progression.parts) &&
    isRecord(payload.progressionEditor)
  );
}

function isHistoricalUserProjectEnvelope(value) {
  return Boolean(
    isRecord(value) &&
    !Object.hasOwn(value, "defaultProjectSourceId") &&
    value.app === "muChordbot" &&
    typeof value.specVersion === "string" &&
    value.specVersion.trim() &&
    value.extensionType === "mcb" &&
    value.exportType === "project" &&
    isRecognizedProjectPayload(value.payload)
  );
}

function isHistoricalGeneratedDefaultPayload(value) {
  return Boolean(
    isRecord(value) &&
    !Object.hasOwn(value, "defaultProjectSourceId") &&
    !Object.hasOwn(value, "app") &&
    !Object.hasOwn(value, "specVersion") &&
    !Object.hasOwn(value, "extensionType") &&
    !Object.hasOwn(value, "exportType") &&
    isRecognizedProjectPayload(value)
  );
}

function recoveryRequired(reason) {
  return {
    status: "recovery_required",
    project: null,
    error: new Error(reason)
  };
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
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(storedValue, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    lastSavedSnapshot = nextSnapshot;
    return true;
  } finally {
    db.close();
  }
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

    if (project?.defaultProjectSourceId === DEFAULT_PROJECT_SOURCE_ID) {
      lastSavedSnapshot = JSON.stringify(project);
      return { status: "loaded", project };
    }

    if (Object.hasOwn(project || {}, "defaultProjectSourceId")) {
      return recoveryRequired(
        "保存済みプロジェクトの出所マーカーを安全に判定できません。IndexedDB の muChordbotDB/project/current を退避してから再試行してください。"
      );
    }

    if (isHistoricalUserProjectEnvelope(project)) {
      const migratedProject = {
        ...project,
        defaultProjectSourceId: DEFAULT_PROJECT_SOURCE_ID
      };
      await saveProject(migratedProject);
      lastSavedSnapshot = JSON.stringify(migratedProject);
      return { status: "loaded", project: migratedProject, migrated: true };
    }

    if (isHistoricalGeneratedDefaultPayload(project)) {
      const defaultProject = await loadDefaultProject();
      await saveProject(defaultProject);
      lastSavedSnapshot = JSON.stringify(defaultProject);
      return { status: "initialized", project: defaultProject };
    }

    return recoveryRequired(
      "保存済みプロジェクトを安全に移行できません。自動保存せず、IndexedDB の muChordbotDB/project/current を退避してから再試行してください。"
    );
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
