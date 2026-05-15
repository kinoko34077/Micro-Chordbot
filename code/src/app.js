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
const APP_BUILD = "2026-05-14-sw-refresh-1";
const ROOT_NOTE_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const ROOT_ACCIDENTAL_OPTIONS = [
  { id: "flat", symbol: "b", delta: -1 },
  { id: "natural", symbol: "", delta: 0 },
  { id: "sharp", symbol: "#", delta: 1 }
];
const DEFAULT_PITCH_PRESETS = [
  { id: "PITCH_P1_0", name: "完全1度", shortName: "P1", cent: 0, microStep: 0, symbolRuleKey: "default", symbolMap: {}, tags: ["core", "degree"], memo: "default root" },
  { id: "PITCH_M2_600", name: "長2度", shortName: "M2", cent: 200, microStep: 600, symbolRuleKey: "default", symbolMap: {}, tags: ["core", "degree"], memo: "" },
  { id: "PITCH_M3_1200", name: "長3度", shortName: "M3", cent: 400, microStep: 1200, symbolRuleKey: "default", symbolMap: {}, tags: ["core", "degree"], memo: "" },
  { id: "PITCH_P4_1500", name: "完全4度", shortName: "P4", cent: 500, microStep: 1500, symbolRuleKey: "default", symbolMap: {}, tags: ["core", "degree"], memo: "" },
  { id: "PITCH_B5_1800", name: "減5度", shortName: "b5", cent: 600, microStep: 1800, symbolRuleKey: "default", symbolMap: {}, tags: ["altered", "degree"], memo: "" },
  { id: "PITCH_P5_2100", name: "完全5度", shortName: "P5", cent: 700, microStep: 2100, symbolRuleKey: "default", symbolMap: {}, tags: ["core", "degree"], memo: "" },
  { id: "PITCH_M6_2700", name: "長6度", shortName: "M6", cent: 900, microStep: 2700, symbolRuleKey: "default", symbolMap: {}, tags: ["degree"], memo: "" },
  { id: "PITCH_M7_3300", name: "長7度", shortName: "M7", cent: 1100, microStep: 3300, symbolRuleKey: "default", symbolMap: {}, tags: ["degree"], memo: "" },
  { id: "PITCH_m3_900", name: "短3度", shortName: "m3", cent: 300, microStep: 900, symbolRuleKey: "default", symbolMap: {}, tags: ["minor", "degree"], memo: "" },
  { id: "PITCH_m7_3000", name: "短7度", shortName: "m7", cent: 1000, microStep: 3000, symbolRuleKey: "default", symbolMap: {}, tags: ["minor", "degree"], memo: "" }
];
const DEFAULT_CHORD_PRESETS = [
  { id: "CHORD_MAJ", name: "maj", baseRoot: { octave: 4, microStepInOctave: 0, pitchPresetId: "PITCH_P1_0", noteText: "C4" }, tones: [{ pitchPresetId: "PITCH_P1_0", localAnonymousId: null, localCent: null, octaveShift: 0, label: "Root" }, { pitchPresetId: "PITCH_M3_1200", localAnonymousId: null, localCent: null, octaveShift: 0, label: "M3" }, { pitchPresetId: "PITCH_P5_2100", localAnonymousId: null, localCent: null, octaveShift: 0, label: "P5" }], tags: ["basic", "major"], memo: "" },
  { id: "CHORD_MIN", name: "min", baseRoot: { octave: 4, microStepInOctave: 0, pitchPresetId: "PITCH_P1_0", noteText: "C4" }, tones: [{ pitchPresetId: "PITCH_P1_0", localAnonymousId: null, localCent: null, octaveShift: 0, label: "Root" }, { pitchPresetId: "PITCH_m3_900", localAnonymousId: null, localCent: null, octaveShift: 0, label: "m3" }, { pitchPresetId: "PITCH_P5_2100", localAnonymousId: null, localCent: null, octaveShift: 0, label: "P5" }], tags: ["basic", "minor"], memo: "" },
  { id: "CHORD_7", name: "7", baseRoot: { octave: 4, microStepInOctave: 0, pitchPresetId: "PITCH_P1_0", noteText: "C4" }, tones: [{ pitchPresetId: "PITCH_P1_0", localAnonymousId: null, localCent: null, octaveShift: 0, label: "Root" }, { pitchPresetId: "PITCH_M3_1200", localAnonymousId: null, localCent: null, octaveShift: 0, label: "M3" }, { pitchPresetId: "PITCH_P5_2100", localAnonymousId: null, localCent: null, octaveShift: 0, label: "P5" }, { pitchPresetId: "PITCH_m7_3000", localAnonymousId: null, localCent: null, octaveShift: 0, label: "m7" }], tags: ["basic", "dominant"], memo: "" },
  { id: "CHORD_M7", name: "M7", baseRoot: { octave: 4, microStepInOctave: 0, pitchPresetId: "PITCH_P1_0", noteText: "C4" }, tones: [{ pitchPresetId: "PITCH_P1_0", localAnonymousId: null, localCent: null, octaveShift: 0, label: "Root" }, { pitchPresetId: "PITCH_M3_1200", localAnonymousId: null, localCent: null, octaveShift: 0, label: "M3" }, { pitchPresetId: "PITCH_P5_2100", localAnonymousId: null, localCent: null, octaveShift: 0, label: "P5" }, { pitchPresetId: "PITCH_M7_3300", localAnonymousId: null, localCent: null, octaveShift: 0, label: "M7" }], tags: ["basic", "major"], memo: "" },
  { id: "CHORD_m7", name: "m7", baseRoot: { octave: 4, microStepInOctave: 0, pitchPresetId: "PITCH_P1_0", noteText: "C4" }, tones: [{ pitchPresetId: "PITCH_P1_0", localAnonymousId: null, localCent: null, octaveShift: 0, label: "Root" }, { pitchPresetId: "PITCH_m3_900", localAnonymousId: null, localCent: null, octaveShift: 0, label: "m3" }, { pitchPresetId: "PITCH_P5_2100", localAnonymousId: null, localCent: null, octaveShift: 0, label: "P5" }, { pitchPresetId: "PITCH_m7_3000", localAnonymousId: null, localCent: null, octaveShift: 0, label: "m7" }], tags: ["basic", "minor"], memo: "" },
  { id: "CHORD_SUS4", name: "sus4", baseRoot: { octave: 4, microStepInOctave: 0, pitchPresetId: "PITCH_P1_0", noteText: "C4" }, tones: [{ pitchPresetId: "PITCH_P1_0", localAnonymousId: null, localCent: null, octaveShift: 0, label: "Root" }, { pitchPresetId: "PITCH_P4_1500", localAnonymousId: null, localCent: null, octaveShift: 0, label: "P4" }, { pitchPresetId: "PITCH_P5_2100", localAnonymousId: null, localCent: null, octaveShift: 0, label: "P5" }], tags: ["basic", "sus"], memo: "" },
  { id: "CHORD_DIM", name: "dim", baseRoot: { octave: 4, microStepInOctave: 0, pitchPresetId: "PITCH_P1_0", noteText: "C4" }, tones: [{ pitchPresetId: "PITCH_P1_0", localAnonymousId: null, localCent: null, octaveShift: 0, label: "Root" }, { pitchPresetId: "PITCH_m3_900", localAnonymousId: null, localCent: null, octaveShift: 0, label: "m3" }, { pitchPresetId: "PITCH_B5_1800", localAnonymousId: null, localCent: null, octaveShift: 0, label: "b5" }], tags: ["basic", "dim"], memo: "" }
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
    progressionCellWidth: 124,
    tableColumnWidths: {
      name: 11,
      cent: 5,
      short: 5,
      tags: 8,
      memo: 10
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
    beats: 4,
    beatUnit: 4,
    sectionName: "",
    bassMode: "relative",
    bassValue: "__root__",
    voicingOctave: 4,
    inversionStep: 0
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
  progChunkSelect: document.getElementById("progChunkSelect"),
  progMenuToggleBtn: document.getElementById("progMenuToggleBtn"),
  progToolbarActions: document.getElementById("progToolbarActions"),
  progColumnsSelect: document.getElementById("progColumnsSelect"),
  progressionEditor: document.getElementById("progressionEditor"),
  progEditorToggleBtn: document.getElementById("progEditorToggleBtn"),
  progressionEditorBody: document.getElementById("progressionEditorBody"),
  progRootNoteInput: document.getElementById("progRootNoteInput"),
  progRootOctaveInput: document.getElementById("progRootOctaveInput"),
  progBassInput: document.getElementById("progBassInput"),
  progBassPopoverBtn: document.getElementById("progBassPopoverBtn"),
  progBassPopover: document.getElementById("progBassPopover"),
  progBassButtonGrid: document.getElementById("progBassButtonGrid"),
  progBassClearBtn: document.getElementById("progBassClearBtn"),
  progInversionPopoverBtn: document.getElementById("progInversionPopoverBtn"),
  progInversionPopover: document.getElementById("progInversionPopover"),
  progVoicingBandGrid: document.getElementById("progVoicingBandGrid"),
  progInversionButtonGrid: document.getElementById("progInversionButtonGrid"),
  progFlatBtn: document.getElementById("progFlatBtn"),
  progNaturalBtn: document.getElementById("progNaturalBtn"),
  progSharpBtn: document.getElementById("progSharpBtn"),
  progOctaveButtons: document.getElementById("progOctaveButtons"),
  progRootLetterButtons: document.getElementById("progRootLetterButtons"),
  progChordTagFilterInput: document.getElementById("progChordTagFilterInput"),
  progChordButtonGrid: document.getElementById("progChordButtonGrid"),
  progBeatsButtonGrid: document.getElementById("progBeatsButtonGrid"),
  progBeatsNumeratorInput: document.getElementById("progBeatsNumeratorInput"),
  progBeatsDenominatorInput: document.getElementById("progBeatsDenominatorInput"),
  addProgPartBtn: document.getElementById("addProgPartBtn"),
  deleteProgPartBtn: document.getElementById("deleteProgPartBtn"),
  playProgBtn: document.getElementById("playProgBtn"),
  stopProgBtn: document.getElementById("stopProgBtn"),
  progLoopInput: document.getElementById("progLoopInput"),
  progExportBtn: document.getElementById("progExportBtn"),
  progImportFileInput: document.getElementById("progImportFileInput"),
  addProgChunkBtn: document.getElementById("addProgChunkBtn"),
  addProgSectionBtn: document.getElementById("addProgSectionBtn"),
  progStatus: document.getElementById("progStatus"),
  progSummary: document.getElementById("progSummary"),
  progressionGrid: document.getElementById("progressionGrid"),
  progSectionNameInput: document.getElementById("progSectionNameInput"),
  a4HzInput: document.getElementById("a4HzInput"),
  bpmInput: document.getElementById("bpmInput"),
  roundUnitInput: document.getElementById("roundUnitInput"),
  roundingModeSelect: document.getElementById("roundingModeSelect"),
  runtimeInfoText: document.getElementById("runtimeInfoText"),
  runtimeRefreshBtn: document.getElementById("runtimeRefreshBtn"),
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
const pitchUi = {
  lastTouchedNoteId: null
};
const popoverUi = {
  active: "",
  pointerDown: false
};
const ROOT_BASS_TOKEN = "__root__";

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
  const runtimeLabel = `runtime: ${runtimeState.mode} (${runtimeState.protocol}//${runtimeState.hostname || ""}) / build: ${APP_BUILD}`;
  const bannerText = runtimeBanner.message
    ? runtimeBanner.message.replace(/<br\s*\/?>/gi, " / ").replace(/<[^>]+>/g, "").trim()
    : "現在バナー表示はありません。";
  const pwaText = els.pwaPromptMessage?.textContent?.trim() || "現在 PWA テロップ表示はありません。";
  els.runtimeInfoText.textContent = `${runtimeLabel} / notice: ${bannerText} / pwa: ${pwaText}`;
}

function applyLayoutSettings() {
  const widths = state.settings.tableColumnWidths || {};
  document.documentElement.style.setProperty("--preset-name-col", `${widths.name || 11}rem`);
  document.documentElement.style.setProperty("--preset-cent-col", `${widths.cent || 5}rem`);
  document.documentElement.style.setProperty("--preset-short-col", `${widths.short || 5}rem`);
  document.documentElement.style.setProperty("--preset-tags-col", `${widths.tags || 8}rem`);
  document.documentElement.style.setProperty("--preset-memo-col", `${widths.memo || 10}rem`);
  document.documentElement.style.setProperty("--progression-cell-width", `${state.settings.progressionCellWidth || 124}px`);
  document.documentElement.style.setProperty("--progression-columns", `${clamp(Number(state.progression.columns) || 4, 1, 12)}`);
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

function isRootLikePreset(preset) {
  if (!preset) return false;
  const tokens = [
    String(preset.shortName || "").toUpperCase(),
    String(preset.name || "").toUpperCase(),
    String(preset.id || "").toUpperCase()
  ];
  return tokens.includes("P1") || Number(preset.microStep) === 0;
}

function defaultRootPreset() {
  return sortedPitchPresets().find(isRootLikePreset) || sortedPitchPresets()[0] || null;
}

function defaultRootPresetId() {
  return defaultRootPreset()?.id || "";
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

function buildProgressionPayload() {
  return {
    app: "muChordbot",
    specVersion: "1.2.0",
    extensionType: "mcbp",
    exportType: "progression",
    payload: {
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

function findActiveNoteById(noteId) {
  return state.activeNotes.find((note) => note.id === noteId) || null;
}

function rememberActiveNote(noteId) {
  pitchUi.lastTouchedNoteId = noteId;
}

function syncDraftFromNote(note) {
  if (!note) return;
  pitchUi.lastTouchedNoteId = note.id;
  state.pitchDraft = {
    octave: note.octave,
    cent: Number(note.cent),
    microStepInOctave: note.microStepInOctave
  };
}

function roundPitchPosition(octave, microStepInOctave) {
  const roundUnit = Math.max(0, Number(state.settings.roundUnitCent) || 0);
  if (roundUnit <= 0) {
    return normalizePitch(octave, microStepInOctave);
  }
  if (state.settings.roundingMode === "beforeRoot") {
    const absoluteCent = microStepToCent((octave * OCTAVE_MICROSTEP) + microStepInOctave);
    const roundedCent = Math.round(absoluteCent / roundUnit) * roundUnit;
    return normalizePitch(0, centToMicroStep(roundedCent));
  }
  const roundedLocalCent = Math.round(microStepToCent(microStepInOctave) / roundUnit) * roundUnit;
  return normalizePitch(octave, centToMicroStep(roundedLocalCent));
}

function activeNotePlaybackPosition(note) {
  return roundPitchPosition(note.octave, note.microStepInOctave);
}

function currentPitchEditTarget() {
  return findActiveNoteById(pitchUi.lastTouchedNoteId);
}

function dedupeActiveNotes(preferredNote = null) {
  const keepNotes = new Set();
  const buckets = new Map();
  state.activeNotes.forEach((note) => {
    if (!buckets.has(note.id)) buckets.set(note.id, []);
    buckets.get(note.id).push(note);
  });
  buckets.forEach((notes) => {
    keepNotes.add(notes.includes(preferredNote) ? preferredNote : notes[notes.length - 1]);
  });
  state.activeNotes = state.activeNotes.filter((note) => keepNotes.has(note));
}

function currentBassPreset() {
  if (state.progressionEditor.bassMode !== "relative") return null;
  if (!state.progressionEditor.bassValue || state.progressionEditor.bassValue === ROOT_BASS_TOKEN) return null;
  return findPitchPresetById(state.progressionEditor.bassValue);
}

function bassSpecLabel(mode, value) {
  if (mode === "absolute") return value || "C3";
  if (!value || value === ROOT_BASS_TOKEN) return "P1";
  const preset = findPitchPresetById(value);
  return preset ? formatPresetDisplayName(preset) : "P1";
}

function bassTokenLabel() {
  return bassSpecLabel(state.progressionEditor.bassMode, state.progressionEditor.bassValue);
}

function ordinalLabel(value) {
  const n = Math.abs(Number(value) || 0);
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  if (n % 10 === 1) return `${n}st`;
  if (n % 10 === 2) return `${n}nd`;
  if (n % 10 === 3) return `${n}rd`;
  return `${n}th`;
}

function inversionLabelForChord(chord, step = 0) {
  if (!chord || !chord.tones?.length) return "root";
  const normalized = ((Number(step) % chord.tones.length) + chord.tones.length) % chord.tones.length;
  if (normalized === 0) return "root";
  return ordinalLabel(normalized);
}

function currentInversionLabel() {
  const chord = state.chordPresets.find((item) => item.id === state.progressionEditor.chordId);
  return inversionLabelForChord(chord, state.progressionEditor.inversionStep);
}

function voicingBandOffsetOctave(band) {
  if (band === "low") return -1;
  if (band === "high") return 1;
  return 0;
}

function normalizedInversionRotation(total, step = 0) {
  const count = Math.max(Number(total) || 0, 1);
  return ((Number(step) % count) + count) % count;
}

function inversionOctaveCarry(total, step = 0) {
  const count = Math.max(Number(total) || 0, 1);
  const rotation = normalizedInversionRotation(count, step);
  return Math.floor((Number(step) - rotation) / count);
}

function normalizeVoicingState(total, octave, step = 0) {
  const count = Math.max(Number(total) || 0, 1);
  const normalizedStep = normalizedInversionRotation(count, step);
  const octaveCarry = inversionOctaveCarry(count, step);
  return {
    octave: clamp((Number(octave) || 4) + octaveCarry, -2, 9),
    step: normalizedStep
  };
}

function progressionVoicingBaseOctave(part) {
  const chord = state.chordPresets.find((item) => item.id === part?.chordId);
  const total = chord?.tones?.length || 1;
  const explicit = Number(part?.voicing?.octave);
  if (Number.isFinite(explicit)) {
    return normalizeVoicingState(total, explicit, part?.voicing?.step || 0).octave;
  }
  return normalizeVoicingState(
    total,
    Number(part?.root?.octave || 4) + voicingBandOffsetOctave(part?.voicing?.band || "mid"),
    part?.voicing?.step || 0
  ).octave;
}

function currentVoicingOctave() {
  return clamp(Number(state.progressionEditor.voicingOctave || 4), -2, 9);
}

function formatRootPitchClass(root) {
  const text = formatDirectRootFromPart(root);
  return text.replace(/-?\d+$/, "");
}

function bassSpecForPart(part) {
  const mode = part?.bass?.mode === "absolute" ? "absolute" : "relative";
  if (mode === "absolute") {
    const parsed = parseDirectRootNote(part?.bass?.noteText || "");
    return parsed ? { mode, value: parsed.noteText } : { mode: "relative", value: ROOT_BASS_TOKEN };
  }
  const value = part?.bass?.pitchPresetId || ROOT_BASS_TOKEN;
  return { mode, value };
}

function fineDragStepCent() {
  const snap = Math.max(0, Number(state.settings.snapCent) || 0);
  return Math.max(1 / 3, snap > 0 ? snap / 10 : 1 / 3);
}

function openProgressionPopover(name) {
  popoverUi.active = name;
  renderProgressionPopovers();
}

function closeProgressionPopovers() {
  popoverUi.active = "";
  renderProgressionPopovers();
}

function renderProgressionPopovers() {
  els.progBassPopover?.classList.remove("hidden");
  els.progInversionPopover?.classList.remove("hidden");
  els.progBassPopover?.classList.toggle("active", popoverUi.active === "bass");
  els.progInversionPopover?.classList.toggle("active", popoverUi.active === "inversion");
  els.progInversionPopoverBtn?.classList.toggle("active", popoverUi.active === "inversion");
}

function buildChordToneDefaults(note, index, rootNote) {
  if (note.id === rootNote.id) return "Root";
  const relative = normalizePitch(0, absoluteMicroStep(note) - absoluteMicroStep(rootNote));
  const preset = findPitchPresetByMicroStep(relative.microStepInOctave);
  if (preset) return formatPresetDisplayName(preset);
  return `tone${index + 1}`;
}

function buildChordToneDefaultsFromAbsolute(note, index, rootAbsolute) {
  const relative = normalizePitch(0, absoluteMicroStep(note) - rootAbsolute);
  if (relative.octave === 0 && relative.microStepInOctave === 0) return "Root";
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
  const rounded = roundPitchPosition(state.pitchDraft.octave, state.pitchDraft.microStepInOctave);
  return frequencyFromPitch(
    state.settings.a4Hz,
    rounded.octave,
    rounded.microStepInOctave
  );
}

async function syncAudioToActiveNotes() {
  audio.stopVoice(MOMENTARY_VOICE_ID);
  audio.stopVoice(DRAG_PREVIEW_VOICE_ID);

  const activeIds = new Set(state.activeNotes.map((note) => note.id));
  for (const note of state.activeNotes) {
    const playback = activeNotePlaybackPosition(note);
    await audio.startVoice(
      note.id,
      frequencyFromPitch(state.settings.a4Hz, playback.octave, playback.microStepInOctave),
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
  pitchUi.lastTouchedNoteId = state.activeNotes[0]?.id || null;
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
  state.progressionEditor.beatUnit = part.beatUnit || 4;
  state.progressionEditor.sectionName = String(part.sectionName || "");
  const bass = bassSpecForPart(part);
  state.progressionEditor.bassMode = bass.mode;
  state.progressionEditor.bassValue = bass.value;
  const chord = state.chordPresets.find((item) => item.id === part.chordId);
  const total = chord?.tones?.length || 1;
  const normalizedVoicing = normalizeVoicingState(total, progressionVoicingBaseOctave(part), part.voicing?.step || 0);
  state.progressionEditor.voicingOctave = normalizedVoicing.octave;
  state.progressionEditor.inversionStep = normalizedVoicing.step;
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
  let resolvedOctave = octave;
  let microStepInOctave = (semitoneBase * 300) + (accidentalShift * 300);
  if (microStepInOctave >= OCTAVE_MICROSTEP) {
    resolvedOctave += Math.floor(microStepInOctave / OCTAVE_MICROSTEP);
    microStepInOctave %= OCTAVE_MICROSTEP;
  } else if (microStepInOctave < 0) {
    const octaveDelta = Math.floor(microStepInOctave / OCTAVE_MICROSTEP);
    resolvedOctave += octaveDelta;
    microStepInOctave -= octaveDelta * OCTAVE_MICROSTEP;
  }
  return {
    noteText: `${letter}${accidental}${octave}`,
    octave: resolvedOctave,
    microStepInOctave,
    pitchPresetId: null
  };
}

function parseRootEditorTextRaw(text) {
  const match = String(text || "").trim().match(/^([A-Ga-g])([#b]?)(-?\d+)$/);
  if (!match) return null;
  return {
    letter: match[1].toUpperCase(),
    accidental: match[2] || "",
    octave: match[3]
  };
}

function accidentalDelta(symbol) {
  return ROOT_ACCIDENTAL_OPTIONS.find((option) => option.symbol === symbol)?.delta ?? 0;
}

function resolveSpelledOctave(letter, accidental, targetAbsolute, preferredOctave) {
  const base = Number(preferredOctave) || 4;
  for (let offset = -2; offset <= 2; offset += 1) {
    const candidate = base + offset;
    const parsed = parseDirectRootNote(`${letter}${accidental}${candidate}`);
    if (!parsed) continue;
    if (((parsed.octave * OCTAVE_MICROSTEP) + parsed.microStepInOctave) === targetAbsolute) {
      return candidate;
    }
  }
  return base;
}

function applyRootAccidentalChange(nextAccidental) {
  const parts = rootEditorParts();
  const current = resolveProgressionRootInput();
  if (!current) return;
  const currentAbsolute = (current.octave * OCTAVE_MICROSTEP) + current.microStepInOctave;
  const semitoneDelta = (accidentalDelta(nextAccidental) - accidentalDelta(parts.accidental)) * 300;
  const targetAbsolute = currentAbsolute + semitoneDelta;
  const nextOctave = resolveSpelledOctave(parts.letter, nextAccidental, targetAbsolute, Number(parts.octave));
  setProgressionEditorRoot({ ...parts, accidental: nextAccidental, octave: String(nextOctave) });
}

function formatDirectRootFromPart(root) {
  if (root.noteText) return root.noteText;
  const semitone = Math.round(root.microStepInOctave / 300);
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${names[((semitone % 12) + 12) % 12]}${root.octave}`;
}

function rootEditorParts() {
  const parsed = parseRootEditorTextRaw(state.progressionEditor.rootNoteText);
  if (parsed) return parsed;
  return { letter: "C", accidental: "", octave: "4" };
}

function currentProgressionSelectionIndex() {
  return state.progression.parts.findIndex((part) => part.id === state.progression.selectedPartId);
}

function progressionToneSpecs(chord) {
  return (chord?.tones || []).map((tone, toneIndex) => {
    let intervalMicroStep = 0;
    if (tone.pitchPresetId) {
      const preset = findPitchPresetById(tone.pitchPresetId);
      if (!preset) return null;
      intervalMicroStep = preset.microStep;
    } else {
      intervalMicroStep = centToMicroStep(Number(tone.localCent) || 0);
    }
    return {
      toneIndex,
      label: tone.label || `Tone${toneIndex + 1}`,
      intervalAbsoluteMicroStep: (tone.octaveShift * OCTAVE_MICROSTEP) + intervalMicroStep
    };
  }).filter(Boolean).sort((a, b) => a.intervalAbsoluteMicroStep - b.intervalAbsoluteMicroStep);
}

function applyInversionToToneSpecs(toneSpecs, step = 0, octaveOffset = 0) {
  if (!toneSpecs.length) return [];
  const total = toneSpecs.length;
  const normalizedStep = Number(step) || 0;
  const rotation = normalizedInversionRotation(total, normalizedStep);
  const octaveCarry = inversionOctaveCarry(total, normalizedStep);
  const rotated = toneSpecs.slice(rotation).concat(
    toneSpecs.slice(0, rotation).map((tone) => ({
      ...tone,
      intervalAbsoluteMicroStep: tone.intervalAbsoluteMicroStep + OCTAVE_MICROSTEP
    }))
  );
  return rotated.map((tone) => ({
    ...tone,
    intervalAbsoluteMicroStep: tone.intervalAbsoluteMicroStep + (octaveCarry * OCTAVE_MICROSTEP) + octaveOffset
  }));
}

function progressionBassPosition(part) {
  const spec = bassSpecForPart(part);
  if (spec.mode === "absolute") {
    const parsed = parseDirectRootNote(spec.value);
    return parsed ? { octave: parsed.octave, microStepInOctave: parsed.microStepInOctave } : null;
  }
  const intervalMicroStep = spec.value === ROOT_BASS_TOKEN
    ? 0
    : findPitchPresetById(spec.value)?.microStep;
  if (!Number.isFinite(intervalMicroStep)) return normalizePitch(part.root.octave - 1, part.root.microStepInOctave);
  const absolute = (part.root.octave * OCTAVE_MICROSTEP) + part.root.microStepInOctave + intervalMicroStep - OCTAVE_MICROSTEP;
  return normalizePitch(0, absolute);
}

function selectBassPreset(presetId, changeLabel = "進行セルの bass 変更") {
  state.progressionEditor.bassMode = "relative";
  state.progressionEditor.bassValue = presetId || ROOT_BASS_TOKEN;
  syncProgressionSelectionFromEditor(changeLabel, true);
}

function selectBassAbsoluteNote(noteText, changeLabel = "進行セルの bass 固定音変更") {
  const parsed = parseDirectRootNote(noteText);
  if (!parsed) return false;
  state.progressionEditor.bassMode = "absolute";
  state.progressionEditor.bassValue = parsed.noteText;
  syncProgressionSelectionFromEditor(changeLabel, true);
  return true;
}

function selectInversionStep(step, changeLabel = "進行セルの転回形変更", baseOctave = state.progressionEditor.voicingOctave) {
  if (!Number.isFinite(Number(step))) return;
  const chord = state.chordPresets.find((item) => item.id === state.progressionEditor.chordId);
  const total = chord?.tones?.length || 1;
  const normalizedVoicing = normalizeVoicingState(total, baseOctave, step);
  state.progressionEditor.voicingOctave = normalizedVoicing.octave;
  state.progressionEditor.inversionStep = normalizedVoicing.step;
  syncProgressionSelectionFromEditor(changeLabel, true);
}

function buttonAtClientPoint(container, clientX, clientY) {
  if (!(container instanceof HTMLElement)) return null;
  const target = document.elementFromPoint(clientX, clientY);
  if (!(target instanceof HTMLElement) || !container.contains(target)) return null;
  const button = target.closest("button");
  return button instanceof HTMLButtonElement && container.contains(button) ? button : null;
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

function renderBassChoiceButtons() {
  if (!els.progBassButtonGrid) return;
  els.progBassButtonGrid.innerHTML = "";
  const rootButton = document.createElement("button");
  rootButton.type = "button";
  rootButton.dataset.bassPresetId = ROOT_BASS_TOKEN;
  rootButton.textContent = "P1";
  rootButton.title = "root";
  rootButton.classList.toggle(
    "active",
    state.progressionEditor.bassMode === "relative" &&
    (!state.progressionEditor.bassValue || state.progressionEditor.bassValue === ROOT_BASS_TOKEN)
  );
  els.progBassButtonGrid.appendChild(rootButton);
  sortedPitchPresets().forEach((preset) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.bassPresetId = preset.id;
    button.textContent = formatPresetDisplayName(preset);
    button.title = `${preset.name || preset.id} / ${preset.id}`;
    button.classList.toggle(
      "active",
      state.progressionEditor.bassMode === "relative" && state.progressionEditor.bassValue === preset.id
    );
    els.progBassButtonGrid.appendChild(button);
  });
}

function renderVoicingControls() {
  if (!els.progInversionButtonGrid) return;
  if (els.progVoicingBandGrid) {
    els.progVoicingBandGrid.innerHTML = "";
    els.progVoicingBandGrid.classList.add("hidden");
  }
  els.progInversionButtonGrid.innerHTML = "";
  const chord = state.chordPresets.find((item) => item.id === state.progressionEditor.chordId);
  const tones = progressionToneSpecs(chord);
  const normalizedStep = normalizedInversionRotation(tones.length, state.progressionEditor.inversionStep);
  tones.slice(1).forEach((tone, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.inversionStep = String(index + 1);
    button.textContent = ordinalLabel(index + 1);
    button.title = tone.label || ordinalLabel(index + 1);
    button.classList.toggle("active", normalizedStep === index + 1);
    els.progInversionButtonGrid.appendChild(button);
  });
}

function renderProgressionEditorButtons() {
  const parts = rootEditorParts();
  if (els.progSectionNameInput) {
    els.progSectionNameInput.value = state.progressionEditor.sectionName || "";
  }
  els.progRootLetterButtons.querySelectorAll("button").forEach((button) => {
    button.classList.toggle("active", button.dataset.note === parts.letter);
  });
  els.progFlatBtn.classList.toggle("active", parts.accidental === "b");
  els.progNaturalBtn.classList.toggle("active", parts.accidental === "");
  els.progSharpBtn.classList.toggle("active", parts.accidental === "#");
  if (els.progBeatsNumeratorInput) els.progBeatsNumeratorInput.value = String(state.progressionEditor.beats || 4);
  if (els.progBeatsDenominatorInput) els.progBeatsDenominatorInput.value = String(state.progressionEditor.beatUnit || 4);
  if (els.progBassInput) els.progBassInput.value = bassTokenLabel();
  if (els.progInversionPopoverBtn) {
    els.progInversionPopoverBtn.textContent = `転回形: ${currentInversionLabel()} / oct ${currentVoicingOctave()}`;
  }
  renderProgressionPopovers();
  renderBassChoiceButtons();
  renderVoicingControls();
}

function progressionPartLabel(part) {
  const chord = state.chordPresets.find((item) => item.id === part.chordId);
  const rootLabel = formatRootPitchClass(part.root);
  const bass = bassSpecForPart(part);
  const bassDisplay = bass.mode === "relative" && (!bass.value || bass.value === ROOT_BASS_TOKEN)
    ? ""
    : ` / ${bassSpecLabel(bass.mode, bass.value)}`;
  const octave = progressionVoicingBaseOctave(part);
  return {
    sectionName: String(part.sectionName || ""),
    chunkName: String(part.chunkName || ""),
    chordName: `${chord?.name || `(deleted: ${part.chordId})`}${bassDisplay}`,
    rootLabel,
    meta: `(${part.beats}/${part.beatUnit || 4} oct:${octave})`
  };
}

function progressionSections() {
  const groups = [];
  let currentGroup = null;
  state.progression.parts.forEach((part, index) => {
    const explicitName = String(part.sectionName || "").trim();
    if (!currentGroup || explicitName) {
      currentGroup = {
        startIndex: index,
        name: explicitName || `section ${groups.length + 1}`,
        partIds: []
      };
      groups.push(currentGroup);
    }
    currentGroup.partIds.push(part.id);
  });
  return groups;
}

function progressionSectionAtIndex(index) {
  const sections = progressionSections();
  const sectionIndex = sections.findIndex((section) => index >= section.startIndex && index < section.startIndex + section.partIds.length);
  return {
    sections,
    index: sectionIndex >= 0 ? sectionIndex : (sections.length ? 0 : -1),
    section: sectionIndex >= 0 ? sections[sectionIndex] : null
  };
}

function progressionChunks() {
  const chunks = [];
  let currentChunk = null;
  state.progression.parts.forEach((part, index) => {
    const chunkId = part.chunkId || "chunk-1";
    if (!currentChunk || currentChunk.id !== chunkId) {
      currentChunk = {
        id: chunkId,
        startIndex: index,
        name: String(part.chunkName || "").trim() || `chunk ${chunks.length + 1}`,
        partIds: []
      };
      chunks.push(currentChunk);
    }
    currentChunk.partIds.push(part.id);
  });
  return chunks;
}

function chunkContextForPartId(partId) {
  const chunks = progressionChunks();
  const chunkIndex = chunks.findIndex((chunk) => chunk.partIds.includes(partId));
  return {
    chunks,
    index: chunkIndex >= 0 ? chunkIndex : (chunks.length ? 0 : -1),
    chunk: chunkIndex >= 0 ? chunks[chunkIndex] : null
  };
}

function currentChunkId() {
  const selected = state.progression.parts.find((part) => part.id === state.progression.selectedPartId);
  if (selected?.chunkId) return selected.chunkId;
  return progressionChunks()[0]?.id || "chunk-1";
}

function currentChunkName() {
  const current = chunkContextForPartId(state.progression.selectedPartId || state.progression.parts[0]?.id || "");
  return current.chunk?.name || "chunk 1";
}

function resolveProgressionRootInput() {
  const noteName = String(els.progRootNoteInput?.value || "").trim();
  const octave = String(els.progRootOctaveInput?.value || "").trim();
  if (/^[A-Ga-g][#b]?-?\d+$/.test(noteName)) {
    return parseDirectRootNote(noteName);
  }
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
  const voicingOffset = (progressionVoicingBaseOctave(part) - part.root.octave) * OCTAVE_MICROSTEP;
  const voicedTones = applyInversionToToneSpecs(
    progressionToneSpecs(chord),
    part.voicing?.step || 0,
    voicingOffset
  );
  const specs = [];

  voicedTones.forEach((tone) => {
    const absolute = rootAbsolute + tone.intervalAbsoluteMicroStep;
    const normalized = normalizePitch(0, absolute);
    const rounded = roundPitchPosition(normalized.octave, normalized.microStepInOctave);
    specs.push({
      id: `${voicePrefix}${part.id}:${tone.toneIndex}`,
      freq: frequencyFromPitch(state.settings.a4Hz, rounded.octave, rounded.microStepInOctave)
    });
  });

  const bassPosition = progressionBassPosition(part);
  if (bassPosition) {
    const roundedBass = roundPitchPosition(bassPosition.octave, bassPosition.microStepInOctave);
    specs.push({
      id: `${voicePrefix}${part.id}:bass`,
      freq: frequencyFromPitch(state.settings.a4Hz, roundedBass.octave, roundedBass.microStepInOctave)
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

  const beatMs = (60_000 / clamp(state.settings.bpm, 5, 300)) * part.beats * (4 / clamp(Number(part.beatUnit) || 4, 1, 32));
  progressionPlayback.timerId = setTimeout(() => {
    const chunkInfo = chunkContextForPartId(part.id);
    const chunkParts = chunkInfo.chunk
      ? chunkInfo.chunk.partIds
          .map((id) => state.progression.parts.find((item) => item.id === id))
          .filter(Boolean)
      : [];
    const currentChunkIndex = chunkParts.findIndex((item) => item.id === part.id);
    const nextIndex = currentChunkIndex + 1;
    if (nextIndex < chunkParts.length) {
      const nextPart = chunkParts[nextIndex];
      const globalIndex = state.progression.parts.findIndex((item) => item.id === nextPart.id);
      void playProgressionPart(nextPart, globalIndex);
      return;
    }
    if (state.progression.loop && chunkParts.length > 0) {
      const firstPart = chunkParts[0];
      const globalIndex = state.progression.parts.findIndex((item) => item.id === firstPart.id);
      void playProgressionPart(firstPart, globalIndex);
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
  if (pitchUi.lastTouchedNoteId === noteId) {
    pitchUi.lastTouchedNoteId = state.activeNotes[0]?.id || null;
  }
  audio.stopVoice(noteId);
  const after = snapshotState();
  trackStateChange("remove_active_note", "activeNotesから削除", before, after);
  syncFormFromState();
  render();
}

function syncLineCanvasSize(canvas) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rect.width || canvas.clientWidth || 1));
  const height = Math.max(1, Math.round(rect.height || canvas.clientHeight || 1));
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  const renderWidth = Math.round(width * ratio);
  const renderHeight = Math.round(height * ratio);
  if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
    canvas.width = renderWidth;
    canvas.height = renderHeight;
  }
  return { width, height, ratio };
}

function lineMarkerPosition(metrics, note) {
  const centerOctave = 3;
  const octaveStepY = 10;
  const markerBaseY = metrics.height / 2;
  const x = (note.microStepInOctave / OCTAVE_MICROSTEP) * metrics.width;
  const octaveOffset = note.octave - centerOctave;
  const y = clamp(markerBaseY - (octaveOffset * octaveStepY), 24, metrics.height - 14);
  return { x, y };
}

function hitActiveNoteOnLine(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const metrics = syncLineCanvasSize(canvas);
  const localX = clientX - rect.left;
  const localY = clientY - rect.top;
  let best = null;
  let bestDistance = 16;
  state.activeNotes.forEach((note) => {
    const candidates = [lineMarkerPosition(metrics, note)];
    if (state.settings.roundUnitCent > 0) {
      candidates.push(lineMarkerPosition(metrics, activeNotePlaybackPosition(note)));
    }
    candidates.forEach((marker) => {
      const distance = Math.hypot(marker.x - localX, marker.y - localY);
      if (distance <= bestDistance) {
        best = note;
        bestDistance = distance;
      }
    });
  });
  return best;
}

function renderLine() {
  const canvas = els.lineCanvas;
  const metrics = syncLineCanvasSize(canvas);
  const ctx = canvas.getContext("2d");
  ctx.setTransform(metrics.ratio, 0, 0, metrics.ratio, 0, 0);
  ctx.clearRect(0, 0, metrics.width, metrics.height);
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, metrics.width, metrics.height);

  ctx.strokeStyle = "#334155";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 12; i += 1) {
    const x = (metrics.width * i) / 12;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, metrics.height);
    ctx.stroke();
  }

  const labels = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B", "C"];
  ctx.fillStyle = "#94a3b8";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  labels.forEach((label, index) => {
    const rawX = (metrics.width * index) / 12;
    const x = clamp(rawX + (index === 0 ? 12 : index === 12 ? -12 : 0), 12, metrics.width - 12);
    ctx.fillText(label, x, 12);
  });
  ctx.textAlign = "start";

  const markerPad = 8;
  const draftX = (state.pitchDraft.microStepInOctave / OCTAVE_MICROSTEP) * metrics.width;
  ctx.strokeStyle = "#22d3ee";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(draftX, 16);
  ctx.lineTo(draftX, metrics.height - 8);
  ctx.stroke();

  const sortedActiveNotes = [...state.activeNotes].sort((a, b) => absoluteMicroStep(a) - absoluteMicroStep(b));
  sortedActiveNotes.forEach((note, index) => {
    const original = lineMarkerPosition(metrics, note);
    const roundedNote = activeNotePlaybackPosition(note);
    const rounded = lineMarkerPosition(metrics, roundedNote);
    let originalX = original.x;
    let roundedX = rounded.x;
    if (Math.abs(originalX - roundedX) > metrics.width / 2) {
      if (originalX < roundedX) originalX += metrics.width;
      else roundedX += metrics.width;
    }
    const drawOriginalX = clamp(originalX, markerPad, metrics.width - markerPad);
    const drawRoundedX = clamp(roundedX, markerPad, metrics.width - markerPad);
    if (state.settings.roundUnitCent > 0) {
      ctx.strokeStyle = "#64748b";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(drawOriginalX, original.y);
      ctx.lineTo(drawRoundedX, rounded.y);
      ctx.stroke();
      ctx.fillStyle = "rgba(148, 163, 184, 0.65)";
      ctx.beginPath();
      ctx.arc(drawOriginalX, original.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.arc(drawRoundedX, rounded.y, 6, 0, Math.PI * 2);
    ctx.fill();
    if (pitchUi.lastTouchedNoteId === note.id) {
      ctx.strokeStyle = "#f8fafc";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(drawRoundedX, rounded.y, 8, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#f8fafc";
    ctx.font = "10px sans-serif";
    ctx.fillText(String(index + 1), drawRoundedX - 3, rounded.y + 4);
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

  const current = chunkContextForPartId(state.progression.selectedPartId || state.progression.parts[0]?.id || "");
  const chunk = current.chunk || progressionChunks()[0];
  if (!chunk) return;

  const chunkWrap = document.createElement("section");
  chunkWrap.className = "progression-chunk";

  const chunkHead = document.createElement("div");
  chunkHead.className = "progression-chunk-head";
  chunkHead.textContent = chunk.name;
  chunkHead.dataset.chunkId = chunk.id;
  chunkHead.dataset.chunkName = chunk.name;
  chunkHead.title = "ダブルクリックでチャンク名を編集";
  chunkWrap.appendChild(chunkHead);

  const chunkGrid = document.createElement("div");
  chunkGrid.className = "progression-chunk-grid";

  chunk.partIds.forEach((partId) => {
    const index = state.progression.parts.findIndex((item) => item.id === partId);
    const part = state.progression.parts[index];
    if (!part) return;
    const { chordName, rootLabel, meta: metaLabel, sectionName } = progressionPartLabel(part);

      if (sectionName) {
        const sectionBreak = document.createElement("div");
        sectionBreak.className = "progression-section-break";
        sectionBreak.textContent = sectionName;
        sectionBreak.dataset.partId = part.id;
        sectionBreak.dataset.sectionName = sectionName;
        sectionBreak.title = "ダブルクリックでセクション名を編集";
        chunkGrid.appendChild(sectionBreak);
      }

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
    button.dataset.chunkId = chunk.id;

    const title = document.createElement("div");
    title.className = "cell-title";
    title.textContent = `${rootLabel} ${chordName}`;
    button.appendChild(title);

    const meta = document.createElement("div");
    meta.className = "cell-meta";
    meta.textContent = metaLabel;
    button.appendChild(meta);

    chunkGrid.appendChild(button);
  });

  chunkWrap.appendChild(chunkGrid);
  els.progressionGrid.appendChild(chunkWrap);
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

function exportProgressionProject() {
  const payload = buildProgressionPayload();
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "progression.mcbp";
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

function ensureDefaultLibrary() {
  if (!Array.isArray(state.pitchPresets) || state.pitchPresets.length === 0) {
    state.pitchPresets = JSON.parse(JSON.stringify(DEFAULT_PITCH_PRESETS));
  }
  if (!Array.isArray(state.chordPresets) || state.chordPresets.length === 0) {
    state.chordPresets = JSON.parse(JSON.stringify(DEFAULT_CHORD_PRESETS));
  }
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
    } else if (extensionType === "mcbp" || parsed?.exportType === "progression") {
      const incomingPitchPresets = Array.isArray(parsed?.payload?.pitchPresets) ? parsed.payload.pitchPresets : [];
      const incomingChordPresets = Array.isArray(parsed?.payload?.chordPresets) ? parsed.payload.chordPresets : [];
      const pitchMerge = mergeById(state.pitchPresets, incomingPitchPresets);
      const chordMerge = mergeById(state.chordPresets, incomingChordPresets);
      state.pitchPresets = pitchMerge.merged;
      state.chordPresets = chordMerge.merged;
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
      setStatus(
        els.progStatus,
        `progression を読込: pitch +${pitchMerge.added}, chord +${chordMerge.added}, parts ${state.progression.parts.length}`,
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

function buildProgressionBassState() {
  if (state.progressionEditor.bassMode === "absolute") {
    const parsed = parseDirectRootNote(state.progressionEditor.bassValue);
    if (parsed) {
      return {
        mode: "absolute",
        noteText: parsed.noteText
      };
    }
  }
  return {
    mode: "relative",
    pitchPresetId:
      state.progressionEditor.bassValue && state.progressionEditor.bassValue !== ROOT_BASS_TOKEN
        ? state.progressionEditor.bassValue
        : null
  };
}

function buildProgressionVoicingState() {
  const chord = state.chordPresets.find((item) => item.id === state.progressionEditor.chordId);
  const total = chord?.tones?.length || 1;
  const normalizedVoicing = normalizeVoicingState(
    total,
    state.progressionEditor.voicingOctave,
    state.progressionEditor.inversionStep
  );
  return {
    octave: normalizedVoicing.octave,
    step: normalizedVoicing.step
  };
}

function buildProgressionSectionName() {
  return String(state.progressionEditor.sectionName || "").trim();
}

function buildProgressionPartFromEditor(partId, root, chunkId, sectionName) {
  return {
    id: partId,
    chordId: state.progressionEditor.chordId,
    root,
    chunkId,
    chunkName: currentChunkName(),
    sectionName,
    bass: buildProgressionBassState(),
    voicing: buildProgressionVoicingState(),
    beats: clamp(Number(state.progressionEditor.beats) || 4, 1, 32),
    beatUnit: clamp(Number(state.progressionEditor.beatUnit) || 4, 1, 32)
  };
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
  const partId = `PART_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const newPart = buildProgressionPartFromEditor(partId, root, currentChunkId(), "");
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

function addProgressionSection() {
  const root = resolveProgressionRootInput();
  if (!root || !state.progressionEditor.chordId) {
    setStatus(els.progStatus, "Section 追加前にコードとルートを設定してください。", "error");
    return;
  }
  const before = snapshotState();
  const selectedIndex = state.progression.parts.findIndex((part) => part.id === state.progression.selectedPartId);
  const insertIndex = selectedIndex >= 0 ? selectedIndex + 1 : state.progression.parts.length;
  const partId = `PART_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const sectionName = buildProgressionSectionName() || `section ${insertIndex + 1}`;
  const newPart = buildProgressionPartFromEditor(partId, root, currentChunkId(), sectionName);
  state.progression.parts.splice(insertIndex, 0, newPart);
  state.progression.selectedPartId = partId;
  const after = snapshotState();
  trackStateChange("add_progression_section", "進行 section 追加", before, after);
  syncFormFromState();
  render();
  setStatus(els.progStatus, "Section を追加しました。", "success");
}

function addProgressionChunk() {
  const root = resolveProgressionRootInput();
  if (!root || !state.progressionEditor.chordId) {
    setStatus(els.progStatus, "チャンク追加前にコードとルートを設定してください。", "error");
    return;
  }
  const before = snapshotState();
  const chunks = progressionChunks();
  const current = chunkContextForPartId(state.progression.selectedPartId || "");
  const insertAfterChunk = current.chunk || chunks[chunks.length - 1] || null;
  const insertIndex = insertAfterChunk ? insertAfterChunk.startIndex + insertAfterChunk.partIds.length : state.progression.parts.length;
  const chunkId = `CHUNK_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const partId = `PART_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const newPart = {
    ...buildProgressionPartFromEditor(partId, root, chunkId, buildProgressionSectionName()),
    chunkName: `chunk ${chunks.length + 1}`
  };
  state.progression.parts.splice(insertIndex, 0, newPart);
  state.progression.selectedPartId = partId;
  const after = snapshotState();
  trackStateChange("add_progression_chunk", "進行チャンク追加", before, after);
  syncFormFromState();
  render();
  setStatus(els.progStatus, "チャンクを追加しました。", "success");
}

function renameChunk(chunkId, nextName) {
  const name = String(nextName || "").trim();
  if (!chunkId || !name) return;
  const before = snapshotState();
  state.progression.parts = state.progression.parts.map((part) =>
    part.chunkId === chunkId ? { ...part, chunkName: name } : part
  );
  const after = snapshotState();
  trackStateChange("rename_progression_chunk", "チャンク名変更", before, after);
  syncFormFromState();
  render();
}

function renameSection(partId, nextName) {
  const name = String(nextName || "").trim();
  if (!partId || !name) return;
  const before = snapshotState();
  state.progression.parts = state.progression.parts.map((part) =>
    part.id === partId ? { ...part, sectionName: name } : part
  );
  if (state.progression.selectedPartId === partId) {
    state.progressionEditor.sectionName = name;
  }
  const after = snapshotState();
  trackStateChange("rename_progression_section", "セクション名変更", before, after);
  syncFormFromState();
  render();
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
  state.progression.selectedPartId = state.progression.parts[index - 1]?.id || state.progression.parts[index]?.id || null;
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
    sectionName: buildProgressionSectionName(),
    bass: buildProgressionBassState(),
    voicing: buildProgressionVoicingState(),
    beats: clamp(Number(state.progressionEditor.beats) || 4, 1, 32),
    beatUnit: clamp(Number(state.progressionEditor.beatUnit) || 4, 1, 32)
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
  const previousParts = rootEditorParts();
  state.progressionEditor.rootNoteText = `${letter}${accidental}${octave}`;
  const nextOctave = Number(octave);
  const previousOctave = Number(previousParts.octave);
  if (Number.isFinite(previousOctave) && Number.isFinite(nextOctave)) {
    const offset = Number(state.progressionEditor.voicingOctave || previousOctave) - previousOctave;
    state.progressionEditor.voicingOctave = clamp(nextOctave + offset, -2, 9);
  } else if (Number.isFinite(nextOctave)) {
    state.progressionEditor.voicingOctave = clamp(nextOctave, -2, 9);
  }
  if (els.progRootNoteInput) els.progRootNoteInput.value = `${letter}${accidental}`;
  if (els.progRootOctaveInput) els.progRootOctaveInput.value = octave;
  syncProgressionSelectionFromEditor("進行セルのルート変更", true);
}

function stepSelectedProgressionPart(direction) {
  const current = chunkContextForPartId(state.progression.selectedPartId || state.progression.parts[0]?.id || "");
  if (!current.chunk || current.chunks.length === 0) return;
  const nextIndex = clamp(current.index + direction, 0, current.chunks.length - 1);
  selectProgressionPart(current.chunks[nextIndex].partIds[0]);
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
  if (!dragContext) return;
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || 1;
  if (dragContext.mode === "active-note") {
    const note = findActiveNoteById(dragContext.noteId);
    if (!note) return;
    const deltaX = dragContext.virtualX - dragContext.pointerStartX;
    const speedFactor = dragContext.fine ? 8 : 1;
    const rawDeltaCent = (deltaX / width) * 1200 / speedFactor;
    const deltaCent = dragContext.fine
      ? Math.round(rawDeltaCent / fineDragStepCent()) * fineDragStepCent()
      : rawDeltaCent;
    const normalized = normalizePitch(0, dragContext.baseAbsoluteMicroStep + centToMicroStep(deltaCent));
    note.octave = normalized.octave;
    note.microStepInOctave = normalized.microStepInOctave;
    note.cent = Number(microStepToCent(normalized.microStepInOctave));
    note.id = buildNoteId(note.octave, note.microStepInOctave);
    dragContext.noteId = note.id;
    dedupeActiveNotes(note);
    syncDraftFromNote(note);
    syncFormFromState();
    render();
    await syncAudioToActiveNotes();
    return;
  }
  const virtualX = dragContext.virtualX;
  const octaveDelta = Math.floor(virtualX / width);
  const normalizedX = ((virtualX % width) + width) % width;
  const cent = (normalizedX / width) * 1200;
  const targetOctave = dragContext.baseOctave + octaveDelta;

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
    if (pitchUi.lastTouchedNoteId === noteId) {
      pitchUi.lastTouchedNoteId = state.activeNotes[0]?.id || null;
    }
  } else {
    state.activeNotes.push({
      id: noteId,
      octave: state.pitchDraft.octave,
      microStepInOctave: state.pitchDraft.microStepInOctave,
      cent: Number(state.pitchDraft.cent)
    });
    rememberActiveNote(noteId);
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
  pitchUi.lastTouchedNoteId = null;
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
  rememberActiveNote(noteId);
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

  sortedPitchPresets().forEach((preset) => {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = formatPresetDisplayName(preset);
    select.appendChild(option);
  });

  const fallbackId = defaultRootPresetId();
  select.value = state.pitchPresets.some((preset) => preset.id === selectedId)
    ? selectedId
    : fallbackId;
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
        String(preset.id || "").toLowerCase()
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
    dedupeActiveNotes(note);
    rememberActiveNote(note.id);
    syncDraftFromNote(note);
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
  document.addEventListener("pointerdown", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest(".progression-popover") || target.closest(".progression-token")) return;
    closeProgressionPopovers();
  });
  document.addEventListener("pointerup", () => {
    popoverUi.pointerDown = false;
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
    const nextCent = Number.isFinite(parsedCent) ? parsedCent : state.pitchDraft.cent;
    const currentNote = currentPitchEditTarget();
    if (currentNote) {
      const normalized = normalizePitch(currentNote.octave, centToMicroStep(nextCent));
      currentNote.octave = normalized.octave;
      currentNote.microStepInOctave = normalized.microStepInOctave;
      currentNote.cent = Number(microStepToCent(normalized.microStepInOctave));
      currentNote.id = buildNoteId(currentNote.octave, currentNote.microStepInOctave);
      dedupeActiveNotes(currentNote);
      syncDraftFromNote(currentNote);
    } else {
      syncDraftFromCent(nextCent, state.pitchDraft.octave);
    }
    const after = snapshotState();
    trackStateChange("update_cent", "cent入力変更", before, after);
    syncFormFromState();
    render();
    void syncAudioToActiveNotes();
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
  els.addProgChunkBtn?.addEventListener("click", addProgressionChunk);
  els.addProgSectionBtn?.addEventListener("click", addProgressionSection);
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
    const selectedId = state.progression.selectedPartId || state.progression.parts[0]?.id;
    const startIndex = Math.max(0, state.progression.parts.findIndex((part) => part.id === selectedId));
    void playProgressionPart(state.progression.parts[startIndex] || state.progression.parts[0], startIndex);
    setStatus(els.progStatus, "進行再生を開始しました。", "success");
  });
  els.stopProgBtn.addEventListener("click", () => {
    stopProgressionPlayback();
    setStatus(els.progStatus, "進行再生を停止しました。", "success");
  });
  els.progRootNoteInput.addEventListener("change", () => {
    const parsed = resolveProgressionRootInput();
    if (!parsed) {
      setStatus(els.progStatus, "ルートは D# のように入力してください。オクターブは右欄です。", "error");
      const parts = rootEditorParts();
      els.progRootNoteInput.value = `${parts.letter}${parts.accidental}`;
      if (els.progRootOctaveInput) els.progRootOctaveInput.value = parts.octave;
      return;
    }
    const previousParts = rootEditorParts();
    state.progressionEditor.rootNoteText = parsed.noteText;
    const previousOctave = Number(previousParts.octave);
    if (Number.isFinite(previousOctave)) {
      const offset = Number(state.progressionEditor.voicingOctave || previousOctave) - previousOctave;
      state.progressionEditor.voicingOctave = clamp(parsed.octave + offset, -2, 9);
    } else {
      state.progressionEditor.voicingOctave = parsed.octave;
    }
    setStatus(els.progStatus, "", "");
    syncProgressionSelectionFromEditor("進行セルのルート変更", true);
  });
  const syncProgressionRootOctave = () => {
    const parsed = resolveProgressionRootInput();
    if (!parsed) {
      const parts = rootEditorParts();
      if (els.progRootOctaveInput) els.progRootOctaveInput.value = parts.octave;
      return;
    }
    state.progressionEditor.rootNoteText = parsed.noteText;
    syncProgressionSelectionFromEditor("進行セルのオクターブ変更", true);
  };
  els.progRootOctaveInput?.addEventListener("input", syncProgressionRootOctave);
  els.progRootOctaveInput?.addEventListener("change", syncProgressionRootOctave);
  els.progSectionNameInput?.addEventListener("input", () => {
    state.progressionEditor.sectionName = String(els.progSectionNameInput.value || "");
    syncProgressionSelectionFromEditor("進行セルのセクション変更", false);
  });
  const syncProgressionBeatInputs = () => {
    state.progressionEditor.beats = clamp(Number(els.progBeatsNumeratorInput?.value) || 4, 1, 32);
    state.progressionEditor.beatUnit = clamp(Number(els.progBeatsDenominatorInput?.value) || 4, 1, 32);
    syncProgressionSelectionFromEditor("進行セルの拍変更", false);
  };
  els.progBeatsNumeratorInput?.addEventListener("input", syncProgressionBeatInputs);
  els.progBeatsNumeratorInput?.addEventListener("change", syncProgressionBeatInputs);
  els.progBeatsDenominatorInput?.addEventListener("input", syncProgressionBeatInputs);
  els.progBeatsDenominatorInput?.addEventListener("change", syncProgressionBeatInputs);
  els.progBassInput?.addEventListener("focus", () => openProgressionPopover("bass"));
  els.progBassInput?.addEventListener("pointerdown", () => openProgressionPopover("bass"));
  els.progBassInput?.addEventListener("change", () => {
    const raw = String(els.progBassInput.value || "").trim();
    if (!raw || /^(root|p1)$/i.test(raw)) {
      selectBassPreset(ROOT_BASS_TOKEN, "進行セルの bass root 変更");
      els.progBassInput.value = bassTokenLabel();
      return;
    }
    if (selectBassAbsoluteNote(raw, "進行セルの bass 固定音変更")) {
      els.progBassInput.value = bassTokenLabel();
      return;
    }
    const preset = state.pitchPresets.find((item) =>
      item.id === raw ||
      item.name === raw ||
      item.shortName === raw ||
      formatPresetDisplayName(item) === raw
    ) || null;
    if (preset) {
      selectBassPreset(preset.id, "進行セルの bass 変更");
    }
    els.progBassInput.value = bassTokenLabel();
  });
  els.progBassPopoverBtn?.addEventListener("click", () => openProgressionPopover("bass"));
  els.progBassClearBtn?.addEventListener("click", () => selectBassPreset(ROOT_BASS_TOKEN, "進行セルの bass root 変更"));
  els.progBassButtonGrid?.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLButtonElement)) return;
    selectBassPreset(target.dataset.bassPresetId || "", "進行セルの bass 変更");
  });
  els.progBassButtonGrid?.addEventListener("pointerdown", (ev) => {
    popoverUi.pointerDown = true;
    const button = buttonAtClientPoint(els.progBassButtonGrid, ev.clientX, ev.clientY);
    if (!(button instanceof HTMLButtonElement)) return;
    selectBassPreset(button.dataset.bassPresetId || "", "進行セルの bass スワイプ変更");
  });
  els.progBassButtonGrid?.addEventListener("pointermove", (ev) => {
    if (!popoverUi.pointerDown) return;
    const button = buttonAtClientPoint(els.progBassButtonGrid, ev.clientX, ev.clientY);
    if (!(button instanceof HTMLButtonElement)) return;
    const presetId = button.dataset.bassPresetId || ROOT_BASS_TOKEN;
    if (
      state.progressionEditor.bassMode === "relative" &&
      presetId === (state.progressionEditor.bassValue || ROOT_BASS_TOKEN)
    ) return;
    selectBassPreset(presetId, "進行セルの bass スワイプ変更");
  });
  els.progInversionPopoverBtn?.addEventListener("click", () => openProgressionPopover("inversion"));
  els.progInversionButtonGrid?.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLButtonElement)) return;
    selectInversionStep(Number(target.dataset.inversionStep), "進行セルの転回形変更");
  });
  els.progInversionButtonGrid?.addEventListener("pointerdown", (ev) => {
    popoverUi.pointerDown = true;
    const button = buttonAtClientPoint(els.progInversionButtonGrid, ev.clientX, ev.clientY);
    if (!(button instanceof HTMLButtonElement)) return;
    selectInversionStep(Number(button.dataset.inversionStep), "進行セルの転回形スワイプ変更");
  });
  els.progInversionButtonGrid?.addEventListener("pointermove", (ev) => {
    if (!popoverUi.pointerDown) return;
    const button = buttonAtClientPoint(els.progInversionButtonGrid, ev.clientX, ev.clientY);
    if (!(button instanceof HTMLButtonElement)) return;
    const step = Number(button.dataset.inversionStep);
    if (!Number.isFinite(step) || step === state.progressionEditor.inversionStep) return;
    selectInversionStep(step, "進行セルの転回形スワイプ変更");
  });
  els.progInversionPopoverBtn?.addEventListener("pointerdown", (ev) => {
    if (!(ev.target instanceof HTMLElement)) return;
    openProgressionPopover("inversion");
    const startX = ev.clientX;
    const startStep = Number(state.progressionEditor.inversionStep) || 0;
    const startOctave = Number(state.progressionEditor.voicingOctave) || 4;
    let appliedOffset = 0;
    const move = (moveEv) => {
      const offset = Math.trunc((moveEv.clientX - startX) / 24);
      if (offset === appliedOffset) return;
      appliedOffset = offset;
      selectInversionStep(startStep + offset, "進行セルの転回形スワイプ変更", startOctave);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
  });
  els.progFlatBtn.addEventListener("click", () => {
    applyRootAccidentalChange("b");
  });
  els.progNaturalBtn.addEventListener("click", () => {
    applyRootAccidentalChange("");
  });
  els.progSharpBtn.addEventListener("click", () => {
    applyRootAccidentalChange("#");
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
  els.chordTagFilterInput.addEventListener("input", render);
  els.activeNotesFilterInput?.addEventListener("input", render);
  els.pitchPresetFilterInput?.addEventListener("input", render);
  els.progChordTagFilterInput.addEventListener("input", render);
  const syncProgressionColumns = () => {
    const before = snapshotState();
    state.progression.columns = clamp(Number(els.progColumnsSelect.value) || 4, 1, 12);
    const after = snapshotState();
    trackStateChange("update_progression_columns", "進行列数変更", before, after);
    applyLayoutSettings();
    render();
  };
  els.progColumnsSelect.addEventListener("input", syncProgressionColumns);
  els.progColumnsSelect.addEventListener("change", syncProgressionColumns);
  els.progChunkSelect?.addEventListener("change", () => {
    const chunkId = String(els.progChunkSelect.value || "");
    const chunk = progressionChunks().find((item) => item.id === chunkId);
    if (!chunk) return;
    selectProgressionPart(chunk.partIds[0]);
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
      render();
    });
  };
  bindWidthInput(els.presetNameWidthInput, "name", 5, 24, 11);
  bindWidthInput(els.presetCentWidthInput, "cent", 3, 10, 5);
  bindWidthInput(els.presetShortWidthInput, "short", 3, 12, 5);
  bindWidthInput(els.presetTagWidthInput, "tags", 4, 18, 8);
  bindWidthInput(els.presetMemoWidthInput, "memo", 5, 20, 10);
  els.progressionCellWidthInput?.addEventListener("input", () => {
    state.settings.progressionCellWidth = clamp(Number(els.progressionCellWidthInput.value) || 124, 88, 220);
    applyLayoutSettings();
    render();
  });
  els.activeNotesList.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    if (!(target instanceof HTMLButtonElement)) {
      const row = target.closest("[data-note-id]");
      if (!(row instanceof HTMLElement)) return;
      const note = findActiveNoteById(row.dataset.noteId || "");
      if (!note) return;
      syncDraftFromNote(note);
      render();
      return;
    }
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
  els.progressionGrid.addEventListener("dblclick", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    const chunkHead = target.closest(".progression-chunk-head");
    if (chunkHead instanceof HTMLElement && chunkHead.dataset.chunkId) {
      ev.preventDefault();
      ev.stopPropagation();
      const chunkId = chunkHead.dataset.chunkId;
      const currentText = chunkHead.dataset.chunkName || chunkHead.textContent || "";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "preset-inline-input";
      input.value = currentText;
      chunkHead.replaceChildren(input);
      input.focus();
      input.select();
      const commit = () => renameChunk(chunkId, input.value || currentText);
      input.addEventListener("blur", commit, { once: true });
      input.addEventListener("keydown", (keyEv) => {
        if (keyEv.key === "Enter") input.blur();
        if (keyEv.key === "Escape") render();
      });
      return;
    }
    const sectionBreak = target.closest(".progression-section-break");
    if (sectionBreak instanceof HTMLElement && sectionBreak.dataset.partId) {
      ev.preventDefault();
      ev.stopPropagation();
      const partId = sectionBreak.dataset.partId;
      const currentText = sectionBreak.dataset.sectionName || sectionBreak.textContent || "";
      const input = document.createElement("input");
      input.type = "text";
      input.className = "preset-inline-input";
      input.value = currentText;
      sectionBreak.replaceChildren(input);
      input.focus();
      input.select();
      const commit = () => renameSection(partId, input.value || currentText);
      input.addEventListener("blur", commit, { once: true });
      input.addEventListener("keydown", (keyEv) => {
        if (keyEv.key === "Enter") input.blur();
        if (keyEv.key === "Escape") render();
      });
    }
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
    const hitNote = hitActiveNoteOnLine(canvas, ev.clientX, ev.clientY);
    if (hitNote) {
      syncDraftFromNote(hitNote);
      rememberActiveNote(hitNote.id);
      dragContext = {
        mode: "active-note",
        before: snapshotState(),
        noteId: hitNote.id,
        baseAbsoluteMicroStep: absoluteMicroStep(hitNote),
        pointerStartX: x,
        virtualX: x,
        lastCanvasX: x,
        fine: ev.ctrlKey || ev.metaKey
      };
    } else {
      dragContext = {
        mode: "draft",
        before: snapshotState(),
        baseOctave: state.pitchDraft.octave,
        lastCanvasX: x,
        virtualX: x
      };
    }
    canvas.setPointerCapture(ev.pointerId);
    await applyDragPitch(false);
  });

  canvas.addEventListener("pointermove", async (ev) => {
    if (!dragContext) return;
    const x = canvasXFromPointerEvent(canvas, ev);
    if (dragContext.mode === "active-note") {
      dragContext.virtualX += x - dragContext.lastCanvasX;
      dragContext.lastCanvasX = x;
      dragContext.fine = ev.ctrlKey || ev.metaKey;
    } else {
      dragContext.virtualX += x - dragContext.lastCanvasX;
      dragContext.lastCanvasX = x;
    }
    await applyDragPitch(false);
  });

  canvas.addEventListener("pointerup", async (ev) => {
    if (!dragContext) return;
    const x = canvasXFromPointerEvent(canvas, ev);
    if (dragContext.mode === "active-note") {
      dragContext.virtualX += x - dragContext.lastCanvasX;
      dragContext.lastCanvasX = x;
      dragContext.fine = ev.ctrlKey || ev.metaKey;
    } else {
      dragContext.virtualX += x - dragContext.lastCanvasX;
      dragContext.lastCanvasX = x;
    }
    await applyDragPitch(true);
    if (dragContext.mode === "active-note") {
      const after = snapshotState();
      trackStateChange("active_note_drag", "activeNotes ドラッグ調整", dragContext.before, after);
      await syncAudioToActiveNotes();
    } else if (state.settings.playMode === "momentary") {
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

  canvas.addEventListener("dblclick", (ev) => {
    const hitNote = hitActiveNoteOnLine(canvas, ev.clientX, ev.clientY);
    if (!hitNote) return;
    removeActiveNote(hitNote.id);
  });

  window.addEventListener("resize", () => {
    syncProgressionLayoutState();
    render();
  });

  els.exportBtn.addEventListener("click", exportProject);
  els.exportLibraryBtn.addEventListener("click", exportLibrary);
  els.progExportBtn?.addEventListener("click", exportProgressionProject);
  els.progImportFileInput?.addEventListener("change", async () => {
    const file = els.progImportFileInput.files?.[0];
    if (!file) return;
    await importDataFile(file);
    els.progImportFileInput.value = "";
  });
  els.runtimeRefreshBtn?.addEventListener("click", () => {
    showRuntimeNotice("キャッシュを破棄して再読込します。", "info");
    void forceRefreshApplication();
  });
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

async function forceRefreshApplication() {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
    await Promise.all(
      registrations.map(async (registration) => {
        await registration.update().catch(() => {});
        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      })
    );
  }
  await resetDevelopmentCaches().catch(() => {});
  window.location.reload();
}

function syncFormFromState() {
  state.settings.tableColumnWidths = {
    name: 11,
    cent: 5,
    short: 5,
    tags: 8,
    memo: 10,
    ...(state.settings.tableColumnWidths || {})
  };
  state.settings.progressionCellWidth = Number(state.settings.progressionCellWidth) || 124;
  state.settings.dismissedRuntimeNotice = Boolean(state.settings.dismissedRuntimeNotice);
  state.settings.dismissedPwaNotice = Boolean(state.settings.dismissedPwaNotice);
  state.progression.columns = clamp(Number(state.progression.columns) || 4, 1, 12);
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
  if (!els.recallRootTextInput.value.trim() && !els.recallRootPresetSelect.value) {
    els.recallRootPresetSelect.value = defaultRootPresetId();
  }
  if (!state.progressionEditor.chordId && state.chordPresets[0]) {
    state.progressionEditor.chordId = state.chordPresets[0].id;
  }
  if (!state.progressionEditor.sectionName) {
    state.progressionEditor.sectionName = "";
  }
  const rootParts = rootEditorParts();
  els.progRootNoteInput.value = `${rootParts.letter}${rootParts.accidental}`;
  if (els.progRootOctaveInput) els.progRootOctaveInput.value = rootParts.octave;
  els.progColumnsSelect.value = String(state.progression.columns);
  if (els.progChunkSelect) {
    const current = chunkContextForPartId(state.progression.selectedPartId || state.progression.parts[0]?.id || "");
    els.progChunkSelect.innerHTML = "";
    progressionChunks().forEach((chunk, index) => {
      const option = document.createElement("option");
      option.value = chunk.id;
      option.textContent = `${String(index + 1).padStart(2, "0")} ${chunk.name}`;
      els.progChunkSelect.appendChild(option);
    });
    els.progChunkSelect.value = current.chunk?.id || progressionChunks()[0]?.id || "";
    els.progChunkSelect.disabled = progressionChunks().length === 0;
  }
  els.progLoopInput.checked = state.progression.loop;
  if (els.progSectionNameInput) els.progSectionNameInput.value = state.progressionEditor.sectionName;
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
  if (els.addProgChunkBtn) els.addProgChunkBtn.disabled = !state.progressionEditor.chordId;
  if (els.addProgSectionBtn) els.addProgSectionBtn.disabled = !state.progressionEditor.chordId;
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
        <th>短名</th>
        <th>タグ</th>
        <th>メモ</th>
        <th></th>
      </tr>
    </thead>
  `;
  table.prepend(buildPresetColGroup(["remove", "name", "cent", "short", "tags", "memo", "actions"]));
  const tbody = document.createElement("tbody");

  const notes = filteredActiveNotes(els.activeNotesFilterInput?.value);
  if (notes.length === 0) {
    const emptyRow = document.createElement("tr");
    emptyRow.innerHTML = `<td colspan="7" class="composer-note">条件に合う activeNotes がありません。</td>`;
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
    const resolvedName = preset?.name || describeNoteTitle(note, index);
    labelCell.appendChild(buildPresetMainCell(resolvedName, String(preset?.id || note.id).toLowerCase()));
    const hiddenName = document.createElement("input");
    hiddenName.type = "hidden";
    hiddenName.dataset.field = "name";
    hiddenName.value = preset?.name || resolvedName;
    labelCell.appendChild(hiddenName);
    const hiddenId = document.createElement("input");
    hiddenId.type = "hidden";
    hiddenId.dataset.field = "id";
    hiddenId.value = preset?.id || "";
    labelCell.appendChild(hiddenId);
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
  const fallbackId = defaultRootPresetId();
  select.value = state.pitchPresets.some((preset) => preset.id === previous) ? previous : fallbackId;
}

function resolveRecallRoot() {
  const directText = els.recallRootTextInput.value.trim();
  if (directText) {
    return parseDirectRootNote(directText);
  }
  const preset = findPitchPresetById(els.recallRootPresetSelect.value || defaultRootPresetId());
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
  const chunkInfo = chunkContextForPartId(state.progression.selectedPartId || state.progression.parts[0]?.id || "");
  const current = chunkInfo.index >= 0 ? String(chunkInfo.index + 1).padStart(2, "0") : "00";
  const total = String(chunkInfo.chunks.length).padStart(2, "0");
  els.progCounter.textContent = `${current}/${total}`;

  const selected = selectedIndex >= 0 ? state.progression.parts[selectedIndex] : null;
  const chord = selected ? state.chordPresets.find((item) => item.id === selected.chordId) : null;
  const editorRoot = state.progressionEditor.rootNoteText;
  const bassLabel = bassTokenLabel();
  const inversionLabel = `${currentInversionLabel()} / oct ${currentVoicingOctave()}`;
  const sectionLabel = selected
    ? String(selected.sectionName || "").trim()
    : String(state.progressionEditor.sectionName || "").trim();
  els.progSummary.textContent = selected
    ? `${sectionLabel ? `${sectionLabel} / ` : ""}${chord?.name || selected.chordId} / ${formatDirectRootFromPart(selected.root)} / bass ${bassLabel} / ${inversionLabel} / ${selected.beats}/${selected.beatUnit || 4}`
    : `編集中: ${sectionLabel ? `${sectionLabel} / ` : ""}${state.progressionEditor.chordId || "未選択"} / ${editorRoot} / bass ${bassLabel} / ${inversionLabel} / ${state.progressionEditor.beats}/${state.progressionEditor.beatUnit || 4}`;
}

function saveChordFromActiveNotes() {
  if (state.activeNotes.length === 0) {
    setStatus(els.chordStatus, "activeNotes がありません。", "error");
    return;
  }

  const root = resolveRecallRoot();
  if (!root) {
    setStatus(els.chordStatus, "基音を指定できませんでした。", "error");
    return;
  }

  const before = snapshotState();
  const rawName = els.chordNameInput.value.trim();
  const generatedId = `CHORD_${slugifyIdPart(rawName || "AUTO")}_${state.chordPresets.length + 1}`;
  const chordId = slugifyIdPart(els.chordIdInput.value) || generatedId;
  const userLabels = parseCsvList(els.chordLabelsInput.value);
  const rootAbsolute = (root.octave * OCTAVE_MICROSTEP) + root.microStepInOctave;
  const orderedNotes = [
    ...state.activeNotes
      .slice()
      .sort(
        (a, b) =>
          (absoluteMicroStep(a) - rootAbsolute) -
          (absoluteMicroStep(b) - rootAbsolute)
      )
  ];

  const tones = orderedNotes.map((note, index) => {
    const relative = normalizePitch(0, absoluteMicroStep(note) - rootAbsolute);
    const preset = findPitchPresetByMicroStep(relative.microStepInOctave);
    const label = userLabels[index] || buildChordToneDefaultsFromAbsolute(note, index, rootAbsolute);
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
      octave: root.octave,
      microStepInOctave: root.microStepInOctave,
      pitchPresetId: root.pitchPresetId || null,
      noteText: root.noteText || ""
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
  pitchUi.lastTouchedNoteId = state.activeNotes[0]?.id || null;
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
    `cent ${formatDecimal(state.pitchDraft.cent)}`
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
  ensureDefaultLibrary();
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
    navigator.serviceWorker.register(`./service-worker.js?build=${encodeURIComponent(APP_BUILD)}`, {
      updateViaCache: "none"
    }).then(async (registration) => {
      let reloading = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloading) return;
        reloading = true;
        window.location.reload();
      });
      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            worker.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
      await registration.update().catch(() => {});
      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    }).catch((err) => {
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
