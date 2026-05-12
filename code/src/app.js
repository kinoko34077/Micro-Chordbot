import { AudioEngine } from "./audio.js";
import { HistoryManager } from "./history.js";
import {
  centToMicroStep,
  microStepToCent,
  normalizePitch,
  frequencyFromPitch,
  snapCent,
  clamp,
  OCTAVE_MICROSTEP
} from "./pitch.js";
import { loadProject, saveProject } from "./storage.js";

const audio = new AudioEngine();
const history = new HistoryManager(100);
const MOMENTARY_VOICE_ID = "__preview__";
const DRAG_PREVIEW_VOICE_ID = "__preview_drag__";
const PROGRESSION_VOICE_PREFIX = "__prog__:";
const PROGRESSION_PREVIEW_VOICE_PREFIX = "__prog_preview__:";
const ROOT_NOTE_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ROOT_ACCIDENTAL_OPTIONS = [
  { id: "flat", symbol: "b", delta: -1 },
  { id: "natural", symbol: "", delta: 0 },
  { id: "sharp", symbol: "#", delta: 1 }
];

const state = {
  settings: {
    a4Hz: 440,
    bpm: 130,
    roundUnitCent: 0,
    roundingMode: "beforeRoot",
    masterVolume: 0.3,
    activeNotesVolume: 0.5,
    snapCent: 16.666,
    playMode: "toggle",
    waveform: "sine",
    dismissedRuntimeNotice: false,
    dismissedPwaNotice: false,
    progressionCellWidth: 192,
    tableColumnWidths: {
      name: 14,
      cent: 7,
      short: 7,
      tags: 10,
      memo: 12
    }
  },
  pitchDraft: {
    octave: 4,
    cent: 0,
    microStepInOctave: 0
  },
  activeNotes: [],
  pitchPresets: [],
  chordPresets: [],
  progression: {
    id: "PROG_MAIN",
    name: "main loop",
    columns: 4,
    loop: false,
    selectedPartId: null,
    playingPartId: null,
    parts: []
  },
  progressionEditor: {
    chordId: null,
    rootNoteText: "C4",
    beats: 4
  }
};

const els = {
  runtimeWarning: document.getElementById("runtimeWarning"),
  runtimeWarningMessage: document.getElementById("runtimeWarningMessage"),
  runtimeWarningCloseBtn: document.getElementById("runtimeWarningCloseBtn"),
  pwaPrompt: document.getElementById("pwaPrompt"),
  pwaPromptMessage: document.getElementById("pwaPromptMessage"),
  installPwaBtn: document.getElementById("installPwaBtn"),
  pwaPromptCloseBtn: document.getElementById("pwaPromptCloseBtn"),
  views: [...document.querySelectorAll(".view")],
  navButtons: [...document.querySelectorAll(".view-nav button")],
  undoBtn: document.getElementById("undoBtn"),
  redoBtn: document.getElementById("redoBtn"),
  octaveInput: document.getElementById("octaveInput"),
  snapCentInput: document.getElementById("snapCentInput"),
  centInput: document.getElementById("centInput"),
  centDownBtn: document.getElementById("centDownBtn"),
  centUpBtn: document.getElementById("centUpBtn"),
  microStepInput: document.getElementById("microStepInput"),
  sustainModeInput: document.getElementById("sustainModeInput"),
  waveformSelect: document.getElementById("waveformSelect"),
  masterVolumeInput: document.getElementById("masterVolumeInput"),
  activeNotesVolumeInput: document.getElementById("activeNotesVolumeInput"),
  lineCanvas: document.getElementById("pitchLine"),
  lineReadout: document.getElementById("lineReadout"),
  activeNotesSummary: document.getElementById("activeNotesSummary"),
  activeNotesList: document.getElementById("activeNotesList"),
  activeNotesFilterInput: document.getElementById("activeNotesFilterInput"),
  clearActiveNotesBtn: document.getElementById("clearActiveNotesBtn"),
  pitchPresetIdInput: document.getElementById("pitchPresetIdInput"),
  pitchPresetNameInput: document.getElementById("pitchPresetNameInput"),
  pitchPresetShortNameInput: document.getElementById("pitchPresetShortNameInput"),
  pitchPresetTagsInput: document.getElementById("pitchPresetTagsInput"),
  pitchPresetMemoInput: document.getElementById("pitchPresetMemoInput"),
  savePitchPresetBtn: document.getElementById("savePitchPresetBtn"),
  pitchPresetStatus: document.getElementById("pitchPresetStatus"),
  pitchPresetList: document.getElementById("pitchPresetList"),
  pitchPresetFilterInput: document.getElementById("pitchPresetFilterInput"),
  chordIdInput: document.getElementById("chordIdInput"),
  chordNameInput: document.getElementById("chordNameInput"),
  chordBaseRootSelect: document.getElementById("chordBaseRootSelect"),
  chordTagsInput: document.getElementById("chordTagsInput"),
  chordLabelsInput: document.getElementById("chordLabelsInput"),
  chordMemoInput: document.getElementById("chordMemoInput"),
  chordTagFilterInput: document.getElementById("chordTagFilterInput"),
  saveChordBtn: document.getElementById("saveChordBtn"),
  chordStatus: document.getElementById("chordStatus"),
  chordPresetList: document.getElementById("chordPresetList"),
  recallChordSelect: document.getElementById("recallChordSelect"),
  recallRootModeSelect: document.getElementById("recallRootModeSelect"),
  recallRootTextInput: document.getElementById("recallRootTextInput"),
  recallRootPresetSelect: document.getElementById("recallRootPresetSelect"),
  recallRootOctaveInput: document.getElementById("recallRootOctaveInput"),
  loadChordBtn: document.getElementById("loadChordBtn"),
  recallChordStatus: document.getElementById("recallChordStatus"),
  recallChordSummary: document.getElementById("recallChordSummary"),
  progressionView: document.getElementById("view-progression"),
  progPrevBtn: document.getElementById("progPrevBtn"),
  progNextBtn: document.getElementById("progNextBtn"),
  progCounter: document.getElementById("progCounter"),
  progMenuToggleBtn: document.getElementById("progMenuToggleBtn"),
  progToolbarActions: document.getElementById("progToolbarActions"),
  progColumnsSelect: document.getElementById("progColumnsSelect"),
  progressionEditor: document.getElementById("progressionEditor"),
  progEditorToggleBtn: document.getElementById("progEditorToggleBtn"),
  progressionEditorBody: document.getElementById("progressionEditorBody"),
  progRootNoteInput: document.getElementById("progRootNoteInput"),
  progRootOctaveInput: document.getElementById("progRootOctaveInput"),
  progFlatBtn: document.getElementById("progFlatBtn"),
  progNaturalBtn: document.getElementById("progNaturalBtn"),
  progSharpBtn: document.getElementById("progSharpBtn"),
  progOctaveButtons: document.getElementById("progOctaveButtons"),
  progRootLetterButtons: document.getElementById("progRootLetterButtons"),
  progChordTagFilterInput: document.getElementById("progChordTagFilterInput"),
  progChordButtonGrid: document.getElementById("progChordButtonGrid"),
  progBeatsButtonGrid: document.getElementById("progBeatsButtonGrid"),
  addProgPartBtn: document.getElementById("addProgPartBtn"),
  deleteProgPartBtn: document.getElementById("deleteProgPartBtn"),
  playProgBtn: document.getElementById("playProgBtn"),
  stopProgBtn: document.getElementById("stopProgBtn"),
  progLoopInput: document.getElementById("progLoopInput"),
  progStatus: document.getElementById("progStatus"),
  progSummary: document.getElementById("progSummary"),
  progressionGrid: document.getElementById("progressionGrid"),
  a4HzInput: document.getElementById("a4HzInput"),
  bpmInput: document.getElementById("bpmInput"),
  roundUnitInput: document.getElementById("roundUnitInput"),
  roundingModeSelect: document.getElementById("roundingModeSelect"),
  runtimeInfoText: document.getElementById("runtimeInfoText"),
  presetNameWidthInput: document.getElementById("presetNameWidthInput"),
  presetCentWidthInput: document.getElementById("presetCentWidthInput"),
  presetShortWidthInput: document.getElementById("presetShortWidthInput"),
  presetTagWidthInput: document.getElementById("presetTagWidthInput"),
  presetMemoWidthInput: document.getElementById("presetMemoWidthInput"),
  progressionCellWidthInput: document.getElementById("progressionCellWidthInput"),
  exportBtn: document.getElementById("exportBtn"),
  exportLibraryBtn: document.getElementById("exportLibraryBtn"),
  importFileInput: document.getElementById("importFileInput")
  ,
  manageStatus: document.getElementById("manageStatus")
};

let dragContext = null;
let progressionPlayback = {
  timerId: null,
  partIndex: -1
};
let progressionPreviewTimerId = null;
let deferredInstallPrompt = null;
let runtimeState = null;
let runtimeBanner = { message: "", tone: "", visible: false };
const progressionUi = {
  draggingPartId: null,
  dragOverPartId: null,
  dragPlacement: "after",
  longPressTimerId: null,
  pendingPointerId: null,
  pendingPartId: null,
  pointerStartX: 0,
  pointerStartY: 0,
  suppressClick: false,
  isMenuOpen: false,
  isEditorExpanded: false
};
const presetUi = {
  editingPitchPresetId: null,
  editingChordPresetId: null,
  pitchPresetClickTimerId: null,
  chordPresetClickTimerId: null
};

function showRuntimeWarning(message) {
  runtimeBanner = { message, tone: "", visible: true };
  renderRuntimeBanner();
}

function hideRuntimeWarning() {
  runtimeBanner = { message: "", tone: "", visible: false };
  renderRuntimeBanner();
}

function validateRuntime() {
  const protocol = window.location.protocol;
  const secureLike = protocol === "http:" || protocol === "https:";
  if (secureLike) {
    hideRuntimeWarning();
    return { status: "ok", protocol };
  }
  showRuntimeWarning(
    "このアプリは <code>localhost</code> で開いてください。<br>" +
    "例: <code>python -m http.server 5173</code> を実行し、" +
    "<code>http://localhost:5173/</code> を開いてください。<br>" +
    "現在のURLではES ModulesやService Workerが制限され、JSが正常動作しない可能性があります。"
  );
  return { status: "warning", protocol };
}

function showRuntimeNotice(message, tone = "info") {
  runtimeBanner = { message, tone, visible: true };
  state.settings.dismissedRuntimeNotice = false;
  renderRuntimeBanner();
}

function clearRuntimeWarningTone() {
  runtimeBanner.tone = "";
  renderRuntimeBanner();
}

function renderRuntimeBanner() {
  if (!els.runtimeWarning || !els.runtimeWarningMessage) return;
  const hidden = !runtimeBanner.visible || !runtimeBanner.message || state.settings.dismissedRuntimeNotice;
  els.runtimeWarning.classList.toggle("hidden", hidden);
  els.runtimeWarningMessage.innerHTML = runtimeBanner.message || "";
  if (runtimeBanner.tone) {
    els.runtimeWarning.dataset.tone = runtimeBanner.tone;
  } else {
    delete els.runtimeWarning.dataset.tone;
  }
  renderRuntimeInfo();
}

function renderRuntimeInfo() {
  if (!els.runtimeInfoText || !runtimeState) return;
  const runtimeLabel = `runtime: ${runtimeState.mode} (${runtimeState.protocol}//${runtimeState.hostname || ""})`;
  const bannerText = runtimeBanner.message
    ? runtimeBanner.message.replace(/<br\s*\/?>/gi, " / ").replace(/<[^>]+>/g, "").trim()
    : "現在バナー表示はありません。";
  const pwaText = els.pwaPromptMessage?.textContent?.trim() || "現在 PWA テロップ表示はありません。";
  els.runtimeInfoText.textContent = `${runtimeLabel} / notice: ${bannerText} / pwa: ${pwaText}`;
}

function applyLayoutSettings() {
  const widths = state.settings.tableColumnWidths || {};
  document.documentElement.style.setProperty("--preset-name-col", `${widths.name || 14}rem`);
  document.documentElement.style.setProperty("--preset-cent-col", `${widths.cent || 7}rem`);
  document.documentElement.style.setProperty("--preset-short-col", `${widths.short || 7}rem`);
  document.documentElement.style.setProperty("--preset-tags-col", `${widths.tags || 10}rem`);
  document.documentElement.style.setProperty("--preset-memo-col", `${widths.memo || 12}rem`);
  document.documentElement.style.setProperty("--progression-cell-width", `${state.settings.progressionCellWidth || 192}px`);
}

function buildPresetColGroup(columns) {
  const colgroup = document.createElement("colgroup");
  columns.forEach((column) => {
    const col = document.createElement("col");
    col.className = `col-${column}`;
    colgroup.appendChild(col);
  });
  return colgroup;
}

function isLocalhostHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function isLanHost(hostname) {
  const ipv4 = String(hostname || "").match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!ipv4) return false;
  const a = Number(ipv4[1]);
  const b = Number(ipv4[2]);
  return a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

function isIosLike() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandaloneDisplay() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

function snapshotState() {
  return JSON.parse(JSON.stringify({
    settings: state.settings,
    pitchDraft: state.pitchDraft,
    activeNotes: state.activeNotes,
    pitchPresets: state.pitchPresets,
    chordPresets: state.chordPresets,
    progression: state.progression,
    progressionEditor: state.progressionEditor
  }));
}

function setStatus(el, message, tone = "") {
  if (!el) return;
  el.textContent = message;
  if (tone) {
    el.dataset.tone = tone;
  } else {
    delete el.dataset.tone;
  }
}

function absoluteMicroStep(note) {
  return (note.octave * OCTAVE_MICROSTEP) + note.microStepInOctave;
}

function parseCsvList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeFilterText(value) {
  return String(value || "").trim().toLowerCase();
}

function compareNamedItems(a, b) {
  return String(a?.name || a?.id || "").localeCompare(String(b?.name || b?.id || ""), "ja");
}

function sortedPitchPresets() {
  return [...state.pitchPresets].sort(compareNamedItems);
}

function sortedChordPresets() {
  return [...state.chordPresets].sort(compareNamedItems);
}

function filteredPitchPresets(filterText) {
  const normalized = normalizeFilterText(filterText);
  const presets = sortedPitchPresets();
  if (!normalized) return presets;
  return presets.filter((preset) => {
    const tags = Array.isArray(preset.tags) ? preset.tags.join(" ").toLowerCase() : "";
    const haystack = `${preset.id} ${preset.name} ${preset.shortName || ""} ${preset.memo || ""} ${tags}`.toLowerCase();
    return haystack.includes(normalized);
  });
}

function filteredActiveNotes(filterText) {
  const normalized = normalizeFilterText(filterText);
  const notes = [...state.activeNotes].sort((a, b) => absoluteMicroStep(a) - absoluteMicroStep(b));
  if (!normalized) return notes;
  return notes.filter((note, index) => {
    const preset = findPitchPresetByMicroStep(note.microStepInOctave);
    const tags = Array.isArray(preset?.tags) ? preset.tags.join(" ").toLowerCase() : "";
    const haystack = [
      note.id,
      describeNoteTitle(note, index),
      preset?.name || "",
      preset?.shortName || "",
      preset?.memo || "",
      tags
    ].join(" ").toLowerCase();
    return haystack.includes(normalized);
  });
}

function filteredChordPresets(filterText) {
  const normalized = normalizeFilterText(filterText);
  const chords = sortedChordPresets();
  if (!normalized) return chords;
  return chords.filter((chord) => {
    const tags = Array.isArray(chord.tags) ? chord.tags.join(" ").toLowerCase() : "";
    const haystack = `${chord.id} ${chord.name} ${chord.memo || ""} ${tags}`.toLowerCase();
    return haystack.includes(normalized);
  });
}

function slugifyIdPart(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^0-9A-Za-z_:-]/g, "")
    .toUpperCase();
}

function buildNoteId(octave, microStepInOctave) {
  return `note:${octave}:${microStepInOctave}`;
}

function buildProjectPayload() {
  return {
    app: "muChordbot",
    specVersion: "1.2.0",
    extensionType: "mcb",
    exportType: "project",
    payload: {
      settings: state.settings,
      pitchPresets: state.pitchPresets,
      chordPresets: state.chordPresets,
      progression: state.progression,
      progressionEditor: state.progressionEditor
    }
  };
}

function buildLibraryPayload() {
  return {
    app: "muChordbot",
    specVersion: "1.2.0",
    extensionType: "mcbl",
    exportType: "library",
    payload: {
      pitchPresets: state.pitchPresets,
      chordPresets: state.chordPresets
    }
  };
}

function findPitchPresetById(id) {
  return state.pitchPresets.find((preset) => preset.id === id) || null;
}

function findPitchPresetByMicroStep(microStep) {
  return state.pitchPresets.find((preset) => preset.microStep === microStep) || null;
}

function formatDecimal(value, maxFractionDigits = 3) {
  const num = Number(value);
  if (!Number.isFinite(num)) return "";
  return num.toFixed(maxFractionDigits).replace(/\.?0+$/, "");
}

function formatCent(value) {
  return `${formatDecimal(value)} cent`;
}

function formatMicroStep(value) {
  return `ms ${Math.round(Number(value) || 0)}`;
}

function formatPresetDisplayName(preset) {
  if (!preset) return "";
  return preset.shortName || preset.name || preset.id;
}

function describeNoteTitle(note, index = 0) {
  const intervalPreset = findPitchPresetByMicroStep(note.microStepInOctave);
  return intervalPreset ? formatPresetDisplayName(intervalPreset) : `note ${index + 1}`;
}

function buildChordToneDefaults(note, index, rootNote) {
  if (note.id === rootNote.id) return "Root";
  const relative = normalizePitch(0, absoluteMicroStep(note) - absoluteMicroStep(rootNote));
  const preset = findPitchPresetByMicroStep(relative.microStepInOctave);
  if (preset) return formatPresetDisplayName(preset);
  return `tone${index + 1}`;
}

function deriveChordName(labels, tones) {
  const labelBased = labels.filter(Boolean).join("-");
  if (labelBased) return labelBased;
  const toneBased = tones.map((tone) => tone.label).filter(Boolean).join("-");
  if (toneBased) return toneBased;
  return `Chord ${state.chordPresets.length + 1}`;
}

function currentDraftFrequency() {
  return frequencyFromPitch(
    state.settings.a4Hz,
    state.pitchDraft.octave,
    state.pitchDraft.microStepInOctave
  );
}

async function syncAudioToActiveNotes() {
  audio.stopVoice(MOMENTARY_VOICE_ID);
  audio.stopVoice(DRAG_PREVIEW_VOICE_ID);

  const activeIds = new Set(state.activeNotes.map((note) => note.id));
  for (const note of state.activeNotes) {
    await audio.startVoice(
      note.id,
      frequencyFromPitch(state.settings.a4Hz, note.octave, note.microStepInOctave),
      state.settings.waveform,
      state.settings.activeNotesVolume
    );
  }

  for (const [voiceId] of audio.voices) {
    if (!activeIds.has(voiceId)) {
      audio.stopVoice(voiceId);
    }
  }
}

function applySnapshot(snap) {
  resetProgressionInteractionState();
  stopProgressionPreview(false);
  stopProgressionPlayback(false);
  state.settings = snap.settings;
  state.pitchDraft = snap.pitchDraft;
  state.activeNotes = snap.activeNotes ?? [];
  state.pitchPresets = snap.pitchPresets ?? [];
  state.chordPresets = snap.chordPresets ?? [];
  state.progression = snap.progression ?? state.progression;
  state.progressionEditor = snap.progressionEditor ?? state.progressionEditor;
  syncFormFromState();
  render();
  void syncAudioToActiveNotes();
}

function trackStateChange(type, label, before, after) {
  history.track({
    id: `cmd_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    type,
    label,
    before,
    after,
    timestamp: new Date().toISOString()
  });
  updateHistoryButtons();
}

function updateHistoryButtons() {
  els.undoBtn.disabled = !history.canUndo();
  els.redoBtn.disabled = !history.canRedo();
}

function isCompactProgressionLayout() {
  return window.matchMedia("(max-width: 640px)").matches;
}

function clearProgressionLongPressTimer() {
  if (progressionUi.longPressTimerId) {
    clearTimeout(progressionUi.longPressTimerId);
    progressionUi.longPressTimerId = null;
  }
  progressionUi.pendingPointerId = null;
  progressionUi.pendingPartId = null;
}

function clearProgressionReorderVisuals() {
  progressionUi.draggingPartId = null;
  progressionUi.dragOverPartId = null;
  progressionUi.dragPlacement = "after";
}

function syncProgressionLayoutState() {
  const compact = isCompactProgressionLayout();
  const editorExpanded = !compact || progressionUi.isEditorExpanded || Boolean(state.progression.selectedPartId);
  els.progressionView.classList.toggle("progression-menu-open", !compact || progressionUi.isMenuOpen);
  els.progressionView.classList.toggle("progression-editor-expanded", editorExpanded);
  els.progToolbarActions.hidden = compact && !progressionUi.isMenuOpen;
  els.progressionEditorBody.hidden = compact && !editorExpanded;
  els.progMenuToggleBtn.hidden = !compact;
  els.progEditorToggleBtn.hidden = !compact;
  els.progMenuToggleBtn.setAttribute("aria-expanded", compact && progressionUi.isMenuOpen ? "true" : "false");
  els.progEditorToggleBtn.setAttribute("aria-expanded", editorExpanded ? "true" : "false");
  els.progMenuToggleBtn.textContent = compact && progressionUi.isMenuOpen ? "閉じる" : "メニュー";
  els.progEditorToggleBtn.textContent = editorExpanded ? "閉じる" : "編集";
}

function suppressNextProgressionGridClick() {
  progressionUi.suppressClick = true;
  window.setTimeout(() => {
    progressionUi.suppressClick = false;
  }, 0);
}

function loadProgressionEditorFromPart(part) {
  if (!part) return;
  state.progressionEditor.chordId = part.chordId;
  state.progressionEditor.rootNoteText = formatDirectRootFromPart(part.root);
  state.progressionEditor.beats = part.beats;
}

function resetProgressionInteractionState() {
  clearProgressionLongPressTimer();
  clearProgressionReorderVisuals();
  progressionUi.isMenuOpen = false;
}

function setView(view) {
  for (const btn of els.navButtons) {
    btn.classList.toggle("active", btn.dataset.view === view);
  }
  for (const sec of els.views) {
    sec.classList.toggle("active", sec.id === `view-${view}`);
  }
  if (view !== "progression") {
    resetProgressionInteractionState();
  } else {
    progressionUi.isEditorExpanded = true;
  }
  syncProgressionLayoutState();
}

function syncDraftFromCent(cent, octave) {
  const snapped = snapCent(cent, state.settings.snapCent);
  const ms = centToMicroStep(snapped);
  const normalized = normalizePitch(octave, ms);
  state.pitchDraft = {
    octave: normalized.octave,
    cent: microStepToCent(normalized.microStepInOctave),
    microStepInOctave: normalized.microStepInOctave
  };
}

function findActiveNoteIndex(noteId) {
  return state.activeNotes.findIndex((note) => note.id === noteId);
}

function parseDirectRootNote(text) {
  const match = String(text || "").trim().match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  if (!match) return null;
  const [, letterRaw, accidentalRaw, octaveRaw] = match;
  const letter = letterRaw.toUpperCase();
  const accidental = accidentalRaw || "";
  const octave = Number(octaveRaw);
  const semitoneBase = ROOT_NOTE_SEMITONES[letter];
  const accidentalShift = ROOT_ACCIDENTAL_OPTIONS.find((option) => option.symbol === accidental)?.delta ?? 0;
  const normalized = normalizePitch(octave, (semitoneBase + accidentalShift) * 300);
  return {
    noteText: `${letter}${accidental}${octave}`,
    octave: normalized.octave,
    microStepInOctave: normalized.microStepInOctave,
    pitchPresetId: null
  };
}

function formatDirectRootFromPart(root) {
  if (root.noteText) return root.noteText;
  const semitone = Math.round(root.microStepInOctave / 300);
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[((semitone % 12) + 12) % 12]}${root.octave}`;
}

function rootEditorParts() {
  const parsed = parseDirectRootNote(state.progressionEditor.rootNoteText);
  if (parsed) {
    const match = parsed.noteText.match(/^([A-G])([#b]?)(-?\d+)$/);
    return { letter: match[1], accidental: match[2], octave: match[3] };
  }
  return { letter: "C", accidental: "", octave: "4" };
}

function currentProgressionSelectionIndex() {
  return state.progression.parts.findIndex((part) => part.id === state.progression.selectedPartId);
}

function renderProgressionChordButtons() {
  els.progChordButtonGrid.innerHTML = "";
  const chords = filteredChordPresets(els.progChordTagFilterInput?.value);
  if (chords.length === 0) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    empty.textContent = "条件に合うコードがありません";
    els.progChordButtonGrid.appendChild(empty);
    return;
  }
  chords.forEach((chord) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.chordId = chord.id;
    button.textContent = chord.name;
    if (state.progressionEditor.chordId === chord.id) {
      button.classList.add("active");
    }
    els.progChordButtonGrid.appendChild(button);
  });
}

function renderProgressionEditorButtons() {
  const parts = rootEditorParts();
  els.progRootLetterButtons.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.note === parts.letter);
  });
  els.progFlatBtn.classList.toggle("active", parts.accidental === "b");
  els.progNaturalBtn.classList.toggle("active", parts.accidental === "");
  els.progSharpBtn.classList.toggle("active", parts.accidental === "#");
  els.progBeatsButtonGrid.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", Number(button.dataset.beats) === state.progressionEditor.beats);
  });
}

function progressionPartLabel(part) {
  const chord = state.chordPresets.find((item) => item.id === part.chordId);
  const rootLabel = formatDirectRootFromPart(part.root);
  return {
    chordName: chord?.name || `(deleted: ${part.chordId})`,
    rootLabel
  };
}

function resolveProgressionRootInput() {
  const noteName = String(els.progRootNoteInput?.value || "").trim();
  const octave = String(els.progRootOctaveInput?.value || "").trim();
  return parseDirectRootNote(`${noteName}${octave}`);
}

function stopProgressionPreview(shouldRender = true) {
  if (progressionPreviewTimerId) {
    clearTimeout(progressionPreviewTimerId);
    progressionPreviewTimerId = null;
  }
  for (const [voiceId] of audio.voices) {
    if (voiceId.startsWith(PROGRESSION_PREVIEW_VOICE_PREFIX)) {
      audio.stopVoice(voiceId);
    }
  }
  if (shouldRender) {
    render();
  }
}

function progressionPartVoiceSpecs(part, voicePrefix) {
  const chord = state.chordPresets.find((item) => item.id === part.chordId);
  if (!chord) return [];

  const rootAbsolute = (part.root.octave * OCTAVE_MICROSTEP) + part.root.microStepInOctave;
  const specs = [];

  chord.tones.forEach((tone, toneIndex) => {
    let intervalMicroStep = 0;
    if (tone.pitchPresetId) {
      const preset = findPitchPresetById(tone.pitchPresetId);
      if (!preset) return;
      intervalMicroStep = preset.microStep;
    } else {
      intervalMicroStep = centToMicroStep(Number(tone.localCent) || 0);
    }

    const absolute = rootAbsolute + (tone.octaveShift * OCTAVE_MICROSTEP) + intervalMicroStep;
    const normalized = normalizePitch(0, absolute);
    specs.push({
      id: `${voicePrefix}${part.id}:${toneIndex}`,
      freq: frequencyFromPitch(state.settings.a4Hz, normalized.octave, normalized.microStepInOctave)
    });
  });

  if (part.bass?.enabled) {
    const bassAbsolute = (part.bass.octave * OCTAVE_MICROSTEP) + part.bass.microStepInOctave - OCTAVE_MICROSTEP;
    const normalizedBass = normalizePitch(0, bassAbsolute);
    specs.push({
      id: `${voicePrefix}${part.id}:bass`,
      freq: frequencyFromPitch(state.settings.a4Hz, normalizedBass.octave, normalizedBass.microStepInOctave)
    });
  }

  return specs;
}

async function previewProgressionPart(part, durationMs = 700) {
  if (!part || state.progression.playingPartId) return;
  stopProgressionPreview(false);
  const specs = progressionPartVoiceSpecs(part, PROGRESSION_PREVIEW_VOICE_PREFIX);
  await Promise.all(
    specs.map((spec) =>
      audio.startVoice(spec.id, spec.freq, state.settings.waveform, state.settings.activeNotesVolume)
    )
  );
  progressionPreviewTimerId = setTimeout(() => {
    stopProgressionPreview();
    render();
  }, durationMs);
  render();
}

function stopProgressionPlayback(shouldRender = true) {
  if (progressionPlayback.timerId) {
    clearTimeout(progressionPlayback.timerId);
    progressionPlayback.timerId = null;
  }
  progressionPlayback.partIndex = -1;
  state.progression.playingPartId = null;
  for (const [voiceId] of audio.voices) {
    if (voiceId.startsWith(PROGRESSION_VOICE_PREFIX)) {
      audio.stopVoice(voiceId);
    }
  }
  if (shouldRender) {
    render();
  }
}

async function playProgressionPart(part, partIndex) {
  stopProgressionPlayback(false);
  stopProgressionPreview(false);
  state.progression.playingPartId = part.id;
  progressionPlayback.partIndex = partIndex;
  const specs = progressionPartVoiceSpecs(part, PROGRESSION_VOICE_PREFIX);
  if (specs.length === 0) {
    render();
    return;
  }

  await Promise.all(
    specs.map((spec) =>
      audio.startVoice(spec.id, spec.freq, state.settings.waveform, state.settings.activeNotesVolume)
    )
  );
  render();

  const beatMs = (60_000 / clamp(state.settings.bpm, 5, 300)) * part.beats;
  progressionPlayback.timerId = setTimeout(() => {
    const nextIndex = partIndex + 1;
    if (nextIndex < state.progression.parts.length) {
      void playProgressionPart(state.progression.parts[nextIndex], nextIndex);
      return;
    }
    if (state.progression.loop && state.progression.parts.length > 0) {
      void playProgressionPart(state.progression.parts[0], 0);
      return;
    }
    stopProgressionPlayback();
  }, beatMs);
}

function removeActiveNote(noteId) {
  const index = findActiveNoteIndex(noteId);
  if (index < 0) return;
  const before = snapshotState();
  state.activeNotes.splice(index, 1);
  audio.stopVoice(noteId);
  const after = snapshotState();
  trackStateChange("remove_active_note", "activeNotesから削除", before, after);
  syncFormFromState();
  render();
}

function renderLine() {
  const canvas = els.lineCanvas;
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 12; i += 1) {
    const x = (canvas.width * i) / 12;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }

  const labels = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B", "C"];
  ctx.fillStyle = "#94a3b8";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  labels.forEach((label, index) => {
    const rawX = (canvas.width * index) / 12;
    const x = clamp(rawX + (index === 0 ? 12 : index === 12 ? -12 : 0), 12, canvas.width - 12);
    ctx.fillText(label, x, 12);
  });
  ctx.textAlign = "start";

  const draftX = (state.pitchDraft.microStepInOctave / OCTAVE_MICROSTEP) * canvas.width;
  ctx.strokeStyle = "#22d3ee";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(draftX, 16);
  ctx.lineTo(draftX, canvas.height - 8);
  ctx.stroke();

  const sortedActiveNotes = [...state.activeNotes].sort((a, b) => absoluteMicroStep(a) - absoluteMicroStep(b));
  const centerOctave = 3;
  const octaveStepY = 10;
  const markerBaseY = canvas.height / 2;
  sortedActiveNotes.forEach((note, index) => {
    const x = (note.microStepInOctave / OCTAVE_MICROSTEP) * canvas.width;
    const octaveOffset = note.octave - centerOctave;
    const markerY = clamp(markerBaseY - (octaveOffset * octaveStepY), 24, canvas.height - 14);
    ctx.fillStyle = "#fb7185";
    ctx.beginPath();
    ctx.arc(x, markerY, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f8fafc";
    ctx.font = "10px sans-serif";
    ctx.fillText(String(index + 1), x - 3, markerY + 4);
  });

  if (audio.hasVoice(MOMENTARY_VOICE_ID) || audio.hasVoice(DRAG_PREVIEW_VOICE_ID)) {
    ctx.fillStyle = "#22d3ee";
    ctx.beginPath();
    ctx.arc(draftX, 22, 6, 0, Math.PI * 2);
    ctx.fill();
  }
}

function renderProgressionGrid() {
  els.progressionGrid.innerHTML = "";

  if (state.progression.parts.length === 0) {
    const empty = document.createElement("div");
    empty.className = "grid-placeholder";
    empty.textContent = "セルを追加すると進行がここに並びます";
    els.progressionGrid.appendChild(empty);
    return;
  }

  state.progression.parts.forEach((part, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "progression-cell";
    button.draggable = true;
    if (part.id === state.progression.selectedPartId) {
      button.classList.add("active");
    }
    if (part.id === state.progression.playingPartId) {
      button.classList.add("playing");
    }
    if (part.id === progressionUi.draggingPartId) {
      button.classList.add("reorder-source");
    }
    if (part.id === progressionUi.dragOverPartId) {
      button.classList.add(progressionUi.dragPlacement === "before" ? "drop-before" : "drop-after");
    }
    button.dataset.partId = part.id;
    button.dataset.index = String(index);

    const { chordName, rootLabel } = progressionPartLabel(part);

    const title = document.createElement("div");
    title.className = "cell-title";
    title.textContent = `${rootLabel} ${chordName}`;
    button.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "cell-meta";
    meta.textContent = `${part.beats}/4`;
    button.appendChild(meta);

    els.progressionGrid.appendChild(button);
  });
}

function paintProgressionGridReorderState() {
  els.progressionGrid.querySelectorAll(".progression-cell").forEach((cell) => {
    if (!(cell instanceof HTMLButtonElement)) return;
    const partId = cell.dataset.partId;
    cell.classList.toggle("reorder-source", partId === progressionUi.draggingPartId);
    cell.classList.toggle("drop-before", partId === progressionUi.dragOverPartId && progressionUi.dragPlacement === "before");
    cell.classList.toggle("drop-after", partId === progressionUi.dragOverPartId && progressionUi.dragPlacement === "after");
  });
}

function exportProject() {
  const payload = buildProjectPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "project.mcb";
  a.click();
  URL.revokeObjectURL(a.href);
}

function exportLibrary() {
  const payload = buildLibraryPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "library.mcbl";
  a.click();
  URL.revokeObjectURL(a.href);
}

function mergeById(existingItems, incomingItems) {
  const merged = [...existingItems];
  const existingIds = new Set(existingItems.map((item) => item.id));
  let added = 0;
  for (const item of incomingItems) {
    if (!item?.id || existingIds.has(item.id)) continue;
    merged.push(item);
    existingIds.add(item.id);
    added += 1;
  }
  return { merged, added };
}

async function importDataFile(file) {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const before = snapshotState();
  history.beginGroup("JSON読み込みを元に戻す");
  try {
    const extensionType = parsed?.extensionType;
    if (extensionType === "mcbl" || parsed?.exportType === "library") {
      const incomingPitchPresets = Array.isArray(parsed?.payload?.pitchPresets) ? parsed.payload.pitchPresets : [];
      const incomingChordPresets = Array.isArray(parsed?.payload?.chordPresets) ? parsed.payload.chordPresets : [];
      const pitchMerge = mergeById(state.pitchPresets, incomingPitchPresets);
      const chordMerge = mergeById(state.chordPresets, incomingChordPresets);
      state.pitchPresets = pitchMerge.merged;
      state.chordPresets = chordMerge.merged;
      setStatus(
        els.manageStatus,
        `library を読込: pitch +${pitchMerge.added}, chord +${chordMerge.added}`,
        "success"
      );
    } else {
      if (parsed?.payload?.settings) {
        state.settings = { ...state.settings, ...parsed.payload.settings };
      }
      state.activeNotes = [];
      if (Array.isArray(parsed?.payload?.pitchPresets)) {
        state.pitchPresets = parsed.payload.pitchPresets;
      }
      if (Array.isArray(parsed?.payload?.chordPresets)) {
        state.chordPresets = parsed.payload.chordPresets;
      }
      if (parsed?.payload?.progression) {
        state.progression = {
          ...state.progression,
          ...parsed.payload.progression,
          parts: Array.isArray(parsed.payload.progression.parts) ? parsed.payload.progression.parts : []
        };
      }
      if (parsed?.payload?.progressionEditor) {
        state.progressionEditor = { ...state.progressionEditor, ...parsed.payload.progressionEditor };
      }
      setStatus(els.manageStatus, "project を読込しました。", "success");
    }
    const after = snapshotState();
    trackStateChange("json_import", "JSON読み込みを元に戻す", before, after);
  } finally {
    history.endGroup();
  }
  syncFormFromState();
  render();
  await syncAudioToActiveNotes();
}

function savePitchPresetFromActiveNote(noteId) {
  const li = els.activeNotesList.querySelector(`[data-note-id="${noteId}"]`);
  const note = state.activeNotes.find((item) => item.id === noteId);
  if (!li || !note) return;
  const values = {
    id: li.querySelector('[data-field="id"]')?.value || "",
    name: li.querySelector('[data-field="name"]')?.value || "",
    shortName: li.querySelector('[data-field="shortName"]')?.value || "",
    tags: li.querySelector('[data-field="tags"]')?.value || "",
    memo: li.querySelector('[data-field="memo"]')?.value || ""
  };
  saveCurrentPitchPreset({ note, values });
}

function addProgressionPart() {
  const chordId = state.progressionEditor.chordId;
  if (!chordId) {
    setStatus(els.progStatus, "追加するコードがありません。", "error");
    return;
  }

  const root = resolveProgressionRootInput();
  if (!root) {
    setStatus(els.progStatus, "進行ルートを選べませんでした。", "error");
    return;
  }

  const before = snapshotState();
  const beats = clamp(Number(state.progressionEditor.beats) || 4, 1, 16);
  const partId = `PART_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const newPart = {
    id: partId,
    chordId,
    root,
    bass: {
      enabled: false,
      octave: root.octave,
      microStepInOctave: root.microStepInOctave,
      pitchPresetId: root.pitchPresetId
    },
    beats
  };
  const selectedIndex = state.progression.parts.findIndex((part) => part.id === state.progression.selectedPartId);
  if (selectedIndex >= 0) {
    state.progression.parts.splice(selectedIndex + 1, 0, newPart);
  } else {
    state.progression.parts.push(newPart);
  }
  state.progression.selectedPartId = partId;
  if (state.progression.playingPartId) {
    stopProgressionPlayback(false);
  }
  const after = snapshotState();
  trackStateChange("add_progression_part", "進行セル追加", before, after);
  syncFormFromState();
  render();
  setStatus(els.progStatus, "進行セルを追加しました。", "success");
}

function selectProgressionPart(partId) {
  state.progression.selectedPartId = partId;
  const part = state.progression.parts.find((item) => item.id === partId);
  if (part) {
    loadProgressionEditorFromPart(part);
  }
  progressionUi.isMenuOpen = false;
  progressionUi.isEditorExpanded = true;
  syncFormFromState();
  render();
  if (part) {
    void previewProgressionPart(part);
  }
}

function deleteSelectedProgressionPart() {
  const selectedId = state.progression.selectedPartId;
  if (!selectedId) {
    setStatus(els.progStatus, "削除するセルを選択してください。", "error");
    return;
  }

  const index = state.progression.parts.findIndex((part) => part.id === selectedId);
  if (index < 0) return;

  const before = snapshotState();
  state.progression.parts.splice(index, 1);
  state.progression.selectedPartId = state.progression.parts[index]?.id || state.progression.parts[index - 1]?.id || null;
  const nextSelected = state.progression.parts.find((part) => part.id === state.progression.selectedPartId) || null;
  if (nextSelected) {
    loadProgressionEditorFromPart(nextSelected);
  }
  if (state.progression.playingPartId) {
    stopProgressionPlayback(false);
  }
  const after = snapshotState();
  trackStateChange("delete_progression_part", "進行セル削除", before, after);
  syncFormFromState();
  render();
  setStatus(els.progStatus, "選択セルを削除しました。", "success");
}

function syncProgressionSelectionFromEditor(changeLabel, preview = false) {
  const selectedId = state.progression.selectedPartId;
  if (!selectedId) {
    syncFormFromState();
    render();
    return;
  }
  const index = state.progression.parts.findIndex((part) => part.id === selectedId);
  if (index < 0) return;

  const root = resolveProgressionRootInput();
  if (!root || !state.progressionEditor.chordId) {
    syncFormFromState();
    render();
    return;
  }

  const before = snapshotState();
  state.progression.parts[index] = {
    ...state.progression.parts[index],
    chordId: state.progressionEditor.chordId,
    root,
    bass: {
      enabled: false,
      octave: root.octave,
      microStepInOctave: root.microStepInOctave,
      pitchPresetId: root.pitchPresetId
    },
    beats: clamp(Number(state.progressionEditor.beats) || 4, 1, 16)
  };
  const after = snapshotState();
  trackStateChange("update_progression_part", changeLabel, before, after);
  syncFormFromState();
  render();
  setStatus(els.progStatus, "選択セルへ反映しました。", "success");
  if (preview) {
    void previewProgressionPart(state.progression.parts[index]);
  }
}

function setProgressionEditorRoot({ letter, accidental, octave }) {
  state.progressionEditor.rootNoteText = `${letter}${accidental}${octave}`;
  if (els.progRootNoteInput) els.progRootNoteInput.value = `${letter}${accidental}`;
  if (els.progRootOctaveInput) els.progRootOctaveInput.value = octave;
  syncProgressionSelectionFromEditor("進行セルのルート変更", true);
}

function stepSelectedProgressionPart(direction) {
  if (state.progression.parts.length === 0) return;
  const currentIndex = Math.max(0, currentProgressionSelectionIndex());
  const nextIndex = clamp(currentIndex + direction, 0, state.progression.parts.length - 1);
  selectProgressionPart(state.progression.parts[nextIndex].id);
}

function getProgressionDropPlacement(cell, clientX, clientY) {
  const rect = cell.getBoundingClientRect();
  if (rect.height > rect.width) {
    return clientY < rect.top + (rect.height / 2) ? "before" : "after";
  }
  return clientX < rect.left + (rect.width / 2) ? "before" : "after";
}

function beginProgressionReorder(partId) {
  const part = state.progression.parts.find((item) => item.id === partId);
  if (!part) return;
  clearProgressionLongPressTimer();
  progressionUi.draggingPartId = partId;
  progressionUi.dragOverPartId = null;
  progressionUi.dragPlacement = "after";
  progressionUi.isEditorExpanded = true;
  state.progression.selectedPartId = partId;
  loadProgressionEditorFromPart(part);
  syncFormFromState();
  render();
  setStatus(els.progStatus, "移動先セルをタップ、またはドラッグして並び替え", "success");
}

function cancelProgressionReorder(clearStatus = false) {
  clearProgressionLongPressTimer();
  clearProgressionReorderVisuals();
  if (clearStatus) {
    setStatus(els.progStatus, "", "");
  }
  syncProgressionLayoutState();
  render();
}

function commitProgressionReorder(movingId, targetId, placement) {
  if (!movingId || !targetId || movingId === targetId) {
    cancelProgressionReorder();
    return;
  }

  const before = snapshotState();
  const reordered = [...state.progression.parts];
  const fromIndex = reordered.findIndex((part) => part.id === movingId);
  const targetIndex = reordered.findIndex((part) => part.id === targetId);
  if (fromIndex < 0 || targetIndex < 0) {
    cancelProgressionReorder();
    return;
  }

  const [moving] = reordered.splice(fromIndex, 1);
  const insertBaseIndex = reordered.findIndex((part) => part.id === targetId);
  const insertIndex = placement === "before" ? insertBaseIndex : insertBaseIndex + 1;
  reordered.splice(insertIndex, 0, moving);

  const changed = reordered.some((part, index) => part.id !== state.progression.parts[index]?.id);
  clearProgressionLongPressTimer();
  clearProgressionReorderVisuals();

  if (!changed) {
    syncFormFromState();
    render();
    setStatus(els.progStatus, "並び順は変わっていません", "");
    return;
  }

  state.progression.parts = reordered;
  if (state.progression.playingPartId) {
    stopProgressionPlayback(false);
  }
  const after = snapshotState();
  trackStateChange("reorder_progression_part", "進行セル並び替え", before, after);
  syncFormFromState();
  render();
  setStatus(els.progStatus, "進行セルの並び順を更新しました", "success");
}

function applyActiveNoteGain() {
  audio.setVoiceGain(MOMENTARY_VOICE_ID, state.settings.activeNotesVolume);
  audio.setVoiceGain(DRAG_PREVIEW_VOICE_ID, state.settings.activeNotesVolume);
  state.activeNotes.forEach((note) => {
    audio.setVoiceGain(note.id, state.settings.activeNotesVolume);
  });
  for (const [voiceId] of audio.voices) {
    if (voiceId.startsWith(PROGRESSION_VOICE_PREFIX)) {
      audio.setVoiceGain(voiceId, state.settings.activeNotesVolume);
    }
  }
}

function canvasXFromPointerEvent(canvas, ev) {
  const rect = canvas.getBoundingClientRect();
  return ev.clientX - rect.left;
}

async function applyDragPitch(finalize = false) {
  const canvas = els.lineCanvas;
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || 1;
  const virtualX = dragContext ? dragContext.virtualX : 0;
  const octaveDelta = Math.floor(virtualX / width);
  const normalizedX = ((virtualX % width) + width) % width;
  const cent = (normalizedX / width) * 1200;
  const targetOctave = (dragContext ? dragContext.baseOctave : state.pitchDraft.octave) + octaveDelta;

  syncDraftFromCent(cent, targetOctave);
  syncFormFromState();
  render();

  if (state.settings.playMode === "momentary") {
    await audio.startVoice(
      MOMENTARY_VOICE_ID,
      currentDraftFrequency(),
      state.settings.waveform,
      state.settings.activeNotesVolume
    );
  } else {
    await audio.startVoice(
      DRAG_PREVIEW_VOICE_ID,
      currentDraftFrequency(),
      state.settings.waveform,
      state.settings.activeNotesVolume
    );
  }
  render();

  if (finalize && state.settings.playMode === "toggle") {
    audio.stopVoice(DRAG_PREVIEW_VOICE_ID);
    await toggleCurrentNote();
  }
}

async function toggleCurrentNote() {
  const noteId = buildNoteId(state.pitchDraft.octave, state.pitchDraft.microStepInOctave);
  const index = findActiveNoteIndex(noteId);
  const before = snapshotState();

  if (index >= 0) {
    state.activeNotes.splice(index, 1);
    audio.stopVoice(noteId);
  } else {
    state.activeNotes.push({
      id: noteId,
      octave: state.pitchDraft.octave,
      microStepInOctave: state.pitchDraft.microStepInOctave,
      cent: Number(state.pitchDraft.cent)
    });
    await audio.startVoice(
      noteId,
      currentDraftFrequency(),
      state.settings.waveform,
      state.settings.activeNotesVolume
    );
  }

  const after = snapshotState();
  trackStateChange("active_note_toggle", "activeNotes を更新", before, after);
  syncFormFromState();
  render();
}

async function clearAllActiveNotes() {
  if (state.activeNotes.length === 0) return;
  const before = snapshotState();
  state.activeNotes = [];
  const after = snapshotState();
  trackStateChange("clear_active_notes", "activeNotes 一括削除", before, after);
  render();
  await syncAudioToActiveNotes();
}

async function addPitchPresetToActiveNotes(presetId) {
  const preset = findPitchPresetById(presetId);
  if (!preset) return;
  const noteId = buildNoteId(state.pitchDraft.octave, preset.microStep);
  if (findActiveNoteIndex(noteId) >= 0) return;

  const before = snapshotState();
  state.activeNotes.push({
    id: noteId,
    octave: state.pitchDraft.octave,
    microStepInOctave: preset.microStep,
    cent: Number(microStepToCent(preset.microStep))
  });
  syncDraftFromCent(microStepToCent(preset.microStep), state.pitchDraft.octave);
  const after = snapshotState();
  trackStateChange("add_pitch_preset_note", "音高プリセットから追加", before, after);
  syncFormFromState();
  render();
  await syncAudioToActiveNotes();
}

function buildPresetMainCell(name, id, subtitle = "") {
  const wrap = document.createElement("div");
  wrap.className = "preset-main";

  const title = document.createElement("div");
  title.className = "preset-name";
  title.textContent = name;
  wrap.appendChild(title);

  const presetId = document.createElement("div");
  presetId.className = "preset-id";
  presetId.textContent = id;
  wrap.appendChild(presetId);

  if (subtitle) {
    const sub = document.createElement("div");
    sub.className = "preset-sub";
    sub.textContent = subtitle;
    wrap.appendChild(sub);
  }

  return wrap;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function buildInlineInput(value, field) {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "preset-inline-input";
  input.dataset.field = field;
  input.value = value ?? "";
  return input;
}

function buildInlineTextarea(value, field) {
  const textarea = document.createElement("textarea");
  textarea.className = "preset-inline-textarea";
  textarea.dataset.field = field;
  textarea.value = value ?? "";
  return textarea;
}

function populateComposerRootPresetSelect(select, selectedId = "") {
  select.innerHTML = "";
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "基音プリセット";
  select.appendChild(empty);

  if (presets.length === 0) {
    const emptyRow = document.createElement("tr");
    emptyRow.innerHTML = `<td colspan="5" class="composer-note">条件に合う音高プリセットがありません。</td>`;
    tbody.appendChild(emptyRow);
  }

  presets.forEach((preset) => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = formatPresetDisplayName(preset);
    select.appendChild(option);
  });

  select.value = state.pitchPresets.some((preset) => preset.id === selectedId) ? selectedId : "";
}

function renderPresetTableEmpty(container, message) {
  container.innerHTML = "";
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.textContent = message;
  container.appendChild(empty);
}

function tagColorFromText(text) {
  let hash = 0;
  for (const ch of String(text || "")) {
    hash = ((hash * 31) + ch.charCodeAt(0)) >>> 0;
  }
  const hue = hash % 360;
  return `hsla(${hue} 70% 60% / 0.22)`;
}

function buildTagChips(tags) {
  const wrap = document.createElement("div");
  wrap.className = "tag-chip-list";
  (tags || []).forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = "tag-chip";
    chip.textContent = tag;
    chip.style.background = tagColorFromText(tag);
    chip.style.borderColor = tagColorFromText(`${tag}-border`).replace("/ 0.22", "/ 0.55");
    wrap.appendChild(chip);
  });
  return wrap;
}

function buildToneChips(tones) {
  const wrap = document.createElement("div");
  wrap.className = "tone-chip-list";
  (tones || []).forEach((tone, index) => {
    const chip = document.createElement("span");
    chip.className = "tone-chip";
    chip.textContent = formatChordToneToken(tone, index);
    wrap.appendChild(chip);
  });
  return wrap;
}

function resolvePitchPresetToken(token) {
  const normalized = slugifyIdPart(token);
  return state.pitchPresets.find((preset) =>
    preset.id === normalized ||
    preset.id === token ||
    preset.name === token ||
    preset.shortName === token ||
    formatPresetDisplayName(preset) === token
  ) || null;
}

function formatChordToneToken(tone, index = 0) {
  const labelPrefix = tone.label ? `${tone.label}:` : "";
  let pitchToken = "";
  if (tone.pitchPresetId) {
    const preset = findPitchPresetById(tone.pitchPresetId);
    pitchToken = preset ? formatPresetDisplayName(preset) : tone.pitchPresetId;
  } else {
    pitchToken = `${formatDecimal(Number(tone.localCent) || 0)}c`;
  }
  const octaveToken = tone.octaveShift ? `@${tone.octaveShift}` : "";
  return `${labelPrefix}${pitchToken}${octaveToken}` || `Tone${index + 1}`;
}

function serializeChordTones(tones) {
  return (tones || []).map((tone, index) => {
    const labelPrefix = tone.label ? `${tone.label}:` : "";
    const pitchToken = tone.pitchPresetId
      ? tone.pitchPresetId
      : `${formatDecimal(Number(tone.localCent) || 0)}c`;
    const octaveToken = tone.octaveShift ? `@${tone.octaveShift}` : "";
    return `${labelPrefix}${pitchToken}${octaveToken}`;
  }).join(", ");
}

function parseChordTonesInput(value) {
  const tokens = String(value || "")
    .split(/[\n,]/)
    .map((token) => token.trim())
    .filter(Boolean);

  return tokens.map((token, index) => {
    const separatorIndex = token.indexOf(":");
    const rawLabel = separatorIndex >= 0 ? token.slice(0, separatorIndex).trim() : "";
    let pitchSpec = separatorIndex >= 0 ? token.slice(separatorIndex + 1).trim() : token;
    let octaveShift = 0;

    const octaveSeparator = pitchSpec.lastIndexOf("@");
    if (octaveSeparator >= 0) {
      const parsedShift = Number(pitchSpec.slice(octaveSeparator + 1).trim());
      if (Number.isFinite(parsedShift)) {
        octaveShift = parsedShift;
        pitchSpec = pitchSpec.slice(0, octaveSeparator).trim();
      }
    }

    if (/c$/i.test(pitchSpec)) {
      const centValue = Number(pitchSpec.slice(0, -1).trim().replace(",", "."));
      if (!Number.isFinite(centValue)) return null;
      return {
        pitchPresetId: null,
        localAnonymousId: `anon:edit:${String(index + 1).padStart(4, "0")}`,
        localCent: centValue,
        octaveShift,
        label: rawLabel || `Tone${index + 1}`
      };
    }

    const preset = resolvePitchPresetToken(pitchSpec);
    if (!preset) return null;
    return {
      pitchPresetId: preset.id,
      localAnonymousId: null,
      localCent: null,
      octaveShift,
      label: rawLabel || `Tone${index + 1}`
    };
  }).filter(Boolean);
}

function renderPitchPresets() {
  const container = els.pitchPresetList;
  container.innerHTML = "";
  const presets = filteredPitchPresets(els.pitchPresetFilterInput?.value);
  if (state.pitchPresets.length === 0) {
    renderPresetTableEmpty(container, "まだ音高プリセットはありません。");
    return;
  }

  const table = document.createElement("table");
  table.className = "preset-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>音高</th>
        <th>cent</th>
        <th>短名</th>
        <th>タグ</th>
        <th>メモ</th>
      </tr>
    </thead>
  `;
  table.prepend(buildPresetColGroup(["name", "cent", "short", "tags", "memo"]));
  const tbody = document.createElement("tbody");

  if (presets.length === 0) {
    const emptyRow = document.createElement("tr");
    emptyRow.innerHTML = `<td colspan="5" class="composer-note">条件に合う音高プリセットがありません。</td>`;
    tbody.appendChild(emptyRow);
  }

  presets.forEach((preset) => {
    const row = document.createElement("tr");
    row.dataset.pitchPresetId = preset.id;
    const isEditing = presetUi.editingPitchPresetId === preset.id;
    row.title = isEditing ? "" : "クリックで追加 / ダブルクリックで編集";
    if (!isEditing && state.activeNotes.some((note) => note.octave === state.pitchDraft.octave && note.microStepInOctave === preset.microStep)) {
      row.classList.add("is-active");
    }

    if (isEditing) {
      const nameCell = document.createElement("td");
      const wrap = document.createElement("div");
      wrap.className = "preset-main";
      wrap.append(
        buildInlineInput(preset.id, "id"),
        buildInlineInput(preset.name, "name")
      );
      nameCell.appendChild(wrap);
      row.appendChild(nameCell);

      const centCell = document.createElement("td");
      const centInput = buildInlineInput(formatDecimal(preset.cent), "cent");
      centInput.type = "number";
      centInput.step = String(state.settings.snapCent || 1);
      centCell.appendChild(centInput);
      row.appendChild(centCell);

      const shortCell = document.createElement("td");
      shortCell.appendChild(buildInlineInput(preset.shortName || "", "shortName"));
      row.appendChild(shortCell);

      const tagsCell = document.createElement("td");
      tagsCell.appendChild(buildInlineInput((preset.tags || []).join(", "), "tags"));
      row.appendChild(tagsCell);

      const memoCell = document.createElement("td");
      const memoWrap = document.createElement("div");
      memoWrap.className = "preset-main";
      memoWrap.appendChild(buildInlineTextarea(preset.memo || "", "memo"));
      const actions = document.createElement("div");
      actions.className = "preset-inline-actions";
      actions.innerHTML = `<button type="button" data-action="save-pitch-inline" data-preset-id="${preset.id}">保存</button><button type="button" data-action="cancel-pitch-inline">取消</button>`;
      memoWrap.appendChild(actions);
      memoCell.appendChild(memoWrap);
      row.appendChild(memoCell);
    } else {
      const nameCell = document.createElement("td");
      nameCell.appendChild(buildPresetMainCell(
        preset.name,
        String(preset.id || "").toLowerCase(),
        formatPresetDisplayName(preset) !== preset.name ? `表示 ${formatPresetDisplayName(preset)}` : ""
      ));
      row.appendChild(nameCell);

      const centCell = document.createElement("td");
      centCell.textContent = formatDecimal(preset.cent);
      row.appendChild(centCell);


      const shortCell = document.createElement("td");
      shortCell.textContent = preset.shortName || " ";
      row.appendChild(shortCell);

      const tagsCell = document.createElement("td");
      tagsCell.appendChild(buildTagChips(preset.tags));
      row.appendChild(tagsCell);

      const memoCell = document.createElement("td");
      memoCell.textContent = preset.memo || " ";
      row.appendChild(memoCell);
    }

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

function renderChordPresets() {
  const container = els.chordPresetList;
  container.innerHTML = "";
  const chords = filteredChordPresets(els.chordTagFilterInput?.value);

  const table = document.createElement("table");
  table.className = "preset-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th>コード</th>
        <th>基音</th>
        <th>構成音</th>
        <th>タグ</th>
        <th>メモ</th>
      </tr>
    </thead>
  `;
  const tbody = document.createElement("tbody");

  const composerRow = document.createElement("tr");
  composerRow.className = "composer-row";
  composerRow.dataset.composerRow = "true";

  const composerCodeCell = document.createElement("td");
  composerCodeCell.innerHTML = `
    <div class="composer-stack">
      <input type="text" class="preset-inline-input" data-composer-field="id" placeholder="コードID" value="${escapeHtml(els.chordIdInput.value)}">
      <input type="text" class="preset-inline-input" data-composer-field="name" placeholder="コード名" value="${escapeHtml(els.chordNameInput.value)}">
    </div>
  `;
  composerRow.appendChild(composerCodeCell);

  const composerRootCell = document.createElement("td");
  const composerRootWrap = document.createElement("div");
  composerRootWrap.className = "composer-stack";
  const rootInput = document.createElement("input");
  rootInput.type = "text";
  rootInput.className = "preset-inline-input";
  rootInput.dataset.composerField = "rootText";
  rootInput.placeholder = "C3 / D#4";
  rootInput.value = els.recallRootTextInput.value;
  composerRootWrap.appendChild(rootInput);
  const rootSelect = document.createElement("select");
  rootSelect.className = "preset-inline-select";
  rootSelect.dataset.composerField = "rootPreset";
  populateComposerRootPresetSelect(rootSelect, els.recallRootPresetSelect.value);
  composerRootWrap.appendChild(rootSelect);
  composerRootCell.appendChild(composerRootWrap);
  composerRow.appendChild(composerRootCell);

  const composerTonesCell = document.createElement("td");
  const composerToneWrap = document.createElement("div");
  composerToneWrap.className = "composer-stack";
  const composerToneNote = document.createElement("div");
  composerToneNote.className = "composer-note";
  composerToneNote.textContent = state.activeNotes.length === 0
    ? "activeNotes をコード化します"
    : state.activeNotes
      .slice()
      .sort((a, b) => absoluteMicroStep(a) - absoluteMicroStep(b))
      .map((note) => formatPresetDisplayName(findPitchPresetByMicroStep(note.microStepInOctave)) || formatDecimal(note.cent))
      .join(" / ");
  composerToneWrap.appendChild(composerToneNote);
  const labelsInput = document.createElement("input");
  labelsInput.type = "text";
  labelsInput.className = "preset-inline-input";
  labelsInput.dataset.composerField = "labels";
  labelsInput.placeholder = "Root, M3, P5";
  labelsInput.value = els.chordLabelsInput.value;
  composerToneWrap.appendChild(labelsInput);
  composerTonesCell.appendChild(composerToneWrap);
  composerRow.appendChild(composerTonesCell);

  const composerTagsCell = document.createElement("td");
  composerTagsCell.innerHTML = `<input type="text" class="preset-inline-input" data-composer-field="tags" placeholder="bright, core" value="${escapeHtml(els.chordTagsInput.value)}">`;
  composerRow.appendChild(composerTagsCell);

  const composerMemoCell = document.createElement("td");
  composerMemoCell.innerHTML = `
    <div class="composer-stack">
      <textarea class="preset-inline-textarea" data-composer-field="memo" placeholder="メモ">${escapeHtml(els.chordMemoInput.value)}</textarea>
      <div class="preset-inline-actions">
        <button type="button" data-action="save-chord-compose">activeNotes から保存</button>
      </div>
    </div>
  `;
  composerRow.appendChild(composerMemoCell);
  tbody.appendChild(composerRow);

  if (chords.length === 0) {
    const emptyRow = document.createElement("tr");
    emptyRow.className = "composer-row";
    emptyRow.innerHTML = `<td colspan="5" class="composer-note">${state.chordPresets.length === 0 ? "まだコードはありません。" : "条件に合うコードがありません。"}</td>`;
    tbody.appendChild(emptyRow);
    table.appendChild(tbody);
    container.appendChild(table);
    return;
  }

  chords.forEach((chord) => {
    const row = document.createElement("tr");
    row.dataset.chordPresetId = chord.id;
    const isEditing = presetUi.editingChordPresetId === chord.id;
    row.title = isEditing ? "" : "クリックで展開 / ダブルクリックで編集";
    const tonesText = serializeChordTones(chord.tones);
    const rootLabel =
      els.recallRootTextInput.value.trim() ||
      formatPresetDisplayName(findPitchPresetById(els.recallRootPresetSelect.value)) ||
      "未指定";

    if (isEditing) {
      const nameCell = document.createElement("td");
      const wrap = document.createElement("div");
      wrap.className = "preset-main";
      wrap.append(
        buildInlineInput(chord.id, "id"),
        buildInlineInput(chord.name, "name")
      );
      nameCell.appendChild(wrap);
      row.appendChild(nameCell);

      const rootCell = document.createElement("td");
      rootCell.textContent = rootLabel;
      row.appendChild(rootCell);

      const tonesCell = document.createElement("td");
      tonesCell.appendChild(buildInlineInput(tonesText, "tones"));
      row.appendChild(tonesCell);

      const tagsCell = document.createElement("td");
      tagsCell.appendChild(buildInlineInput((chord.tags || []).join(", "), "tags"));
      row.appendChild(tagsCell);

      const memoCell = document.createElement("td");
      const memoWrap = document.createElement("div");
      memoWrap.className = "preset-main";
      memoWrap.appendChild(buildInlineTextarea(chord.memo || "", "memo"));
      const actions = document.createElement("div");
      actions.className = "preset-inline-actions";
      actions.innerHTML = `<button type="button" data-action="save-chord-inline" data-chord-id="${chord.id}">保存</button><button type="button" data-action="cancel-chord-inline">取消</button>`;
      memoWrap.appendChild(actions);
      memoCell.appendChild(memoWrap);
      row.appendChild(memoCell);
    } else {
      const nameCell = document.createElement("td");
      nameCell.appendChild(buildPresetMainCell(chord.name, String(chord.id || "").toLowerCase()));
      row.appendChild(nameCell);

      const rootCell = document.createElement("td");
      rootCell.textContent = rootLabel;
      row.appendChild(rootCell);

      const tonesCell = document.createElement("td");
      tonesCell.appendChild(buildToneChips(chord.tones));
      row.appendChild(tonesCell);

      const tagsCell = document.createElement("td");
      tagsCell.appendChild(buildTagChips(chord.tags));
      row.appendChild(tagsCell);

      const memoCell = document.createElement("td");
      memoCell.textContent = chord.memo || " ";
      row.appendChild(memoCell);
    }

    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

function editPitchPreset(presetId) {
  presetUi.editingPitchPresetId = presetId;
  presetUi.editingChordPresetId = null;
  render();
}

function editChordPreset(chordId) {
  presetUi.editingChordPresetId = chordId;
  presetUi.editingPitchPresetId = null;
  render();
}

function saveInlinePitchPreset(presetId, row) {
  const preset = findPitchPresetById(presetId);
  if (!preset || !(row instanceof HTMLElement)) return;
  const nextId = slugifyIdPart(row.querySelector('[data-field="id"]')?.value || "") || preset.id;
  const nextName = String(row.querySelector('[data-field="name"]')?.value || "").trim() || preset.name;
  const nextCent = Number(String(row.querySelector('[data-field="cent"]')?.value || "").replace(",", "."));
  const nextShort = String(row.querySelector('[data-field="shortName"]')?.value || "").trim();
  const nextTags = parseCsvList(row.querySelector('[data-field="tags"]')?.value || "");
  const nextMemo = String(row.querySelector('[data-field="memo"]')?.value || "").trim();

  if (nextId !== preset.id && state.pitchPresets.some((item) => item.id === nextId)) {
    setStatus(els.pitchPresetStatus, `ID ${nextId} は既に使われています。`, "error");
    return;
  }

  const before = snapshotState();
  if (Number.isFinite(nextCent)) {
    preset.cent = Number(microStepToCent(centToMicroStep(nextCent)));
    preset.microStep = centToMicroStep(nextCent);
  }
  preset.id = nextId;
  preset.name = nextName;
  preset.shortName = nextShort;
  preset.tags = nextTags;
  preset.memo = nextMemo;
  presetUi.editingPitchPresetId = null;
  const after = snapshotState();
  trackStateChange("edit_pitch_preset", "音高プリセット編集", before, after);
  setStatus(els.pitchPresetStatus, `${preset.name} を更新しました。`, "success");
  render();
}

function saveInlineChordPreset(chordId, row) {
  const chord = state.chordPresets.find((item) => item.id === chordId);
  if (!chord || !(row instanceof HTMLElement)) return;
  const nextId = slugifyIdPart(row.querySelector('[data-field="id"]')?.value || "") || chord.id;
  const nextName = String(row.querySelector('[data-field="name"]')?.value || "").trim() || chord.name;
  const nextTones = parseChordTonesInput(row.querySelector('[data-field="tones"]')?.value || "");
  const nextTags = parseCsvList(row.querySelector('[data-field="tags"]')?.value || "");
  const nextMemo = String(row.querySelector('[data-field="memo"]')?.value || "").trim();

  if (nextId !== chord.id && state.chordPresets.some((item) => item.id === nextId)) {
    setStatus(els.chordStatus, `ID ${nextId} は既に使われています。`, "error");
    return;
  }
  if (nextTones.length === 0) {
    setStatus(els.chordStatus, "構成音は `P5` や `M3:PITCH_M3`、`M4:550c` のように入力してください。", "error");
    return;
  }

  const before = snapshotState();
  chord.id = nextId;
  chord.name = nextName;
  chord.tones = nextTones;
  chord.tags = nextTags;
  chord.memo = nextMemo;
  presetUi.editingChordPresetId = null;
  const after = snapshotState();
  trackStateChange("edit_chord_preset", "コード編集", before, after);
  setStatus(els.chordStatus, `${chord.name} を更新しました。`, "success");
  render();
}

function updateActiveNoteFromRow(noteId) {
  const row = els.activeNotesList.querySelector(`[data-note-id="${noteId}"]`);
  const note = state.activeNotes.find((item) => item.id === noteId);
  if (!(row instanceof HTMLElement) || !note) return;

  const before = snapshotState();
  const centValue = Number(String(row.querySelector('[data-field="cent"]')?.value || "").replace(",", "."));
  if (Number.isFinite(centValue)) {
    const normalized = normalizePitch(note.octave, centToMicroStep(centValue));
    note.octave = normalized.octave;
    note.microStepInOctave = normalized.microStepInOctave;
    note.cent = Number(microStepToCent(normalized.microStepInOctave));
    note.id = buildNoteId(note.octave, note.microStepInOctave);
  }

  const after = snapshotState();
  trackStateChange("update_active_note", "activeNotes 行編集", before, after);
  syncFormFromState();
  render();
  void syncAudioToActiveNotes();
}

function attachEvents() {
  els.navButtons.forEach((btn) => {
    btn.addEventListener("click", () => setView(btn.dataset.view));
  });

  els.undoBtn.addEventListener("click", () => {
    history.undo(applySnapshot);
    render();
    updateHistoryButtons();
  });

  els.redoBtn.addEventListener("click", () => {
    history.redo(applySnapshot);
    render();
    updateHistoryButtons();
  });

  els.installPwaBtn?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => null);
    deferredInstallPrompt = null;
    renderPwaPrompt();
  });
  els.runtimeWarningCloseBtn?.addEventListener("click", () => {
    state.settings.dismissedRuntimeNotice = true;
    renderRuntimeBanner();
    renderRuntimeInfo();
  });
  els.pwaPromptCloseBtn?.addEventListener("click", () => {
    state.settings.dismissedPwaNotice = true;
    renderPwaPrompt();
    renderRuntimeInfo();
  });

  document.addEventListener("keydown", (ev) => {
    const meta = ev.ctrlKey || ev.metaKey;
    if (!meta) return;
    if (ev.key.toLowerCase() === "z" && !ev.shiftKey) {
      ev.preventDefault();
      history.undo(applySnapshot);
      render();
      updateHistoryButtons();
      return;
    }
    if ((ev.key.toLowerCase() === "z" && ev.shiftKey) || ev.key.toLowerCase() === "y") {
      ev.preventDefault();
      history.redo(applySnapshot);
      render();
      updateHistoryButtons();
    }
  });

  els.octaveInput.addEventListener("change", () => {
    const before = snapshotState();
    syncDraftFromCent(state.pitchDraft.cent, Number(els.octaveInput.value));
    const after = snapshotState();
    trackStateChange("update_octave", "オクターブ変更", before, after);
    syncFormFromState();
    render();
  });

  els.snapCentInput.addEventListener("change", () => {
    const before = snapshotState();
    state.settings.snapCent = clamp(Number(els.snapCentInput.value) || 0, 0, 600);
    syncDraftFromCent(Number(els.centInput.value), state.pitchDraft.octave);
    const after = snapshotState();
    trackStateChange("update_snap", "スナップ変更", before, after);
    syncFormFromState();
    render();
  });

  const centCommit = () => {
    const before = snapshotState();
    const parsedCent = Number(String(els.centInput.value).replace(",", "."));
    syncDraftFromCent(Number.isFinite(parsedCent) ? parsedCent : state.pitchDraft.cent, state.pitchDraft.octave);
    const after = snapshotState();
    trackStateChange("update_cent", "cent入力変更", before, after);
    syncFormFromState();
    render();
  };
  els.centInput.addEventListener("change", centCommit);

  els.centDownBtn.addEventListener("click", () => {
    els.centInput.value = String((Number(els.centInput.value) || 0) - state.settings.snapCent);
    centCommit();
  });

  els.centUpBtn.addEventListener("click", () => {
    els.centInput.value = String((Number(els.centInput.value) || 0) + state.settings.snapCent);
    centCommit();
  });

  els.sustainModeInput.addEventListener("change", () => {
    const before = snapshotState();
    state.settings.playMode = els.sustainModeInput.checked ? "toggle" : "momentary";
    audio.stopVoice(MOMENTARY_VOICE_ID);
    audio.stopVoice(DRAG_PREVIEW_VOICE_ID);
    const after = snapshotState();
    trackStateChange("update_mode", "再生モード変更", before, after);
    render();
  });

  els.waveformSelect.addEventListener("change", () => {
    const before = snapshotState();
    state.settings.waveform = els.waveformSelect.value;
    const after = snapshotState();
    trackStateChange("update_waveform", "波形変更", before, after);
    void syncAudioToActiveNotes();
  });

  els.masterVolumeInput.addEventListener("input", () => {
    const before = snapshotState();
    state.settings.masterVolume = Number(els.masterVolumeInput.value);
    audio.setMasterVolume(state.settings.masterVolume);
    const after = snapshotState();
    trackStateChange("update_master_gain", "Master音量変更", before, after);
  });

  els.activeNotesVolumeInput.addEventListener("input", () => {
    const before = snapshotState();
    state.settings.activeNotesVolume = Number(els.activeNotesVolumeInput.value);
    const after = snapshotState();
    trackStateChange("update_active_gain", "activeNotes音量変更", before, after);
    applyActiveNoteGain();
  });

  els.a4HzInput.addEventListener("change", () => {
    const before = snapshotState();
    state.settings.a4Hz = Number(els.a4HzInput.value);
    const after = snapshotState();
    trackStateChange("update_a4", "A4周波数変更", before, after);
    void syncAudioToActiveNotes();
  });

  els.bpmInput.addEventListener("change", () => {
    const before = snapshotState();
    state.settings.bpm = clamp(Number(els.bpmInput.value) || 130, 5, 300);
    const after = snapshotState();
    trackStateChange("update_bpm", "BPM変更", before, after);
    syncFormFromState();
  });

  els.roundUnitInput.addEventListener("change", () => {
    const before = snapshotState();
    state.settings.roundUnitCent = Math.max(0, Number(els.roundUnitInput.value) || 0);
    const after = snapshotState();
    trackStateChange("update_round_unit", "丸め単位変更", before, after);
    syncFormFromState();
  });

  els.roundingModeSelect.addEventListener("change", () => {
    const before = snapshotState();
    state.settings.roundingMode = els.roundingModeSelect.value;
    const after = snapshotState();
    trackStateChange("update_round_mode", "丸めモード変更", before, after);
  });

  els.savePitchPresetBtn.addEventListener("click", saveCurrentPitchPreset);
  els.saveChordBtn.addEventListener("click", saveChordFromActiveNotes);
  els.loadChordBtn.addEventListener("click", () => {
    void loadChordIntoActiveNotes();
  });
  els.recallChordSelect.addEventListener("change", renderRecallSummary);
  els.clearActiveNotesBtn.addEventListener("click", () => {
    void clearAllActiveNotes();
  });
  els.recallRootModeSelect.addEventListener("change", renderRecallSummary);
  els.recallRootTextInput.addEventListener("input", () => {
    renderRecallSummary();
    renderChordPresets();
  });
  els.recallRootPresetSelect.addEventListener("change", () => {
    renderRecallSummary();
    renderChordPresets();
  });
  els.addProgPartBtn.addEventListener("click", addProgressionPart);
  els.deleteProgPartBtn.addEventListener("click", deleteSelectedProgressionPart);
  els.progPrevBtn.addEventListener("click", () => stepSelectedProgressionPart(-1));
  els.progNextBtn.addEventListener("click", () => stepSelectedProgressionPart(1));
  els.progMenuToggleBtn.addEventListener("click", () => {
    progressionUi.isMenuOpen = !progressionUi.isMenuOpen;
    syncProgressionLayoutState();
  });
  els.progEditorToggleBtn.addEventListener("click", () => {
    progressionUi.isEditorExpanded = !progressionUi.isEditorExpanded;
    syncProgressionLayoutState();
  });
  els.playProgBtn.addEventListener("click", () => {
    if (state.progression.parts.length === 0) {
      setStatus(els.progStatus, "再生するセルがありません。", "error");
      return;
    }
    const startIndex = Math.max(
      0,
      state.progression.parts.findIndex((part) => part.id === state.progression.selectedPartId)
    );
    void playProgressionPart(state.progression.parts[startIndex] || state.progression.parts[0], startIndex >= 0 ? startIndex : 0);
    setStatus(els.progStatus, "進行再生を開始しました。", "success");
  });
  els.stopProgBtn.addEventListener("click", () => {
    stopProgressionPlayback();
    setStatus(els.progStatus, "進行再生を停止しました。", "success");
  });
  els.progRootNoteInput.addEventListener("change", () => {
    const parsed = resolveProgressionRootInput();
    if (!parsed) {
      setStatus(els.progStatus, "ルートは D#3 のように入力してください。", "error");
      const parts = rootEditorParts();
      els.progRootNoteInput.value = `${parts.letter}${parts.accidental}`;
      if (els.progRootOctaveInput) els.progRootOctaveInput.value = parts.octave;
      return;
    }
    state.progressionEditor.rootNoteText = parsed.noteText;
    setStatus(els.progStatus, "", "");
    syncProgressionSelectionFromEditor("進行セルのルート変更", true);
  });
  els.progRootOctaveInput?.addEventListener("change", () => {
    const parsed = resolveProgressionRootInput();
    if (!parsed) return;
    state.progressionEditor.rootNoteText = parsed.noteText;
    syncProgressionSelectionFromEditor("騾ｲ陦後そ繝ｫ縺ｮ繧ｪ繧ｯ繧ｿ繝ｼ繝門､画峩", true);
  });
  els.progFlatBtn.addEventListener("click", () => {
    const parts = rootEditorParts();
    setProgressionEditorRoot({ ...parts, accidental: "b" });
  });
  els.progNaturalBtn.addEventListener("click", () => {
    const parts = rootEditorParts();
    setProgressionEditorRoot({ ...parts, accidental: "" });
  });
  els.progSharpBtn.addEventListener("click", () => {
    const parts = rootEditorParts();
    setProgressionEditorRoot({ ...parts, accidental: "#" });
  });
  els.progRootLetterButtons.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const note = target.dataset.note;
    if (!note) return;
    const parts = rootEditorParts();
    setProgressionEditorRoot({ ...parts, letter: note });
  });
  els.progOctaveButtons.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const octave = target.dataset.octave;
    if (!octave) return;
    const parts = rootEditorParts();
    setProgressionEditorRoot({ ...parts, octave });
  });
  els.progChordButtonGrid.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const chordId = target.dataset.chordId;
    if (!chordId) return;
    state.progressionEditor.chordId = chordId;
    syncProgressionSelectionFromEditor("進行セルのコード変更", true);
  });
  els.progBeatsButtonGrid.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const beats = Number(target.dataset.beats);
    if (!beats) return;
    state.progressionEditor.beats = beats;
    syncProgressionSelectionFromEditor("進行セルの拍変更", false);
  });
  els.chordTagFilterInput.addEventListener("input", render);
  els.activeNotesFilterInput?.addEventListener("input", render);
  els.pitchPresetFilterInput?.addEventListener("input", render);
  els.progChordTagFilterInput.addEventListener("input", render);
  els.progColumnsSelect.addEventListener("change", () => {
    const before = snapshotState();
    state.progression.columns = clamp(Number(els.progColumnsSelect.value) || 4, 2, 8);
    const after = snapshotState();
    trackStateChange("update_progression_columns", "進行列数変更", before, after);
    render();
  });
  els.progLoopInput.addEventListener("change", () => {
    const before = snapshotState();
    state.progression.loop = els.progLoopInput.checked;
    const after = snapshotState();
    trackStateChange("update_progression_loop", "進行ループ変更", before, after);
    render();
  });

  const bindWidthInput = (input, key, min, max, fallback) => {
    input?.addEventListener("input", () => {
      state.settings.tableColumnWidths[key] = clamp(Number(input.value) || fallback, min, max);
      applyLayoutSettings();
    });
  };
  bindWidthInput(els.presetNameWidthInput, "name", 8, 30, 14);
  bindWidthInput(els.presetCentWidthInput, "cent", 4, 14, 7);
  bindWidthInput(els.presetShortWidthInput, "short", 4, 16, 7);
  bindWidthInput(els.presetTagWidthInput, "tags", 6, 24, 10);
  bindWidthInput(els.presetMemoWidthInput, "memo", 8, 28, 12);
  els.progressionCellWidthInput?.addEventListener("input", () => {
    state.settings.progressionCellWidth = clamp(Number(els.progressionCellWidthInput.value) || 192, 140, 320);
    applyLayoutSettings();
  });
  els.activeNotesList.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLButtonElement)) return;
    if (target.dataset.action === "update-active-note") {
      const noteId = target.dataset.noteId;
      if (!noteId) return;
      updateActiveNoteFromRow(noteId);
      return;
    }
    if (target.dataset.action === "save-pitch-preset") {
      const noteId = target.dataset.noteId;
      if (!noteId) return;
      savePitchPresetFromActiveNote(noteId);
      return;
    }
    const noteId = target.dataset.noteId;
    if (!noteId) return;
    removeActiveNote(noteId);
  });
  els.pitchPresetList.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest('[data-action="save-pitch-inline"]')) {
      const button = target.closest('[data-action="save-pitch-inline"]');
      const row = target.closest("[data-pitch-preset-id]");
      if (!(button instanceof HTMLElement) || !(row instanceof HTMLElement)) return;
      const presetId = button.dataset.presetId;
      if (!presetId) return;
      saveInlinePitchPreset(presetId, row);
      return;
    }
    if (target.closest('[data-action="cancel-pitch-inline"]')) {
      presetUi.editingPitchPresetId = null;
      render();
      return;
    }
    if (target.closest("input, textarea, button")) return;
    const row = target.closest("[data-pitch-preset-id]");
    if (!(row instanceof HTMLElement)) return;
    const presetId = row.dataset.pitchPresetId;
    if (!presetId) return;
    if (presetUi.pitchPresetClickTimerId) {
      clearTimeout(presetUi.pitchPresetClickTimerId);
    }
    presetUi.pitchPresetClickTimerId = setTimeout(() => {
      presetUi.pitchPresetClickTimerId = null;
      void addPitchPresetToActiveNotes(presetId);
    }, 220);
  });
  els.pitchPresetList.addEventListener("dblclick", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    if (presetUi.pitchPresetClickTimerId) {
      clearTimeout(presetUi.pitchPresetClickTimerId);
      presetUi.pitchPresetClickTimerId = null;
    }
    const row = target.closest("[data-pitch-preset-id]");
    if (!(row instanceof HTMLElement)) return;
    const presetId = row.dataset.pitchPresetId;
    if (!presetId) return;
    editPitchPreset(presetId);
  });
  els.chordPresetList.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest('[data-action="save-chord-compose"]')) {
      const row = target.closest('[data-composer-row="true"]');
      if (!(row instanceof HTMLElement)) return;
      syncChordComposerInputsFromRow(row);
      saveChordFromActiveNotes();
      return;
    }
    if (target.closest('[data-action="save-chord-inline"]')) {
      const button = target.closest('[data-action="save-chord-inline"]');
      const row = target.closest("[data-chord-preset-id]");
      if (!(button instanceof HTMLElement) || !(row instanceof HTMLElement)) return;
      const chordId = button.dataset.chordId;
      if (!chordId) return;
      saveInlineChordPreset(chordId, row);
      return;
    }
    if (target.closest('[data-action="cancel-chord-inline"]')) {
      presetUi.editingChordPresetId = null;
      render();
      return;
    }
    if (target.closest("input, textarea, button")) return;
    const row = target.closest("[data-chord-preset-id]");
    if (!(row instanceof HTMLElement)) return;
    const chordId = row.dataset.chordPresetId;
    if (!chordId) return;
    if (presetUi.chordPresetClickTimerId) {
      clearTimeout(presetUi.chordPresetClickTimerId);
    }
    presetUi.chordPresetClickTimerId = setTimeout(() => {
      presetUi.chordPresetClickTimerId = null;
      els.recallChordSelect.value = chordId;
      renderRecallSummary();
      void loadChordIntoActiveNotes(chordId);
    }, 220);
  });
  els.chordPresetList.addEventListener("input", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    const row = target.closest('[data-composer-row="true"]');
    if (!(row instanceof HTMLElement)) return;
    syncChordComposerInputsFromRow(row);
    renderRecallSummary();
  });
  els.chordPresetList.addEventListener("change", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    const row = target.closest('[data-composer-row="true"]');
    if (!(row instanceof HTMLElement)) return;
    syncChordComposerInputsFromRow(row);
    renderRecallSummary();
  });
  els.chordPresetList.addEventListener("dblclick", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    if (presetUi.chordPresetClickTimerId) {
      clearTimeout(presetUi.chordPresetClickTimerId);
      presetUi.chordPresetClickTimerId = null;
    }
    if (target.closest('[data-action="save-chord-inline"]')) return;
    const row = target.closest("[data-chord-preset-id]");
    if (!(row instanceof HTMLElement)) return;
    const chordId = row.dataset.chordPresetId;
    if (!chordId) return;
    editChordPreset(chordId);
  });
  els.progressionGrid.addEventListener("click", (ev) => {
    if (progressionUi.suppressClick) return;
    const target = ev.target;
    if (!(target instanceof HTMLElement)) {
      if (progressionUi.draggingPartId) cancelProgressionReorder();
      return;
    }
    const cell = target.closest(".progression-cell");
    if (!(cell instanceof HTMLButtonElement)) {
      if (progressionUi.draggingPartId) cancelProgressionReorder();
      return;
    }
    const partId = cell.dataset.partId;
    if (!partId) return;
    if (progressionUi.draggingPartId) {
      const placement = getProgressionDropPlacement(cell, ev.clientX, ev.clientY);
      commitProgressionReorder(progressionUi.draggingPartId, partId, placement);
      suppressNextProgressionGridClick();
      return;
    }
    selectProgressionPart(partId);
  });
  els.progressionGrid.addEventListener("dragstart", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    const cell = target.closest(".progression-cell");
    if (!(cell instanceof HTMLButtonElement)) return;
    const partId = cell.dataset.partId;
    if (!partId) return;
    progressionUi.draggingPartId = partId;
    progressionUi.dragOverPartId = null;
    progressionUi.dragPlacement = "after";
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = "move";
      ev.dataTransfer.setData("text/plain", partId);
    }
    paintProgressionGridReorderState();
  });
  els.progressionGrid.addEventListener("dragover", (ev) => {
    if (!progressionUi.draggingPartId) return;
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    const cell = target.closest(".progression-cell");
    if (!(cell instanceof HTMLButtonElement)) return;
    const partId = cell.dataset.partId;
    if (!partId || partId === progressionUi.draggingPartId) return;
    ev.preventDefault();
    progressionUi.dragOverPartId = partId;
    progressionUi.dragPlacement = getProgressionDropPlacement(cell, ev.clientX, ev.clientY);
    paintProgressionGridReorderState();
  });
  els.progressionGrid.addEventListener("drop", (ev) => {
    if (!progressionUi.draggingPartId) return;
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    const cell = target.closest(".progression-cell");
    if (!(cell instanceof HTMLButtonElement)) {
      cancelProgressionReorder();
      return;
    }
    const partId = cell.dataset.partId;
    if (!partId) {
      cancelProgressionReorder();
      return;
    }
    ev.preventDefault();
    const placement = getProgressionDropPlacement(cell, ev.clientX, ev.clientY);
    commitProgressionReorder(progressionUi.draggingPartId, partId, placement);
    suppressNextProgressionGridClick();
  });
  els.progressionGrid.addEventListener("dragend", () => {
    if (progressionUi.draggingPartId) {
      cancelProgressionReorder();
    }
  });
  els.progressionGrid.addEventListener("pointerdown", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    const cell = target.closest(".progression-cell");
    if (!(cell instanceof HTMLButtonElement)) return;
    const partId = cell.dataset.partId;
    if (!partId || ev.pointerType === "mouse") return;
    clearProgressionLongPressTimer();
    progressionUi.pendingPointerId = ev.pointerId;
    progressionUi.pendingPartId = partId;
    progressionUi.pointerStartX = ev.clientX;
    progressionUi.pointerStartY = ev.clientY;
    progressionUi.longPressTimerId = window.setTimeout(() => {
      beginProgressionReorder(partId);
      progressionUi.suppressClick = true;
      window.setTimeout(() => {
        progressionUi.suppressClick = false;
      }, 250);
    }, 380);
  });
  els.progressionGrid.addEventListener("pointermove", (ev) => {
    if (progressionUi.pendingPointerId !== ev.pointerId) return;
    const moved = Math.abs(ev.clientX - progressionUi.pointerStartX) + Math.abs(ev.clientY - progressionUi.pointerStartY);
    if (moved > 10) {
      clearProgressionLongPressTimer();
    }
  });
  const clearGridLongPress = (ev) => {
    if (progressionUi.pendingPointerId === ev.pointerId) {
      clearProgressionLongPressTimer();
    }
  };
  els.progressionGrid.addEventListener("pointerup", clearGridLongPress);
  els.progressionGrid.addEventListener("pointercancel", clearGridLongPress);

  const canvas = els.lineCanvas;
  canvas.addEventListener("pointerdown", async (ev) => {
    const x = canvasXFromPointerEvent(canvas, ev);
    dragContext = {
      before: snapshotState(),
      baseOctave: state.pitchDraft.octave,
      lastCanvasX: x,
      virtualX: x
    };
    canvas.setPointerCapture(ev.pointerId);
    await applyDragPitch(false);
  });

  canvas.addEventListener("pointermove", async (ev) => {
    if (!dragContext) return;
    const x = canvasXFromPointerEvent(canvas, ev);
    dragContext.virtualX += x - dragContext.lastCanvasX;
    dragContext.lastCanvasX = x;
    await applyDragPitch(false);
  });

  canvas.addEventListener("pointerup", async (ev) => {
    if (!dragContext) return;
    const x = canvasXFromPointerEvent(canvas, ev);
    dragContext.virtualX += x - dragContext.lastCanvasX;
    dragContext.lastCanvasX = x;
    await applyDragPitch(true);
    if (state.settings.playMode === "momentary") {
      audio.stopVoice(MOMENTARY_VOICE_ID);
      const after = snapshotState();
      trackStateChange("pitch_drag_commit", "数直線ドラッグ確定", dragContext.before, after);
    }
    dragContext = null;
    render();
  });

  canvas.addEventListener("pointercancel", () => {
    dragContext = null;
    audio.stopVoice(MOMENTARY_VOICE_ID);
    audio.stopVoice(DRAG_PREVIEW_VOICE_ID);
    render();
  });

  window.addEventListener("resize", syncProgressionLayoutState);

  els.exportBtn.addEventListener("click", exportProject);
  els.exportLibraryBtn.addEventListener("click", exportLibrary);
  els.importFileInput.addEventListener("change", async () => {
    const file = els.importFileInput.files?.[0];
    if (!file) return;
    await importDataFile(file);
    els.importFileInput.value = "";
  });
}

function classifyRuntime() {
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;

  if (protocol === "file:") {
    showRuntimeWarning(
      "このアプリは <code>file://</code> では動作保証しません。<br>" +
      "PC では <code>python -m http.server 5173</code> を実行し、<code>http://localhost:5173/</code> で開いてください。<br>" +
      "スマホ確認は LAN URL、PWA インストールは HTTPS 公開 URL を使ってください。"
    );
    clearRuntimeWarningTone();
    return { mode: "file", protocol, hostname, swAllowed: false };
  }

  if (protocol === "https:") {
    hideRuntimeWarning();
    clearRuntimeWarningTone();
    return { mode: "https", protocol, hostname, swAllowed: true };
  }

  if (protocol === "http:" && isLocalhostHost(hostname)) {
    hideRuntimeWarning();
    clearRuntimeWarningTone();
    return { mode: "localhost", protocol, hostname, swAllowed: true };
  }

  if (protocol === "http:" && isLanHost(hostname)) {
    showRuntimeNotice(
      "LAN 閲覧モードです。同一 Wi-Fi 上のスマホやタブレットからブラウザ確認できます。<br>" +
      "この URL では PWA インストールと Service Worker は使わず、実機確認用として扱います。<br>" +
      "ホーム画面追加やオフライン利用は HTTPS 公開 URL を使ってください。",
      "info"
    );
    return { mode: "lan", protocol, hostname, swAllowed: false };
  }

  if (protocol === "http:") {
    showRuntimeNotice(
      "HTTP URL で動作中です。PC では <code>localhost</code>、実機確認は LAN URL、PWA 利用は HTTPS 公開 URL を使ってください。",
      "info"
    );
    return { mode: "http", protocol, hostname, swAllowed: false };
  }

  showRuntimeWarning(
    "この環境では動作保証できません。<br>" +
    "PC では <code>http://localhost:5173/</code>、実機確認は LAN URL、PWA 利用は HTTPS 公開 URL を使ってください。"
  );
  clearRuntimeWarningTone();
  return { mode: "unknown", protocol, hostname, swAllowed: false };
}

function renderPwaPrompt() {
  if (!els.pwaPrompt || !els.pwaPromptMessage || !els.installPwaBtn || !runtimeState) return;

  let message = "";
  let showButton = false;

  if (runtimeState.mode === "lan") {
    message = "同一 Wi-Fi 上の端末からはこの URL をブラウザで開けます。ホーム画面追加やオフライン利用は HTTPS 公開 URL を使ってください。";
  } else if (runtimeState.mode === "localhost") {
    message = "PC 開発モードです。実機確認は LAN URL、PWA インストールは HTTPS 公開 URL で行ってください。";
  } else if (runtimeState.mode === "https") {
    if (isStandaloneDisplay()) {
      message = "PWA モードで起動中です。ホーム画面から通常アプリのように使えます。";
    } else if (deferredInstallPrompt) {
      message = "この HTTPS 公開 URL ではインストール可能です。「アプリを追加」から追加できます。";
      showButton = true;
    } else if (isIosLike()) {
      message = "iPhone / iPad では Safari の共有メニューから「ホーム画面に追加」でインストールしてください。";
    } else {
      message = "HTTPS 公開 URL で動作中です。対応ブラウザではメニューからアプリとして追加できます。";
    }
  }

  if (!message) {
    els.pwaPrompt.classList.add("hidden");
    els.pwaPromptMessage.textContent = "";
    els.installPwaBtn.hidden = true;
    renderRuntimeInfo();
    return;
  }

  els.pwaPromptMessage.textContent = message;
  els.installPwaBtn.hidden = !showButton;
  els.pwaPrompt.classList.toggle("hidden", state.settings.dismissedPwaNotice);
  renderRuntimeInfo();
}

async function resetDevelopmentCaches() {
  if (!("serviceWorker" in navigator)) return;
  const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
  await Promise.all(registrations.map((registration) => registration.unregister().catch(() => false)));
  if ("caches" in window) {
    const keys = await caches.keys().catch(() => []);
    await Promise.all(keys.map((key) => caches.delete(key).catch(() => false)));
  }
}

function syncFormFromState() {
  state.settings.tableColumnWidths = {
    name: 14,
    cent: 7,
    short: 7,
    tags: 10,
    memo: 12,
    ...(state.settings.tableColumnWidths || {})
  };
  state.settings.progressionCellWidth = Number(state.settings.progressionCellWidth) || 192;
  state.settings.dismissedRuntimeNotice = Boolean(state.settings.dismissedRuntimeNotice);
  state.settings.dismissedPwaNotice = Boolean(state.settings.dismissedPwaNotice);
  applyLayoutSettings();
  els.octaveInput.value = state.pitchDraft.octave;
  els.snapCentInput.value = formatDecimal(state.settings.snapCent);
  els.centInput.value = formatDecimal(state.pitchDraft.cent);
  els.microStepInput.value = state.pitchDraft.microStepInOctave;
  els.sustainModeInput.checked = state.settings.playMode === "toggle";
  els.waveformSelect.value = state.settings.waveform;
  els.masterVolumeInput.value = state.settings.masterVolume;
  els.activeNotesVolumeInput.value = state.settings.activeNotesVolume;
  els.a4HzInput.value = state.settings.a4Hz;
  els.bpmInput.value = state.settings.bpm;
  els.roundUnitInput.value = formatDecimal(state.settings.roundUnitCent);
  els.roundingModeSelect.value = state.settings.roundingMode;
  populateChordBaseRootOptions();
  populateRecallChordOptions();
  populateRecallRootPresetOptions();
  if (!state.progressionEditor.chordId && state.chordPresets[0]) {
    state.progressionEditor.chordId = state.chordPresets[0].id;
  }
  const rootParts = rootEditorParts();
  els.progRootNoteInput.value = `${rootParts.letter}${rootParts.accidental}`;
  if (els.progRootOctaveInput) els.progRootOctaveInput.value = rootParts.octave;
  els.progColumnsSelect.value = String(state.progression.columns);
  els.progLoopInput.checked = state.progression.loop;
  if (els.runtimeInfoText) renderRuntimeInfo();
  if (els.presetNameWidthInput) els.presetNameWidthInput.value = state.settings.tableColumnWidths.name;
  if (els.presetCentWidthInput) els.presetCentWidthInput.value = state.settings.tableColumnWidths.cent;
  if (els.presetShortWidthInput) els.presetShortWidthInput.value = state.settings.tableColumnWidths.short;
  if (els.presetTagWidthInput) els.presetTagWidthInput.value = state.settings.tableColumnWidths.tags;
  if (els.presetMemoWidthInput) els.presetMemoWidthInput.value = state.settings.tableColumnWidths.memo;
  if (els.progressionCellWidthInput) els.progressionCellWidthInput.value = state.settings.progressionCellWidth;
  renderProgressionChordButtons();
  renderProgressionEditorButtons();
  renderRecallSummary();
  els.addProgPartBtn.textContent = state.progression.selectedPartId ? "後ろに挿入" : "挿入";
  els.deleteProgPartBtn.disabled = !state.progression.selectedPartId;
  els.progPrevBtn.disabled = state.progression.parts.length === 0;
  els.progNextBtn.disabled = state.progression.parts.length === 0;
  els.playProgBtn.disabled = state.progression.parts.length === 0;
  els.stopProgBtn.disabled = !state.progression.playingPartId;
  els.saveChordBtn.disabled = state.activeNotes.length === 0;
  syncProgressionLayoutState();
}

function renderActiveNotes() {
  const container = els.activeNotesList;
  container.innerHTML = "";
  if (state.activeNotes.length === 0) {
    renderPresetTableEmpty(container, "まだ activeNotes はありません。");
    els.activeNotesSummary.textContent = "数直線か音高プリセットから追加してください。";
    return;
  }

  container.classList.add("active-notes-table");
  const table = document.createElement("table");
  table.className = "preset-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th></th>
        <th>音高</th>
        <th>cent</th>
        <th>音高ID</th>
        <th>音名</th>
        <th>短名</th>
        <th>タグ</th>
        <th>メモ</th>
        <th></th>
      </tr>
    </thead>
  `;
  table.prepend(buildPresetColGroup(["remove", "name", "cent", "id", "name-input", "short", "tags", "memo", "actions"]));
  const tbody = document.createElement("tbody");

  const notes = filteredActiveNotes(els.activeNotesFilterInput?.value);
  if (notes.length === 0) {
    const emptyRow = document.createElement("tr");
    emptyRow.innerHTML = `<td colspan="9" class="composer-note">条件に合う activeNotes がありません。</td>`;
    tbody.appendChild(emptyRow);
  }

  notes.forEach((note, index) => {
      const row = document.createElement("tr");
      row.dataset.noteId = note.id;
      const preset = findPitchPresetByMicroStep(note.microStepInOctave);

      const removeCell = document.createElement("td");
      removeCell.innerHTML = `<button type="button" class="danger-button active-note-remove" data-note-id="${note.id}" aria-label="削除">×</button>`;
      row.appendChild(removeCell);

      const labelCell = document.createElement("td");
      labelCell.appendChild(buildPresetMainCell(
        describeNoteTitle(note, index),
        note.id.toLowerCase()
      ));
      row.appendChild(labelCell);

      const centCell = document.createElement("td");
      const centInput = document.createElement("input");
      centInput.type = "number";
      centInput.className = "preset-inline-input";
      centInput.step = String(state.settings.snapCent || 1);
      centInput.value = formatDecimal(note.cent);
      centInput.dataset.field = "cent";
      centCell.appendChild(centInput);
      row.appendChild(centCell);

      const fields = [
        ["id", "音高ID"],
        ["name", "音名"],
        ["shortName", "短名"],
        ["tags", "タグ"],
        ["memo", "メモ"]
      ];
      fields.forEach(([field, placeholder]) => {
        const td = document.createElement("td");
        const input = document.createElement("input");
        input.type = "text";
        input.className = "preset-inline-input";
        input.placeholder = placeholder;
        input.dataset.field = field;
        if (field === "id") input.value = preset?.id || "";
        if (field === "name") input.value = preset?.name || "";
        if (field === "shortName") input.value = preset?.shortName || "";
        if (field === "tags") input.value = (preset?.tags || []).join(", ");
        if (field === "memo") input.value = preset?.memo || "";
        td.appendChild(input);
        row.appendChild(td);
      });

      const actionCell = document.createElement("td");
      actionCell.innerHTML = `<div class="preset-inline-actions"><button type="button" data-action="update-active-note" data-note-id="${note.id}">更新</button><button type="button" data-action="save-pitch-preset" data-note-id="${note.id}">追加</button></div>`;
      row.appendChild(actionCell);

      tbody.appendChild(row);
    });

  table.appendChild(tbody);
  container.appendChild(table);
  els.activeNotesSummary.textContent = `${state.activeNotes.length} 音を保持中`;
}

function populateChordBaseRootOptions() {
  const select = els.chordBaseRootSelect;
  const previous = select.value;
  select.innerHTML = "";

  if (state.activeNotes.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "activeNotes がありません";
    select.appendChild(option);
    select.disabled = true;
    return;
  }

  const sorted = [...state.activeNotes].sort((a, b) => absoluteMicroStep(a) - absoluteMicroStep(b));
  sorted.forEach((note, index) => {
    const option = document.createElement("option");
    option.value = note.id;
    option.textContent = `${index + 1}. ${describeNoteTitle(note, index)}`;
    select.appendChild(option);
  });
  select.disabled = false;
  select.value = sorted.some((note) => note.id === previous) ? previous : sorted[0].id;
}

function populateRecallChordOptions() {
  const select = els.recallChordSelect;
  const previous = select.value;
  select.innerHTML = "";

  if (state.chordPresets.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "保存済みコードがありません";
    select.appendChild(option);
    select.disabled = true;
    return;
  }

  sortedChordPresets().forEach((chord) => {
    const option = document.createElement("option");
    option.value = chord.id;
    option.textContent = chord.name;
    select.appendChild(option);
  });
  select.disabled = false;
  const sorted = sortedChordPresets();
  select.value = sorted.some((chord) => chord.id === previous) ? previous : sorted[0].id;
}

function saveCurrentPitchPreset(source = null) {
  const note = source?.note || state.pitchDraft;
  const values = source?.values || {
    id: els.pitchPresetIdInput.value,
    name: els.pitchPresetNameInput.value,
    shortName: els.pitchPresetShortNameInput.value,
    tags: els.pitchPresetTagsInput.value,
    memo: els.pitchPresetMemoInput.value
  };
  const before = snapshotState();
  const generatedId = `PITCH_${slugifyIdPart(values.shortName || values.name || note.microStepInOctave)}_${note.microStepInOctave}`;
  const pitchId = slugifyIdPart(values.id) || generatedId;
  const pitchName = values.name.trim() || `音高 ${formatDecimal(note.cent)}`;
  const shortName = values.shortName.trim();

  if (state.pitchPresets.some((preset) => preset.id === pitchId)) {
    setStatus(els.pitchPresetStatus, `ID ${pitchId} は既に使われています。`, "error");
    return;
  }
  if (state.pitchPresets.some((preset) => preset.name === pitchName)) {
    setStatus(els.pitchPresetStatus, `音名 ${pitchName} は既に使われています。`, "error");
    return;
  }

  state.pitchPresets.push({
    id: pitchId,
    name: pitchName,
    shortName,
    cent: Number(note.cent),
    microStep: note.microStepInOctave,
    symbolRuleKey: "default",
    symbolMap: {},
    tags: parseCsvList(values.tags),
    memo: values.memo.trim()
  });

  const after = snapshotState();
  trackStateChange("create_pitch_preset", "音高プリセット追加", before, after);
  els.pitchPresetIdInput.value = "";
  els.pitchPresetNameInput.value = "";
  els.pitchPresetShortNameInput.value = "";
  els.pitchPresetTagsInput.value = "";
  els.pitchPresetMemoInput.value = "";
  setStatus(els.pitchPresetStatus, `${pitchName} を追加しました。`, "success");
  render();
}

function populateRecallRootPresetOptions() {
  const select = els.recallRootPresetSelect;
  const previous = select.value;
  select.innerHTML = "";

  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = "未選択";
  select.appendChild(empty);

  sortedPitchPresets().forEach((preset) => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = `${formatPresetDisplayName(preset)} / ${formatDecimal(preset.cent)}c`;
    select.appendChild(option);
  });

  select.disabled = state.pitchPresets.length === 0;
  select.value = state.pitchPresets.some((preset) => preset.id === previous) ? previous : "";
}

function resolveRecallRoot() {
  const directText = els.recallRootTextInput.value.trim();
  if (directText) {
    return parseDirectRootNote(directText);
  }
  const preset = findPitchPresetById(els.recallRootPresetSelect.value);
  if (!preset) return null;
  return {
    octave: state.pitchDraft.octave,
    microStepInOctave: preset.microStep,
    noteText: `${formatPresetDisplayName(preset)}@${state.pitchDraft.octave}`,
    pitchPresetId: preset.id
  };
}

function renderRecallSummary() {
  const chord = state.chordPresets.find((item) => item.id === els.recallChordSelect.value) || null;
  if (!chord) {
    els.recallChordSummary.textContent = "保存済みコードを選ぶと activeNotes に展開できます。";
    els.loadChordBtn.disabled = true;
    return;
  }
  const root = resolveRecallRoot();
  if (!root) {
    els.recallChordSummary.textContent = "音高入力かプリセット選択してください。";
    els.loadChordBtn.disabled = true;
    return;
  }
  const rootLabel =
    els.recallRootTextInput.value.trim() ||
    formatPresetDisplayName(findPitchPresetById(els.recallRootPresetSelect.value)) ||
    "未選択";
  els.recallChordSummary.textContent = `${chord.name} / 構成音 ${chord.tones.length} / root ${rootLabel}`;
  els.loadChordBtn.disabled = false;
}

function syncChordComposerInputsFromRow(row) {
  if (!(row instanceof HTMLElement)) return;
  els.chordIdInput.value = row.querySelector('[data-composer-field="id"]')?.value || "";
  els.chordNameInput.value = row.querySelector('[data-composer-field="name"]')?.value || "";
  els.recallRootTextInput.value = row.querySelector('[data-composer-field="rootText"]')?.value || "";
  els.recallRootPresetSelect.value = row.querySelector('[data-composer-field="rootPreset"]')?.value || "";
  els.chordLabelsInput.value = row.querySelector('[data-composer-field="labels"]')?.value || "";
  els.chordTagsInput.value = row.querySelector('[data-composer-field="tags"]')?.value || "";
  els.chordMemoInput.value = row.querySelector('[data-composer-field="memo"]')?.value || "";
}

function renderProgressionSummary() {
  const selectedIndex = currentProgressionSelectionIndex();
  const current = selectedIndex >= 0 ? String(selectedIndex + 1).padStart(2, "0") : "00";
  const total = String(state.progression.parts.length).padStart(2, "0");
  els.progCounter.textContent = `${current}/${total}`;

  const selected = selectedIndex >= 0 ? state.progression.parts[selectedIndex] : null;
  const chord = selected ? state.chordPresets.find((item) => item.id === selected.chordId) : null;
  const editorRoot = state.progressionEditor.rootNoteText;
  els.progSummary.textContent = selected
    ? `${chord?.name || selected.chordId} / ${formatDirectRootFromPart(selected.root)} / ${selected.beats}/4`
    : `編集中: ${state.progressionEditor.chordId || "未選択"} / ${editorRoot} / ${state.progressionEditor.beats}/4`;
}

function saveChordFromActiveNotes() {
  if (state.activeNotes.length === 0) {
    setStatus(els.chordStatus, "activeNotes がありません。", "error");
    return;
  }

  const rootId = els.chordBaseRootSelect.value;
  const rootNote = state.activeNotes.find((note) => note.id === rootId) || state.activeNotes[0];
  if (!rootNote) {
    setStatus(els.chordStatus, "基準音を選べませんでした。", "error");
    return;
  }

  const before = snapshotState();
  const rawName = els.chordNameInput.value.trim();
  const generatedId = `CHORD_${slugifyIdPart(rawName || "AUTO")}_${state.chordPresets.length + 1}`;
  const chordId = slugifyIdPart(els.chordIdInput.value) || generatedId;
  const userLabels = parseCsvList(els.chordLabelsInput.value);
  const orderedNotes = [
    rootNote,
    ...state.activeNotes
      .filter((note) => note.id !== rootNote.id)
      .sort(
        (a, b) =>
          (absoluteMicroStep(a) - absoluteMicroStep(rootNote)) -
          (absoluteMicroStep(b) - absoluteMicroStep(rootNote))
      )
  ];

  const tones = orderedNotes.map((note, index) => {
    const relative = normalizePitch(0, absoluteMicroStep(note) - absoluteMicroStep(rootNote));
    const preset = findPitchPresetByMicroStep(relative.microStepInOctave);
    const label = userLabels[index] || buildChordToneDefaults(note, index, rootNote);
    return {
      pitchPresetId: preset ? preset.id : null,
      localAnonymousId: preset ? null : `anon:${chordId}:${String(index + 1).padStart(4, "0")}`,
      localCent: preset ? null : Number(microStepToCent(relative.microStepInOctave)),
      octaveShift: relative.octave,
      label
    };
  });

  const chordName = rawName || deriveChordName(userLabels, tones);
  if (state.chordPresets.some((preset) => preset.id === chordId)) {
    setStatus(els.chordStatus, `ID ${chordId} は既に使われています。`, "error");
    return;
  }

  state.chordPresets.push({
    id: chordId,
    name: chordName,
    baseRoot: {
      octave: rootNote.octave,
      microStepInOctave: rootNote.microStepInOctave
    },
    tones,
    tags: parseCsvList(els.chordTagsInput.value),
    memo: els.chordMemoInput.value.trim()
  });

  const after = snapshotState();
  trackStateChange("create_chord_preset", "コード保存", before, after);
  els.chordIdInput.value = "";
  els.chordNameInput.value = "";
  els.chordTagsInput.value = "";
  els.chordLabelsInput.value = "";
  els.chordMemoInput.value = "";
  setStatus(els.chordStatus, `${chordName} を保存しました。`, "success");
  render();
}

async function loadChordIntoActiveNotes(chordId = els.recallChordSelect.value) {
  if (chordId) {
    els.recallChordSelect.value = chordId;
  }
  const chord = state.chordPresets.find((item) => item.id === chordId);
  if (!chord) {
    setStatus(els.recallChordStatus, "呼び出すコードがありません。", "error");
    return;
  }

  const root = resolveRecallRoot();
  if (!root) {
    setStatus(els.recallChordStatus, "基音を指定してください。", "error");
    return;
  }

  const before = snapshotState();
  const rootAbsolute = (root.octave * OCTAVE_MICROSTEP) + root.microStepInOctave;
  const notesById = new Map();

  chord.tones.forEach((tone, index) => {
    let intervalMicroStep = 0;
    if (tone.pitchPresetId) {
      const preset = findPitchPresetById(tone.pitchPresetId);
      if (!preset) return;
      intervalMicroStep = preset.microStep;
    } else {
      intervalMicroStep = centToMicroStep(Number(tone.localCent) || 0);
    }

    const absolute = rootAbsolute + (tone.octaveShift * OCTAVE_MICROSTEP) + intervalMicroStep;
    const normalized = normalizePitch(0, absolute);
    const noteId = buildNoteId(normalized.octave, normalized.microStepInOctave);
    if (!notesById.has(noteId)) {
      notesById.set(noteId, {
        id: noteId,
        octave: normalized.octave,
        microStepInOctave: normalized.microStepInOctave,
        cent: Number(microStepToCent(normalized.microStepInOctave)),
        sourceChordId: chord.id,
        sourceToneIndex: index
      });
    }
  });

  state.activeNotes = [...notesById.values()].sort((a, b) => absoluteMicroStep(a) - absoluteMicroStep(b));
  syncDraftFromCent(microStepToCent(root.microStepInOctave), root.octave);
  const after = snapshotState();
  trackStateChange("load_chord_preset", "コード呼び出し", before, after);
  syncFormFromState();
  render();
  await syncAudioToActiveNotes();
  setStatus(els.recallChordStatus, `${chord.name} を展開しました。`, "success");
}

function render() {
  const currentPreset = findPitchPresetByMicroStep(state.pitchDraft.microStepInOctave);
  const parts = [
    `cent ${formatDecimal(state.pitchDraft.cent)}`,
    `microStep ${state.pitchDraft.microStepInOctave}`
  ];
  if (currentPreset) {
    parts.push(`named ${formatPresetDisplayName(currentPreset)}`);
  }
  els.lineReadout.textContent = parts.join(" / ");

  renderLine();
  renderActiveNotes();
  renderPitchPresets();
  renderChordPresets();
  renderProgressionGrid();
  renderProgressionSummary();
}

async function restoreFromStorage() {
  try {
    const saved = await loadProject();
    if (!saved?.payload) return;
    if (saved.payload.settings) {
      state.settings = { ...state.settings, ...saved.payload.settings };
    }
    state.activeNotes = [];
    if (Array.isArray(saved.payload.pitchPresets)) {
      state.pitchPresets = saved.payload.pitchPresets;
    }
    if (Array.isArray(saved.payload.chordPresets)) {
      state.chordPresets = saved.payload.chordPresets;
    }
    if (saved.payload.progression) {
      state.progression = {
        ...state.progression,
        ...saved.payload.progression,
        parts: Array.isArray(saved.payload.progression.parts) ? saved.payload.progression.parts : []
      };
    }
    if (saved.payload.progressionEditor) {
      state.progressionEditor = { ...state.progressionEditor, ...saved.payload.progressionEditor };
    }
  } catch {
    // keep defaults
  }
}

async function persistLoop() {
  await saveProject(buildProjectPayload());
}

async function init() {
  runtimeState = classifyRuntime();
  if (runtimeState.mode !== "https") {
    await resetDevelopmentCaches();
  }
  await restoreFromStorage();
  state.activeNotes = [];
  syncDraftFromCent(0, state.pitchDraft.octave);
  syncFormFromState();
  render();
  attachEvents();
  updateHistoryButtons();
  audio.setMasterVolume(state.settings.masterVolume);
  renderPwaPrompt();

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    renderPwaPrompt();
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    renderPwaPrompt();
    showRuntimeNotice("PWA をインストールしました。ホーム画面から単体アプリとして起動できます。", "success");
  });

  if ("serviceWorker" in navigator && runtimeState.swAllowed && runtimeState.mode === "https") {
    navigator.serviceWorker.register("./service-worker.js").catch((err) => {
      console.warn("service worker register failed:", err);
      showRuntimeWarning(
        "PWA機能の初期化に失敗しました（通常利用は継続可能）。<br>" +
        "開発時は <code>localhost</code>、PWA 利用時は HTTPS URL を使ってください。"
      );
    });
  }

  window.addEventListener("beforeunload", () => {
    persistLoop().catch(() => {});
  });
  setInterval(() => {
    persistLoop().catch(() => {});
  }, 8000);
}

init().catch((err) => {
  console.error("init failed:", err);
  showRuntimeWarning(
    "初期化に失敗しました。<br>" +
    "このアプリは <code>localhost</code> で開いてください。<br>" +
    "例: <code>python -m http.server 5173</code> → <code>http://localhost:5173/</code>"
  );
});
