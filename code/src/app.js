Warning: truncated output (original token count: 57782)
Total output lines: 5809

import { AudioEngine } from "./audio.js";
import { HistoryManager, isNativeUndoTarget } from "./history.js";
import {
  centToMicroStep,
  microStepToCent,
  normalizePitch,
  frequencyFromPitch,
  snapCent,
  clamp,
  OCTAVE_MICROSTEP
} from "./pitch.js";
import { loadProjectResult, saveProject } from "./storage.js";
import {
  detectImportKind,
  getActiveVoiceIdsForFailureCleanup,
  getAudioFailureMessage,
  getImportFailureMessage,
  getPersistenceStatus,
  getPersistenceRecoveryAction,
  resolvePersistenceSaveResult
} from "./operation-feedback.js";
import {
  DEFAULT_CHORD_PRESETS,
  DEFAULT_PITCH_PRESETS,
  ROOT_ACCIDENTAL_OPTIONS,
  ROOT_NOTE_SEMITONES
} from "./default-library.js";
import {
  buildLibraryPayload as createLibraryPayload,
  buildProgressionPayload as createProgressionPayload,
  buildProjectPayload as createProjectPayload,
  cloneStateSnapshot as cloneProjectStateSnapshot,
  ensureDefaultLibrary as ensureDefaultLibraryState,
  migratePitchScale as migratePitchScaleState,
  detectPitchEncoding
} from "./project-state.js";
import {
  formatDecimal,
  normalizeFilterText,
  parseCsvList,
  slugifyIdPart,
  sortByColumn,
  sortIndicator,
  toggleSortState
} from "./format-utils.js";

const audio = new AudioEngine();
const history = new HistoryManager(100);
const MOMENTARY_VOICE_ID = "__preview__";
const DRAG_PREVIEW_VOICE_ID = "__preview_drag__";
const PROGRESSION_VOICE_PREFIX = "__prog__:";
const PROGRESSION_PREVIEW_VOICE_PREFIX = "__prog_preview__:";
const APP_BUILD = "2026-05-20-performance-refactor-1";
const SEMITONE_MICROSTEP = centToMicroStep(100);
const UNDO_ICON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 7 4 12l5 5"></path><path d="M20 18a7 7 0 0 0-7-7H4"></path></svg>';
const REDO_ICON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m15 7 5 5-5 5"></path><path d="M4 18a7 7 0 0 1 7-7h9"></path></svg>';
const DEFAULT_TABLE_COLUMN_WIDTHS = {
  pitch_name: 5.8,
  pitch_id: 3.9,
  pitch_cent: 3.8,
  pitch_tags: 5.8,
  pitch_memo: 6.8,
  active_name: 5.8,
  active_id: 3.9,
  active_cent: 3.8,
  active_tags: 5.8,
  active_memo: 6.8,
  chord_name: 5.8,
  chord_id: 3.9,
  chord_root: 4.2,
  chord_tones: 6.8,
  chord_tags: 5.8,
  chord_memo: 6.9
};

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
    phaseMode: "reset",
    dismissedRuntimeNotice: false,
    dismissedPwaNotice: false,
    progressionCellWidth: 124,
    tableColumnWidths: { ...DEFAULT_TABLE_COLUMN_WIDTHS }
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
  workspaceMain: document.querySelector("main"),
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
  chordLibraryPanel: document.querySelector(".chord-library-panel"),
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
  phaseModeSelect: document.getElementById("phaseModeSelect"),
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
  importFileInput: document.getElementById("importFileInput"),
  retryPersistBtn: document.getElementById("retryPersistBtn"),
  retryAudioBtn: document.getElementById("retryAudioBtn"),
  persistenceStatus: document.getElementById("persistenceStatus"),
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
  chordPresetClickTimerId: null,
  selectedPitchPresetIds: new Set(),
  selectedChordPresetIds: new Set(),
  selectedActiveNoteIds: new Set(),
  pitchSort: { column: "name", direction: "asc" },
  chordSort: { column: "name", direction: "asc" },
  activeSort: { column: "name", direction: "asc" }
};
const pitchUi = {
  lastTouchedNoteId: null
};
const popoverUi = {
  active: "",
  pointerDown: false
};
const renderCache = Object.create(null);
const dataRevision = {
  pitch: 0,
  chord: 0,
  progression: 0,
  settings: 0
};
let persistDirty = false;
let persistRevision = 0;
let persistInFlight = null;
let persistTimerId = null;
let persistenceAuthorityReady = false;
let persistenceLoadError = null;
let audioFailureVisible = false;
const ROOT_BASS_TOKEN = "__root__";
const WORKSPACE_COLUMNS_STORAGE_KEY = "uchordbot.workspaceColumns.v1";
const VOLUME_ICON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9H4z"></path><path d="M16 9.5c1.2 1.2 1.2 3.8 0 5"></path><path d="M18.5 7c2.4 2.6 2.4 7.4 0 10"></path></svg>';
const MENU_ICON_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16"></path><path d="M4 12h16"></path><path d="M4 17h16"></path></svg>';

function invalidateRenderCache() {
  for (const key of Object.keys(renderCache)) {
    delete renderCache[key];
  }
}

function renderIfChanged(slot, key, run) {
  if (progressionUi.draggingPartId || progressionUi.pendingPointerId) {
    renderCache[slot] = key;
    run();
    return;
  }
  if (renderCache[slot] === key) return;
  renderCache[slot] = key;
  run();
}

function selectionKey(set) {
  return [...set].sort().join("|");
}

function isViewVisible(viewId) {
  return els.views.some((view) => view.id === viewId && view.classList.contains("active"));
}

function bumpAllDataRevisions() {
  dataRevision.pitch += 1;
  dataRevision.chord += 1;
  dataRevision.progression += 1;
  dataRevision.settings += 1;
}

function bumpDataRevisionForChange(type) {
  if (type === "json_import") {
    bumpAllDataRevisions();
    return;
  }

  const isProgressionChange =
    type.startsWith("update_progression_") ||
    type.startsWith("add_progression_") ||
    type.startsWith("rename_progression_") ||
    type.startsWith("delete_progression_") ||
    type.startsWith("reorder_progression_");

  const isPitchChange =
    type.includes("pitch") ||
    type.includes("active_note") ||
    [
      "clear_active_notes",
      "remove_active_note",
      "delete_active_notes",
      "load_chord_preset",
      "update_cent",
      "update_octave"
    ].includes(type);

  const isChordChange =
    type.includes("chord") ||
    type === "load_chord_preset";

  const isSettingsChange =
    type.startsWith("update_") ||
    type === "update_mode";

  if (isProgressionChange) {
    dataRevision.progression += 1;
  }

  if (isPitchChange) {
    dataRevision.pitch += 1;
  }

  if (isChordChange) {
    dataRevision.chord += 1;
  }

  if (isSettingsChange) {
    dataRevision.settings += 1;
  }
}

function markProjectDirty() {
  persistRevision += 1;
  persistDirty = true;
  if (!persistenceAuthorityReady) {
    setPersistenceStatus(persistenceLoadError ? "load-error" : "load-conflict", persistenceLoadError);
    return;
  }
  setPersistenceStatus("dirty");
  if (persistTimerId) clearTimeout(persistTimerId);
  persistTimerId = window.setTimeout(() => {
    persistTimerId = null;
    persistLoop().catch(() => {});
  }, 1200);
}

function tableWidthKey(kind, column) {
  return `${kind}_${column}`;
}

function normalizeTableColumnWidths(widths) {
  const normalized = { ...DEFAULT_TABLE_COLUMN_WIDTHS };
  if (!widths || typeof widths !== "object") {
    return normalized;
  }

  const legacyColumns = ["name", "id", "cent", "short", "root", "tones", "tags", "memo"];
  if (legacyColumns.some((column) => Object.hasOwn(widths, column))) {
    ["name", "cent", "tags", "memo"].forEach((column) => {
      const value = Number(widths[column]);
      if (!Number.isFinite(value)) return;
      normalized[tableWidthKey("pitch", column)] = value;
      normalized[tableWidthKey("active", column)] = value;
    });
    const idWidth = Number(widths.id);
    const shortWidth = Number(widths.short);
    const mergedIdWidth = Number.isFinite(idWidth) ? idWidth : shortWidth;
    if (Number.isFinite(mergedIdWidth)) {
      normalized.pitch_id = mergedIdWidth;
      normalized.active_id = mergedIdWidth;
      normalized.chord_id = mergedIdWidth;
    }
    const rootWidth = Number(widths.root);
    if (Number.isFinite(rootWidth)) normalized.chord_root = rootWidth;
    const tonesWidth = Number(widths.tones);
    if (Number.isFinite(tonesWidth)) normalized.chord_tones = tonesWidth;
  }

  Object.entries(widths).forEach(([key, value]) => {
    if (!Object.hasOwn(normalized, key)) return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    normalized[key] = numeric;
  });
  return normalized;
}

function getTableColumnWidth(kind, column) {
  const key = tableWidthKey(kind, column);
  return state.settings.tableColumnWidths?.[key] ?? DEFAULT_TABLE_COLUMN_WIDTHS[key] ?? 6;
}

function setLabelLead(input, text) {
  const label = input?.closest("label");
  if (!label) return;
  const firstText = [...label.childNodes].find((node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim());
  if (firstText) {
    firstText.textContent = text;
    return;
  }
  let lead = label.querySelector(":scope > .label-lead");
  if (!lead) {
    lead = document.createElement("span");
    lead.className = "label-lead";
    label.prepend(lead);
  }
  lead.textContent = text;
}

function ensureInlineIcon(label, className, svgMarkup) {
  if (!(label instanceof HTMLElement)) return null;
  let icon = label.querySelector(`:scope > .${className}`);
  if (!(icon instanceof HTMLElement)) {
    icon = document.createElement("span");
    icon.className = className;
    label.prepend(icon);
  }
  icon.innerHTML = svgMarkup;
  icon.setAttribute("aria-hidden", "true");
  return icon;
}

function ensureBulkBar(container, kind, fields) {
  if (!(container instanceof HTMLElement) || container.querySelector(`[data-bulk-kind="${kind}"]`)) return;
  const bar = document.createElement("div");
  bar.className = "bulk-edit-bar";
  bar.dataset.bulkKind = kind;
  const inputs = fields.map((field) => {
    const type = field.type || "text";
    const step = field.step ? ` step="${field.step}"` : "";
    const min = Number.isFinite(field.min) ? ` min="${field.min}"` : "";
    const max = Number.isFinite(field.max) ? ` max="${field.max}"` : "";
    return `<input type="${type}" class="bulk-edit-input" data-bulk-field="${field.name}" placeholder="${escapeHtml(field.placeholder || "")}"${step}${min}${max}>`;
  }).join("");
  bar.innerHTML = `
    <span class="bulk-edit-count" data-bulk-count></span>
    ${inputs}
    <button type="button" data-bulk-action="apply" data-kind="${kind}">一括適用</button>
    <button type="button" class="compact-danger" data-bulk-action="delete" data-kind="${kind}">選択削除</button>
    <button type="button" data-bulk-action="clear" data-kind="${kind}">選択解除</button>
  `;
  bar.hidden = true;
  bar.querySelector('[data-bulk-action="apply"]')?.replaceChildren(document.createTextNode("一括適用"));
  bar.querySelector('[data-bulk-action="delete"]')?.replaceChildren(document.createTextNode("選択削除"));
  bar.querySelector('[data-bulk-action="clear"]')?.remove();
  const anchor = container.querySelector(".preset-list, .scroll-list, #chordPresetList");
  if (anchor?.parentElement === container) {
    container.insertBefore(bar, anchor);
  } else {
    container.appendChild(bar);
  }
}

function ensureWorkspaceDom() {
  const brandTitle = document.querySelector(".brand-title");
  if (brandTitle) {
    brandTitle.setAttribute("aria-label", "μChordbot");
    brandTitle.textContent = "μ";
  }
  document.querySelector('[data-view="settings"]')?.remove();
  if (!document.getElementById("settingsMenuBtn")) {
    const menuBtn = document.createElement("button");
    menuBtn.id = "settingsMenuBtn";
    menuBtn.type = "button";
    menuBtn.className = "icon-button settings-menu-button";
    menuBtn.innerHTML = MENU_ICON_SVG;
    menuBtn.setAttribute("aria-label", "menu");
    document.querySelector(".history-buttons")?.appendChild(menuBtn);
  }
  const settingsView = document.getElementById("view-settings");
  const settingsMenuBtn = document.getElementById("settingsMenuBtn");
  if (settingsView && settingsMenuBtn && !document.getElementById("settingsDrawer")) {
    const drawer = document.createElement("div");
    drawer.id = "settingsDrawer";
    drawer.className = "settings-drawer";
    drawer.hidden = true;
    drawer.innerHTML = `
      <div class="settings-drawer-head">
        <strong>Menu</strong>
        <button id="settingsDrawerCloseBtn" type="button" class="icon-button" aria-label="close">x</button>
      </div>
      <nav class="settings-drawer-links" aria-label="menu links">
        <button type="button" data-menu-focus="settings">設定</button>
        <button type="button" data-menu-focus="help">ヘルプ</button>
        <button type="button" data-menu-focus="privacy">プライバシーポリシー</button>
      </nav>
      <div id="settingsDrawerBody" class="settings-drawer-body"></div>
      <section class="panel settings-placeholder" data-menu-panel="help">
        <h3>ヘルプ</h3>
        <p class="readout">操作方法や各機能の補足はここへ整理して追加します。常設説明文は増やさず、必要時の参照先として使います。</p>
      </section>
      <section class="panel settings-placeholder" data-menu-panel="privacy">
        <h3>プライバシーポリシー</h3>
        <p class="readout">外部送信や収集の有無、保存対象、ローカル保存の扱いなどをここへ明記します。現状はローカル利用前提です。</p>
      </section>
    `;
    document.body.appendChild(drawer);
    const body = drawer.querySelector("#settingsDrawerBody");
    [...settingsView.children].forEach((child) => body.appendChild(child));
    settingsView.remove();
  }
  const drawer = document.getElementById("settingsDrawer");
  drawer?.querySelector('[data-menu-focus="settings"]')?.replaceChildren(document.createTextNode("設定"));
  drawer?.querySelector('[data-menu-focus="help"]')?.replaceChildren(document.createTextNode("ヘルプ"));
  drawer?.querySelector('[data-menu-focus="privacy"]')?.replaceChildren(document.createTextNode("プライバシーポリシー"));
  const helpPanel = drawer?.querySelector('[data-menu-panel="help"]');
  if (helpPanel instanceof HTMLElement) {
    helpPanel.querySelector("h3")?.replaceChildren(document.createTextNode("ヘルプ"));
    helpPanel.querySelector(".readout")?.replaceChildren(document.createTextNode("操作説明と仕様メモをここへ追加します。常設説明は置かず、必要な導線だけこの中へまとめます。"));
  }
  const privacyPanel = drawer?.querySelector('[data-menu-panel="privacy"]');
  if (privacyPanel instanceof HTMLElement) {
    privacyPanel.querySelector("h3")?.replaceChildren(document.createTextNode("プライバシーポリシー"));
    privacyPanel.querySelector(".readout")?.replaceChildren(document.createTextNode("個人情報や保存データの扱いをここへ整理します。現状はローカル保存前提で、外部送信は行いません。"));
  }
  els.undoBtn.setAttribute("aria-label", "undo");
  els.redoBtn.setAttribute("aria-label", "redo");
  els.undoBtn.title = "元に戻す";
  els.redoBtn.title = "やり直す";
  els.undoBtn.classList.add("icon-button");
  els.redoBtn.classList.add("icon-button");
  els.undoBtn.innerHTML = UNDO_ICON_SVG;
  els.redoBtn.innerHTML = REDO_ICON_SVG;
  els.lineReadout?.remove();
  const masterIcon = document.querySelector(".master-volume-icon");
  if (masterIcon) {
    masterIcon.innerHTML = VOLUME_ICON_SVG;
  }
  drawer?.querySelector('[data-menu-focus="settings"]')?.replaceChildren(document.createTextNode("\u8a2d\u5b9a"));
  drawer?.querySelector('[data-menu-focus="help"]')?.replaceChildren(document.createTextNode("\u30d8\u30eb\u30d7"));
  drawer?.querySelector('[data-menu-focus="privacy"]')?.replaceChildren(document.createTextNode("\u30d7\u30e9\u30a4\u30d0\u30b7\u30fc\u30dd\u30ea\u30b7\u30fc"));
  helpPanel?.querySelector("h3")?.replaceChildren(document.createTextNode("\u30d8\u30eb\u30d7"));
  helpPanel?.querySelector(".readout")?.replaceChildren(document.createTextNode("\u64cd\u4f5c\u8aac\u660e\u3068\u4ed5\u69d8\u30e1\u30e2\u3092\u3053\u3053\u3078\u8ffd\u52a0\u3057\u307e\u3059\u3002\u5e38\u8a2d\u8aac\u660e\u306f\u7f6e\u304b\u305a\u3001\u5fc5\u8981\u306a\u5c0e\u7dda\u3060\u3051\u3053\u306e\u4e2d\u3078\u307e\u3068\u3081\u307e\u3059\u3002"));
  privacyPanel?.querySelector("h3")?.replaceChildren(document.createTextNode("\u30d7\u30e9\u30a4\u30d0\u30b7\u30fc\u30dd\u30ea\u30b7\u30fc"));
  privacyPanel?.querySelector(".readout")?.replaceChildren(document.createTextNode("\u500b\u4eba\u60c5\u5831\u3084\u4fdd\u5b58\u30c7\u30fc\u30bf\u306e\u6271\u3044\u3092\u3053\u3053\u3078\u6574\u7406\u3057\u307e\u3059\u3002\u73fe\u72b6\u306f\u30ed\u30fc\u30ab\u30eb\u4fdd\u5b58\u524d\u63d0\u3067\u3001\u5916\u90e8\u9001\u4fe1\u306f\u884c\u3044\u307e\u305b\u3093\u3002"));
  setLabelLead(els.octaveInput, "oct");
  setLabelLead(els.snapCentInput, "snap ¢");
  setLabelLead(els.centInput, "¢");
  setLabelLead(els.roundUnitInput, "round ¢");
  document.querySelector(".master-volume-inline")?.classList.add("hover-volume");
  const activeVolumeLabel = els.activeNotesVolumeInput?.closest("label");
  if (activeVolumeLabel) {
    activeVolumeLabel.classList.add("hover-volume", "active-notes-volume-inline", "icon-volume-inline");
    activeVolumeLabel.title = "現音高 音量";
    setLabelLead(els.activeNotesVolumeInput, "");
    ensureInlineIcon(activeVolumeLabel, "inline-volume-icon", VOLUME_ICON_SVG);
  }
  const waveformLabel = els.waveformSelect?.closest("label");
  const centRow = els.centInput?.parentElement;
  if (centRow) {
    centRow.className = "input-stepper";
    const buttonStack = centRow.querySelector(".input-stepper-buttons") || document.createElement("span");
    buttonStack.className = "input-stepper-buttons";
    buttonStack.append(els.centUpBtn, els.centDownBtn);
    centRow.replaceChildren(els.centInput, buttonStack);
    const chevronUp = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 10.5 8 5.5l5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const chevronDown = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 5.5 5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    if (els.centUpBtn) {
      els.centUpBtn.className = "stepper-button";
      els.centUpBtn.innerHTML = chevronUp;
      els.centUpBtn.setAttribute("aria-label", "cent up");
    }
    if (els.centDownBtn) {
      els.centDownBtn.className = "stepper-button";
      els.centDownBtn.innerHTML = chevronDown;
      els.centDownBtn.setAttribute("aria-label", "cent down");
    }
  }
  const sustainLabel = els.sustainModeInput?.closest("label");
  if (sustainLabel) {
    sustainLabel.querySelector("span")?.replaceChildren(document.createTextNode("持続"));
    sustainLabel.querySelector('[aria-hidden="true"]')?.remove();
    sustainLabel.title = `持続: ${els.sustainModeInput?.checked ? "ON" : "OFF"}`;
  }
  setLabelLead(els.octaveInput, "oct");
  setLabelLead(els.snapCentInput, "snap ¢");
  setLabelLead(els.centInput, "¢");
  setLabelLead(els.roundUnitInput, "丸め ¢");
  if (waveformLabel) {
    setLabelLead(els.waveformSelect, "波形");
  }
  if (els.waveformSelect && waveformLabel && !document.getElementById("waveformButtonGroup")) {
    const group = document.createElement("div");
    group.id = "waveformButtonGroup";
    group.className = "waveform-button-group";
    const icons = {
      sine: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M3 16c4.5-10 8.5-10 13 0s8.5 10 13 0" /></svg>',
      square: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 22V10h10v12h14" /></svg>',
      sawtooth: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M4 24 14 8v16L28 8" /></svg>'
    };
    [
      ["sine", icons.sine],
      ["square", icons.square],
      ["sawtooth", icons.sawtooth]
    ].forEach(([value, icon]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.waveform = value;
      button.innerHTML = icon;
      button.ariaLabel = value;
      group.appendChild(button);
    });
    waveformLabel.classList.add("waveform-native-label");
    waveformLabel.after(group);
  }
  if (els.chordLibraryPanel && els.progressionView && els.chordLibraryPanel.parentElement !== els.progressionView) {
    els.progressionView.appendChild(els.chordLibraryPanel);
  }
  const libraryDetails = document.getElementById("chordLibraryDetails");
  if (libraryDetails && window.matchMedia("(max-width: 640px)").matches) {
    libraryDetails.open = false;
  }
  document.querySelectorAll("#view-settings .panel-heading h3").forEach((node, index) => {
    node.textContent = ["Runtime / PWA", "一覧幅", "丸め / 再生", "保存 / 読込"][index] || node.textContent;
  });
  document.querySelector(".active-notes-panel .library-block strong")?.replaceChildren(document.createTextNode("現音高"));
  setLabelLead(els.presetNameWidthInput, "名前 rem");
  setLabelLead(els.presetCentWidthInput, "¢ rem");
  setLabelLead(els.presetShortWidthInput, "ID rem");
  setLabelLead(els.presetTagWidthInput, "タグ rem");
  setLabelLead(els.presetMemoWidthInput, "メモ rem");
  setLabelLead(els.progressionCellWidthInput, "コード候補幅 px");
  setLabelLead(els.a4HzInput, "A4 Hz");
  setLabelLead(els.bpmInput, "BPM");
  setLabelLead(els.phaseModeSelect, "位相");
  setLabelLead(els.roundUnitInput, "丸め ¢");
  setLabelLead(els.roundingModeSelect, "丸め");
  if (els.pitchPresetFilterInput) {
    const pitchPresetBlock = els.pitchPresetFilterInput.closest(".library-block");
    const head = pitchPresetBlock?.querySelector(".library-block-head");
    if (head && els.pitchPresetFilterInput.parentElement !== head) {
      head.querySelector(".panel-note")?.remove();
      head.appendChild(els.pitchPresetFilterInput);
    }
    ensureBulkBar(pitchPresetBlock, "pitch", [
      { name: "tags", placeholder: "タグ一括変更" },
      { name: "memo", placeholder: "メモ一括変更" }
    ]);
  }
  if (els.activeNotesFilterInput) {
    const activeBlock = els.activeNotesFilterInput.closest(".library-block");
    ensureBulkBar(activeBlock, "active", [
      { name: "centDelta", placeholder: "¢ += 0.00", type: "number", step: "0.01", min: -1200, max: 1200 }
    ]);
  }
  if (els.chordTagFilterInput) {
    ensureBulkBar(els.chordLibraryPanel, "chord", [
      { name: "tags", placeholder: "タグ一括変更" },
      { name: "memo", placeholder: "メモ一括変更" }
    ]);
  }
  if (!els.workspaceMain) return;
  if (!els.workspaceMain.querySelector('[data-workspace-resizer="pitch-progression"]')) {
    const resizer = document.createElement("div");
    resizer.className = "workspace-resizer workspace-resizer-left";
    resizer.dataset.workspaceResizer = "pitch-progression";
    resizer.role = "separator";
    resizer.ariaOrientation = "vertical";
    resizer.ariaLabel = "音高領域とコード進行領域の幅";
    els.workspaceMain.appendChild(resizer);
  }
}

function restoreWorkspaceColumns() {
  try {
    const saved = JSON.parse(localStorage.getItem(WORKSPACE_COLUMNS_STORAGE_KEY) || "null");
    if (!saved || typeof saved !== "object") return;
    if (Number.isFinite(saved.left)) {
      document.documentElement.style.setProperty("--workspace-left-col", `${saved.left}px`);
    }
  } catch {
    // keep CSS defaults
  }
}

function saveWorkspaceColumns(left) {
  localStorage.setItem(WORKSPACE_COLUMNS_STORAGE_KEY, JSON.stringify({ left }));
}

function parseCssPixel(value, fallback) {
  const parsed = Number(String(value || "").replace("px", ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readWorkspaceColumns(totalWidth) {
  const style = getComputedStyle(document.documentElement);
  const left = parseCssPixel(style.getPropertyValue("--workspace-left-col"), totalWidth * 0.31);
  return { left };
}

function attachWorkspaceResizers() {
  if (!els.workspaceMain) return;
  els.workspaceMain.addEventListener("pointerdown", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    const resizer = target.closest("[data-workspace-resizer]");
    if (!(resizer instanceof HTMLElement)) return;
    if (resizer.dataset.workspaceResizer !== "pitch-progression") return;
    const rect = els.workspaceMain.getBoundingClientRect();
    const minLeft = 280;
    const minRight = 480;
    const dividerWidth = 8;
    document.body.classList.add("workspace-resizing");
    resizer.setPointerCapture?.(ev.pointerId);
    const move = (moveEv) => {
      const x = clamp(moveEv.clientX - rect.left, minLeft, rect.width - minRight - dividerWidth);
      const nextLeft = x;
      document.documentElement.style.setProperty("--workspace-left-col", `${Math.round(nextLeft)}px`);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
      document.body.classList.remove("workspace-resizing");
      const current = readWorkspaceColumns(rect.width);
      saveWorkspaceColumns(Math.round(current.left));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
  });
}

function attachTableColumnResizers() {
  document.addEventListener("pointerdown", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    const handle = target.closest(".column-resize-handle");
    if (!(handle instanceof HTMLElement)) return;
    ev.preventDefault();
    ev.stopPropagation();
    const column = handle.dataset.column || "";
    const tableKind = handle.dataset.tableKind || handle.closest("table")?.dataset.tableKind || "pitch";
    const cssVar = cssVarForTableColumn(tableKind, column);
    if (!cssVar) return;
    const th = handle.closest("th");
    const startWidth = th?.getBoundingClientRect().width || 80;
    const startX = ev.clientX;
    document.body.classList.add("workspace-resizing");
    const move = (moveEv) => {
      const px = clamp(startWidth + (moveEv.clientX - startX), 36, 420);
      document.documentElement.style.setProperty(cssVar, `${Math.round(px)}px`);
    };
    const cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", cleanup);
      window.removeEventListener("pointercancel", cleanup);
      document.body.classList.remove("workspace-resizing");
      const px = parseCssPixel(getComputedStyle(document.documentElement).getPropertyValue(cssVar), startWidth);
      const rootFontSize = parseCssPixel(getComputedStyle(document.documentElement).fontSize, 16);
      state.settings.tableColumnWidths[tableWidthKey(tableKind, column)] = Math.round((px / rootFontSize) * 10) / 10;
      markProjectDirty();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", cleanup);
    window.addEventListener("pointercancel", cleanup);
  });
}

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
    "このアプリは <code>localhost</code> または <code>127.0.0.1</code> の HTTP サーバーで開いてください。<br>" +
    "例: <code>python -m http.server 5173</code> を実行し、<code>http://localhost:5173/</code> を開いてください。<br>" +
    "<code>file://</code> 直開きでは ES Modules や Service Worker が正しく動作しません。"
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
    : "通常動作中";
  const pwaText = els.pwaPromptMessage?.textContent?.trim() || "PWA案内なし";
  els.runtimeInfoText.textContent = `${runtimeLabel} / notice: ${bannerText} / pwa: ${pwaText}`;
}

function applyLayoutSettings() {
  ["pitch", "active", "chord"].forEach((kind) => {
    ["name", "id", "cent", "short", "root", "tones", "tags", "memo"].forEach((column) => {
      const key = tableWidthKey(kind, column);
      if (!Object.hasOwn(DEFAULT_TABLE_COLUMN_WIDTHS, key)) return;
      document.documentElement.style.setProperty(`--${kind}-${column}-col`, `${getTableColumnWidth(kind, column)}rem`);
    });
  });
  // Legacy persisted progressionCellWidth is the chord-choice tile width, not a progression column width.
  document.documentElement.style.setProperty("--chord-choice-width", `${state.settings.progressionCellWidth || 124}px`);
  document.documentElement.style.setProperty("--progression-columns", `${clamp(Number(state.progression.columns) || 4, 1, 12)}`);
}

function buildPresetColGroup(columns) {
  const colgroup = document.createElement("colgroup");
  columns.forEach((column) => {
    const col = document.createElement("col");
    col.className = `col-${column}`;
    col.dataset.column = column;
    colgroup.appendChild(col);
  });
  return colgroup;
}

function enhancePresetTable(table, kind) {
  if (!table) return;
  table.classList.add("data-table");
  table.dataset.tableKind = kind;
  const cols = [...table.querySelectorAll("colgroup col")].map((col) => col.dataset.column || "");
  table.querySelectorAll("thead th").forEach((th, index) => {
    const column = cols[index];
    if (!column || th.querySelector(".column-resize-handle")) return;
    th.dataset.column = column;
    th.dataset.tableKind = kind;
    const handle = document.createElement("span");
    handle.className = "column-resize-handle";
    handle.dataset.column = column;
    handle.dataset.tableKind = kind;
    th.appendChild(handle);
  });
}

function syncTableSelectAll(table, kind, selectedSet, visibleIds) {
  const input = table?.querySelector(`[data-select-all="${kind}"]`);
  if (!(input instanceof HTMLInputElement)) return;
  const ids = visibleIds.filter(Boolean);
  const selectedCount = ids.filter((id) => selectedSet.has(id)).length;
  input.checked = ids.length > 0 && selectedCount === ids.length;
  input.indeterminate = selectedCount > 0 && selectedCount < ids.length;
}

function cssVarForTableColumn(kind, column) {
  if (column === "select" || column === "remove" || column === "actions") return "";
  const key = tableWidthKey(kind, column);
  if (!Object.hasOwn(DEFAULT_TABLE_COLUMN_WIDTHS, key)) return "";
  return `--${kind}-${column}-col`;
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
  return cloneProjectStateSnapshot(state);
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

function setPersistenceStatus(status, error = null) {
  const view = getPersistenceStatus(status, error);
  setStatus(els.persistenceStatus, view.message, view.tone);
  if (els.retryPersistBtn) {
    els.retryPersistBtn.hidden = !view.retry;
  }
}

function setAudioFailure(error) {
  if (!audioFailureVisible) {
    setStatus(els.manageStatus, getAudioFailureMessage(error), "error");
  }
  audioFailureVisible = true;
  if (els.retryAudioBtn) {
    els.retryAudioBtn.hidden = false;
  }
}

function clearAudioFailure() {
  if (!audioFailureVisible) return;
  audioFailureVisible = false;
  if (els.retryAudioBtn) {
    els.retryAudioBtn.hidden = true;
  }
  setStatus(els.manageStatus, "音声を再生できる状態です。", "success");
}

async function startVoiceWithFeedback(...args) {
  try {
    await audio.startVoice(...args);
    return true;
  } catch (error) {
    setAudioFailure(error);
    return false;
  }
}

function absoluteMicroStep(note) {
  return (note.octave * OCTAVE_MICROSTEP) + note.microStepInOctave;
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

function pitchPresetDisplayId(preset) {
  if (!preset) return "";
  const short = String(preset.shortName || "").trim();
  if (short && !/^PITCH_/i.test(short)) return short;
  const rawId = String(preset.id || "").trim();
  const match = rawId.match(/^PITCH_([^_]+)/i);
  if (match) return match[1];
  return short || rawId;
}

function chordPresetDisplayId(chord) {
  if (!chord) return "";
  const short = String(chord.shortName || "").trim();
  if (short && !/^CHORD_/i.test(short)) return short;
  const rawId = String(chord.id || "").trim();
  const match = rawId.match(/^CHORD_(.+)$/i);
  if (match) return match[1];
  return short || chord.name || rawId;
}

function defaultRootPreset() {
  return sortedPitchPresets().find(isRootLikePreset) || sortedPitchPresets()[0] || null;
}

function defaultRootPresetId() {
  return defaultRootPreset()?.id || "";
}

function sortedPitchPresets() {
  return sortByColumn(state.pitchPresets, presetUi.pitchSort, (preset, column) => {
    if (column === "id") return pitchPresetDisplayId(preset);
    if (column === "cent") return Number(preset.cent) || 0;
    if (column === "tags") return (preset.tags || []).join(", ");
    if (column === "memo") return preset.memo || "";
    return preset.name || preset.id || "";
  });
}

function sortedChordPresets() {
  return sortByColumn(state.chordPresets, presetUi.chordSort, (chord, column) => {
    if (column === "id") return chordPresetDisplayId(chord);
    if (column === "root") return chord.baseRoot?.noteText || chord.baseRoot?.pitchPresetId || "";
    if (column === "tones") return (chord.tones || []).length;
    if (column === "tags") return (chord.tags || []).join(", ");
    if (column === "memo") return chord.memo || "";
    return chord.name || chord.id || "";
  });
}

function filteredPitchPresets(filterText) {
  const normalized = normalizeFilterText(filterText);
  const presets = sortedPitchPresets();
  if (!normalized) return presets;
  return presets.filter((preset) => {
    const tags = Array.isArray(preset.tags) ? preset.tags.join(" ").toLowerCase() : "";
    const haystack = `${preset.id} ${pitchPresetDisplayId(preset)} ${preset.name} ${preset.memo || ""} ${tags}`.toLowerCase();
    return haystack.includes(normalized);
  });
}

function filteredActiveNotes(filterText) {
  const normalized = normalizeFilterText(filterText);
  const notes = sortByColumn(state.activeNotes, presetUi.activeSort, (note, column) => {
    const preset = findPitchPresetByMicroStep(note.microStepInOctave);
    if (column === "id") return preset?.id || "";
    if (column === "cent") return Number(note.cent) || 0;
    if (column === "tags") return (preset?.tags || []).join(", ");
    if (column === "memo") return preset?.memo || "";
    return preset?.name || note.id || "";
  });
  if (!normalized) return notes;
  return notes.filter((note, index) => {
    const preset = findPitchPresetByMicroStep(note.microStepInOctave);
    const tags = Array.isArray(preset?.tags) ? preset.tags.join(" ").toLowerCase() : "";
    const haystack = [
      note.id,
      describeNoteTitle(note, index),
      preset?.name || "",
      pitchPresetDisplayId(preset),
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
    const haystack = `${chord.id} ${chordPresetDisplayId(chord)} ${chord.name} ${chord.memo || ""} ${tags}`.toLowerCase();
    return haystack.includes(normalized);
  });
}

function buildNoteId(octave, microStepInOctave) {
  return `note:${octave}:${microStepInOctave}`;
}

function buildProjectPayloadForSave() {
  return createProjectPayload(state);
}

function buildProgressionPayloadForSave() {
  return createProgressionPayload(state);
}

function buildLibraryPayloadForSave() {
  return createLibraryPayload(state);
}

function findPitchPresetById(id) {
  return state.pitchPresets.find((preset) => preset.id === id) || null;
}

function findPitchPresetByMicroStep(microStep) {
  return state.pitchPresets.find((preset) => preset.microStep === microStep) || null;
}

function migratePitchScaleInState(document = null) {
  const encoding = document ? detectPitchEncoding(document) : "unknown";
  migratePitchScaleState(state, { microStepToCent, centToMicroStep, normalizePitch, OCTAVE_MICROSTEP }, {
    encoding
  });
  return encoding === "cent-x3";
}

function formatCent(value) {
  return `${formatDecimal(value)} cent`;
}

function formatMicroStep(value) {
  return `ms ${Math.round(Number(value) || 0)}`;
}

function formatPresetDisplayName(preset) {
  if (!preset) return "";
  return preset.name || pitchPresetDisplayId(preset) || preset.id || "";
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
  return Math.max(0.01, snap > 0 ? snap / 10 : 0.01);
}

function coarseDragStepCent() {
  return Math.max(0, Number(state.settings.snapCent) || 0);
}

function quantizeCent(value, step) {
  const unit = Math.max(0, Number(step) || 0);
  if (unit <= 0) return Number(value) || 0;
  return Math.round((Number(value) || 0) / unit) * unit;
}

function quantizeDraggedAbsoluteCent(baseAbsoluteCent, rawDeltaCent, fine = false) {
  const step = fine ? fineDragStepCent() : coarseDragStepCent();
  return quantizeCent(Number(baseAbsoluteCent) + Number(rawDeltaCent), step);
}

function pitchTransientRenderKey() {
  return [
    state.pitchDraft.octave,
    state.pitchDraft.microStepInOctave,
    pitchUi.lastTouchedNoteId || ""
  ].join("|");
}

function pitchLineRenderKey() {
  return [
    pitchTransientRenderKey(),
    audio.hasVoice(MOMENTARY_VOICE_ID) ? 1 : 0,
    audio.hasVoice(DRAG_PREVIEW_VOICE_ID) ? 1 : 0
  ].join("|");
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
  els.progBassPopoverBtn?.setAttribute("aria-expanded", popoverUi.active === "bass" ? "true" : "false");
  els.progInversionPopoverBtn?.setAttribute("aria-expanded", popoverUi.active === "inversion" ? "true" : "false");
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

function syncPitchControlsFromState() {
  els.octaveInput.value = state.pitchDraft.octave;
  els.snapCentInput.value = formatDecimal(state.settings.snapCent);
  els.centInput.value = formatDecimal(state.pitchDraft.cent);
  els.microStepInput.value = state.pitchDraft.microStepInOctave;
}

function renderPitchDuringInteraction() {
  syncPitchControlsFromState();
  renderLine();
}

function syncProgressionFormFromState() {
  state.progression.columns = clamp(Number(state.progression.columns) || 4, 1, 12);
  const rootParts = rootEditorParts();
  els.progRootNoteInput.value = `${rootParts.letter}${rootParts.accidental}`;
  if (els.progRootOctaveInput) els.progRootOctaveInput.value = rootParts.octave;
  els.progColumnsSelect.value = String(state.progression.columns);
  if (els.progChunkSelect) {
    const current = chunkContextForPartId(currentProgressionAnchorId());
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
  if (els.progSectionNameInput) els.progSectionNameInput.value = state.progressionEditor.sectionName || "";
  renderProgressionChordButtons();
  renderProgressionEditorButtons();
  els.addProgPartBtn.textContent = state.progression.selectedPartId ? "後ろに挿入" : "追加";
  if (els.addProgChunkBtn) els.addProgChunkBtn.disabled = !state.progressionEditor.chordId;
  if (els.addProgSectionBtn) els.addProgSectionBtn.disabled = !state.progressionEditor.chordId;
  els.deleteProgPartBtn.disabled = !state.progression.selectedPartId;
  els.progPrevBtn.disabled = state.progression.parts.length === 0;
  els.progNextBtn.disabled = state.progression.parts.length === 0;
  els.playProgBtn.disabled = state.progression.parts.length === 0;
  els.playProgBtn.textContent = state.progression.playingPartId ? "一時停止" : "再生";
  els.stopProgBtn.disabled = !state.progression.playingPartId;
  els.stopProgBtn.textContent = "停止";
  syncProgressionLayoutState();
}

async function syncAudioToActiveNotes() {
  audio.stopVoice(MOMENTARY_VOICE_ID);
  audio.stopVoice(DRAG_PREVIEW_VOICE_ID);

  const activeIds = new Set(state.activeNotes.map((note) => note.id));
  for (const note of state.activeNotes) {
    const playback = activeNotePlaybackPosition(note);
    const started = await startVoiceWithFeedback(
      note.id,
      frequencyFromPitch(state.settings.a4Hz, playback.octave, playback.microStepInOctave),
      state.settings.waveform,
      state.settings.activeNotesVolume
    );
    if (!started) {
      getActiveVoiceIdsForFailureCleanup(state.activeNotes).forEach((voiceId) => audio.stopVoice(voiceId));
      return false;
    }
  }

  for (const [voiceId] of audio.voices) {
    if (!activeIds.has(voiceId)) {
      audio.stopVoice(voiceId);
    }
  }
  clearAudioFailure();
  return true;
}

async function refreshAudibleVoices() {
  const playingId = state.progression.playingPartId;
  const previewing = Boolean(progressionPreviewTimerId);
  const selectedPart = state.progression.parts.find((part) => part.id === state.progression.selectedPartId) || null;
  const synced = await syncAudioToActiveNotes();
  if (!synced) return false;
  if (playingId) {
    const part = state.progression.parts.find((item) => item.id === playingId);
    const partIndex = state.progression.parts.findIndex((item) => item.id === playingId);
    if (part && partIndex >= 0) {
      return playProgressionPart(part, partIndex);
    }
  }
  if (previewing && selectedPart) {
    return previewProgressionPart(selectedPart);
  }
  return true;
}

async function updateWaveformSetting(nextWaveform) {
  const waveform = String(nextWaveform || "…27782 tokens truncated…or.chordId = chordId;
    syncProgressionSelectionFromEditor("進行セルのコード変更", true);
  });
  els.chordTagFilterInput.addEventListener("input", () => {
    if (els.chordTagFilterInput.value.trim()) {
      const details = document.getElementById("chordLibraryDetails");
      if (details) details.open = true;
    }
    render();
  });
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

  const bindWidthInput = (input, key, min, max, fallback, kinds = ["pitch"]) => {
    input?.addEventListener("input", () => {
      const next = clamp(Number(input.value) || fallback, min, max);
      kinds.forEach((kind) => {
        state.settings.tableColumnWidths[tableWidthKey(kind, key)] = next;
      });
      applyLayoutSettings();
      markProjectDirty();
      render();
    });
  };
  bindWidthInput(els.presetNameWidthInput, "name", 3.8, 24, DEFAULT_TABLE_COLUMN_WIDTHS.pitch_name, ["pitch", "active"]);
  bindWidthInput(els.presetCentWidthInput, "cent", 3.2, 10, DEFAULT_TABLE_COLUMN_WIDTHS.pitch_cent, ["pitch", "active"]);
  bindWidthInput(els.presetShortWidthInput, "id", 3.2, 12, DEFAULT_TABLE_COLUMN_WIDTHS.pitch_id, ["pitch", "active"]);
  bindWidthInput(els.presetTagWidthInput, "tags", 3.8, 18, DEFAULT_TABLE_COLUMN_WIDTHS.pitch_tags, ["pitch", "active"]);
  bindWidthInput(els.presetMemoWidthInput, "memo", 4.2, 20, DEFAULT_TABLE_COLUMN_WIDTHS.pitch_memo, ["pitch", "active"]);
  els.progressionCellWidthInput?.addEventListener("input", () => {
    state.settings.progressionCellWidth = clamp(Number(els.progressionCellWidthInput.value) || 124, 88, 220);
    applyLayoutSettings();
    markProjectDirty();
    render();
  });
  els.activeNotesList.addEventListener("click", (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.closest('input[type="checkbox"], input, textarea, select')) return;
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
    if (target.closest("input, textarea, button")) return;
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
    if (target.closest("input, textarea, button, select")) return;
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
  let lastPitchTouchTap = null;
  const pitchTapMaxDelayMs = 360;
  const pitchTapMaxDistancePx = 28;
  let pitchDragFrame = null;
  const schedulePitchDragFrame = () => {
    if (pitchDragFrame !== null) return;
    pitchDragFrame = window.requestAnimationFrame(() => {
      pitchDragFrame = null;
      void applyDragPitch(false);
    });
  };
  const flushPitchDragFrame = () => {
    if (pitchDragFrame === null) return;
    window.cancelAnimationFrame(pitchDragFrame);
    pitchDragFrame = null;
  };
  canvas.addEventListener("pointerdown", async (ev) => {
    if (dragContext) return;
    const x = canvasXFromPointerEvent(canvas, ev);
    const hitNote = hitActiveNoteOnLine(canvas, ev.clientX, ev.clientY);
    // Resolve double touch directly; iOS canvas dblclick is not reliable.
    if (ev.pointerType === "touch" && hitNote && lastPitchTouchTap &&
        lastPitchTouchTap.noteId === hitNote.id &&
        ev.timeStamp - lastPitchTouchTap.at <= pitchTapMaxDelayMs &&
        Math.hypot(ev.clientX - lastPitchTouchTap.x, ev.clientY - lastPitchTouchTap.y) <= pitchTapMaxDistancePx) {
      ev.preventDefault();
      lastPitchTouchTap = null;
      removeActiveNote(hitNote.id);
      return;
    }
    if (ev.pointerType === "touch") lastPitchTouchTap = null;
    if (hitNote) {
      syncDraftFromNote(hitNote);
      rememberActiveNote(hitNote.id);
      // Audition the moved note through a separate voice; do not double-sound its original.
      audio.setVoiceGain(hitNote.id, 0, 0.01);
      const baseAbsoluteCent = microStepToCent(absoluteMicroStep(hitNote));
      dragContext = {
        mode: "active-note",
        before: snapshotState(),
        noteId: hitNote.id,
        baseAbsoluteCent: quantizeCent(baseAbsoluteCent, ev.ctrlKey || ev.metaKey ? fineDragStepCent() : coarseDragStepCent()),
        pointerStartX: x,
        virtualX: x,
        lastCanvasX: x,
        fine: ev.ctrlKey || ev.metaKey || ev.pointerType === "touch",
        slow: ev.ctrlKey || ev.metaKey,
        pointerType: ev.pointerType,
        tapX: ev.clientX,
        tapY: ev.clientY,
        tapStartTime: ev.timeStamp
      };
    } else {
      dragContext = {
        mode: "draft",
        before: snapshotState(),
        baseOctave: state.pitchDraft.octave,
        lastCanvasX: x,
        virtualX: x,
        pointerType: ev.pointerType,
        tapX: ev.clientX,
        tapY: ev.clientY,
        tapStartTime: ev.timeStamp
      };
    }
    dragContext.pointerId = ev.pointerId;
    canvas.setPointerCapture(ev.pointerId);
    await applyDragPitch(false);
  });

  canvas.addEventListener("pointermove", (ev) => {
    if (!dragContext || dragContext.pointerId !== ev.pointerId) return;
    const x = canvasXFromPointerEvent(canvas, ev);
    if (dragContext.mode === "active-note") {
      dragContext.virtualX += x - dragContext.lastCanvasX;
      dragContext.lastCanvasX = x;
      dragContext.fine = ev.ctrlKey || ev.metaKey || dragContext.pointerType === "touch";
      dragContext.slow = ev.ctrlKey || ev.metaKey;
    } else {
      dragContext.virtualX += x - dragContext.lastCanvasX;
      dragContext.lastCanvasX = x;
    }
    schedulePitchDragFrame();
  });

  canvas.addEventListener("pointerup", async (ev) => {
    if (!dragContext || dragContext.pointerId !== ev.pointerId) return;
    flushPitchDragFrame();
    const x = canvasXFromPointerEvent(canvas, ev);
    if (dragContext.mode === "active-note") {
      dragContext.virtualX += x - dragContext.lastCanvasX;
      dragContext.lastCanvasX = x;
      dragContext.fine = ev.ctrlKey || ev.metaKey || dragContext.pointerType === "touch";
      dragContext.slow = ev.ctrlKey || ev.metaKey;
    } else {
      dragContext.virtualX += x - dragContext.lastCanvasX;
      dragContext.lastCanvasX = x;
    }
    const completedDrag = dragContext;
    const wasTap = completedDrag.pointerType === "touch" &&
      ev.timeStamp - completedDrag.tapStartTime <= pitchTapMaxDelayMs &&
      Math.hypot(ev.clientX - completedDrag.tapX, ev.clientY - completedDrag.tapY) <= 12;
    await applyDragPitch(true);
    if (dragContext.mode === "active-note") {
      const source = findActiveNoteById(completedDrag.noteId);
      const candidate = completedDrag.candidate;
      const targetId = candidate ? buildNoteId(candidate.octave, candidate.microStepInOctave) : "";
      const collision = targetId && targetId !== completedDrag.noteId && findActiveNoteById(targetId);
      audio.stopVoice(DRAG_PREVIEW_VOICE_ID);
      if (source && candidate && !collision) {
        source.octave = candidate.octave;
        source.microStepInOctave = candidate.microStepInOctave;
        source.cent = candidate.cent;
        source.id = targetId;
        rememberActiveNote(source.id);
        syncDraftFromNote(source);
        const after = snapshotState();
        trackStateChange("active_note_drag", "現音高ドラッグ", completedDrag.before, after);
      } else if (collision) {
        // Never delete another active note as a side effect of dragging.
        syncDraftFromNote(source);
      }
      dragContext = null;
      syncFormFromState();
      render();
      await syncAudioToActiveNotes();
    } else if (state.settings.playMode === "momentary") {
      audio.stopVoice(MOMENTARY_VOICE_ID);
      const after = snapshotState();
      trackStateChange("pitch_drag_commit", "音高ドラッグ確定", dragContext.before, after);
      syncFormFromState();
      render();
    } else {
      syncFormFromState();
      render();
    }
    lastPitchTouchTap = wasTap && completedDrag.mode === "active-note"
      ? { noteId: findActiveNoteById(completedDrag.noteId)?.id || buildNoteId(completedDrag.candidate?.octave ?? 0, completedDrag.candidate?.microStepInOctave ?? 0), at: ev.timeStamp, x: ev.clientX, y: ev.clientY }
      : null;
    dragContext = null;
  });

  canvas.addEventListener("pointercancel", (ev) => {
    if (!dragContext || dragContext.pointerId !== ev.pointerId) return;
    flushPitchDragFrame();
    if (dragContext.mode === "active-note") {
      const source = findActiveNoteById(dragContext.noteId);
      if (source) {
        syncDraftFromNote(source);
        audio.setVoiceGain(source.id, state.settings.activeNotesVolume, 0.02);
      }
    }
    dragContext = null;
    lastPitchTouchTap = null;
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
    syncWorkspaceViewState();
    syncProgressionLayoutState();
    invalidateRenderCache();
    render();
  });

  els.exportBtn.addEventListener("click", exportProject);
  els.exportLibraryBtn.addEventListener("click", exportLibrary);
  els.progExportBtn?.addEventListener("click", exportProgressionProject);
  els.progImportFileInput?.addEventListener("change", () => {
    void handleImportFileInput(els.progImportFileInput);
  });
  els.runtimeRefreshBtn?.addEventListener("click", () => {
    showRuntimeNotice("キャッシュを更新中です。完了後に自動で再読込される場合があります。", "info");
    void forceRefreshApplication();
  });
  els.importFileInput.addEventListener("change", () => {
    void handleImportFileInput(els.importFileInput);
  });
  els.retryPersistBtn?.addEventListener("click", () => {
    void retryPersistence().catch(() => {});
  });
  els.retryAudioBtn?.addEventListener("click", () => {
    void refreshAudibleVoices().catch((error) => {
      setAudioFailure(error);
    });
  });
}

function classifyRuntime() {
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;

  if (protocol === "file:") {
    showRuntimeWarning(
      "このアプリは <code>file://</code> 直開きでは正しく動作しません。<br>" +
      "PC では <code>python -m http.server 5173</code> を実行し、<code>http://localhost:5173/</code> を開いてください。<br>" +
      "PWA 確認や LAN 共有は HTTPS 公開 URL で行ってください。"
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
      "LAN URL では基本動作を確認できますが、PWA インストールや Service Worker の最終確認には向きません。<br>" +
      "同一 Wi-Fi 内の共有確認に使い、PWA 実機確認は HTTPS 公開 URL で行ってください。",
      "info"
    );
    return { mode: "lan", protocol, hostname, swAllowed: false };
  }

  if (protocol === "http:") {
    showRuntimeNotice(
      "HTTP の通常 URL です。PC 確認は <code>localhost</code>、LAN 共有や PWA 実機確認は HTTPS 公開 URL を使ってください。",
      "info"
    );
    return { mode: "http", protocol, hostname, swAllowed: false };
  }

  showRuntimeWarning(
    "現在の URL では動作保証できません。<br>" +
    "PC では <code>http://localhost:5173/</code>、LAN 共有や PWA 実機確認は HTTPS 公開 URL を使ってください。"
  );
  clearRuntimeWarningTone();
  return { mode: "unknown", protocol, hostname, swAllowed: false };
}

function renderPwaPrompt() {
  if (!els.pwaPrompt || !els.pwaPromptMessage || !els.installPwaBtn || !runtimeState) return;

  let message = "";
  let showButton = false;

  if (runtimeState.mode === "lan") {
    message = "同一 Wi-Fi 内の共有確認向けです。PWA インストールや最終確認は HTTPS 公開 URL で行ってください。";
  } else if (runtimeState.mode === "localhost") {
    message = "PC 開発モードです。実機確認は LAN URL、PWA インストールは HTTPS 公開 URL で行ってください。";
  } else if (runtimeState.mode === "https") {
    if (isStandaloneDisplay()) {
      message = "PWA モードで起動中です。";
    } else if (deferredInstallPrompt) {
      message = "この HTTPS URL では PWA をインストールできます。";
      showButton = true;
    } else if (isIosLike()) {
      message = "iPhone / iPad は Safari の共有メニューからホーム画面へ追加してください。";
    } else {
      message = "HTTPS で動作中です。必要ならインストール案内を確認してください。";
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
  state.settings.tableColumnWidths = normalizeTableColumnWidths(state.settings.tableColumnWidths);
  normalizePitchPresetIdentity();
  normalizeChordPresetIdentity();
  state.settings.progressionCellWidth = Number(state.settings.progressionCellWidth) || 124;
  state.settings.phaseMode = state.settings.phaseMode === "continue" ? "continue" : "reset";
  state.settings.dismissedRuntimeNotice = Boolean(state.settings.dismissedRuntimeNotice);
  state.settings.dismissedPwaNotice = Boolean(state.settings.dismissedPwaNotice);
  applyLayoutSettings();
  if (typeof audio.setPhaseMode === "function") {
    audio.setPhaseMode(state.settings.phaseMode);
  } else {
    audio.phaseMode = state.settings.phaseMode;
  }
  syncPitchControlsFromState();
  els.sustainModeInput.checked = state.settings.playMode === "toggle";
  els.sustainModeInput.closest("label")?.setAttribute("title", `\u6301\u7d9a: ${els.sustainModeInput.checked ? "ON" : "OFF"}`);
  els.waveformSelect.value = state.settings.waveform;
  els.masterVolumeInput.value = state.settings.masterVolume;
  els.activeNotesVolumeInput.value = state.settings.activeNotesVolume;
  els.activeNotesVolumeInput.closest("label")?.setAttribute("title", `現音高 音量 ${Math.round(state.settings.activeNotesVolume * 100)}%`);
  els.a4HzInput.value = state.settings.a4Hz;
  els.bpmInput.value = state.settings.bpm;
  if (els.phaseModeSelect) els.phaseModeSelect.value = state.settings.phaseMode;
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
  if (els.runtimeInfoText) renderRuntimeInfo();
  if (els.presetNameWidthInput) els.presetNameWidthInput.value = getTableColumnWidth("pitch", "name");
  if (els.presetCentWidthInput) els.presetCentWidthInput.value = getTableColumnWidth("pitch", "cent");
  if (els.presetShortWidthInput) els.presetShortWidthInput.value = getTableColumnWidth("pitch", "id");
  if (els.presetTagWidthInput) els.presetTagWidthInput.value = getTableColumnWidth("pitch", "tags");
  if (els.presetMemoWidthInput) els.presetMemoWidthInput.value = getTableColumnWidth("pitch", "memo");
  if (els.progressionCellWidthInput) els.progressionCellWidthInput.value = state.settings.progressionCellWidth;
  syncProgressionFormFromState();
  renderRecallSummary();
  els.saveChordBtn.disabled = state.activeNotes.length === 0;
  document.querySelectorAll("#waveformButtonGroup button").forEach((button) => {
    if (button instanceof HTMLButtonElement) {
      button.classList.toggle("active", button.dataset.waveform === state.settings.waveform);
    }
  });
}

function renderActiveNotesV2() {
  const container = els.activeNotesList;
  container.innerHTML = "";
  if (state.activeNotes.length === 0) {
    renderPresetTableEmpty(container, "現音高はまだありません。");
    els.activeNotesSummary.textContent = "数直線か音高プリセットから追加してください。";
    return;
  }

  container.classList.add("active-notes-table");
  const table = document.createElement("table");
  table.className = "preset-table";
  table.innerHTML = `
    <thead>
      <tr>
        <th><input type="checkbox" data-select-all="active" aria-label="select all active notes"></th>
        <th></th>
        <th data-sort="active:name">名前${sortIndicator(presetUi.activeSort, "name")}</th>
        <th data-sort="active:id">ID${sortIndicator(presetUi.activeSort, "id")}</th>
        <th data-sort="active:cent">¢${sortIndicator(presetUi.activeSort, "cent")}</th>
        <th data-sort="active:tags">タグ${sortIndicator(presetUi.activeSort, "tags")}</th>
        <th data-sort="active:memo">メモ${sortIndicator(presetUi.activeSort, "memo")}</th>
        <th></th>
      </tr>
    </thead>
  `;
  table.prepend(buildPresetColGroup(["select", "remove", "name", "id", "cent", "tags", "memo", "actions"]));
  const tbody = document.createElement("tbody");
  const notes = filteredActiveNotes(els.activeNotesFilterInput?.value);
  if (notes.length === 0) {
    const emptyRow = document.createElement("tr");
    emptyRow.innerHTML = `<td colspan="8" class="composer-note">条件に合う現音高はありません。</td>`;
    tbody.appendChild(emptyRow);
  }
  notes.forEach((note, index) => {
    const row = document.createElement("tr");
    row.dataset.noteId = note.id;
    const preset = findPitchPresetByMicroStep(note.microStepInOctave);
    const selectCell = document.createElement("td");
    selectCell.innerHTML = `<input type="checkbox" data-row-select="active" data-id="${escapeHtml(note.id)}" aria-label="select active note">`;
    selectCell.querySelector("input").checked = presetUi.selectedActiveNoteIds.has(note.id);
    row.appendChild(selectCell);
    const removeCell = document.createElement("td");
    removeCell.innerHTML = `<button type="button" class="danger-button active-note-remove" data-note-id="${escapeHtml(note.id)}" aria-label="削除">×</button>`;
    row.appendChild(removeCell);
    const labelCell = document.createElement("td");
    const resolvedName = preset?.name || describeNoteTitle(note, index);
    labelCell.appendChild(buildPresetMainCell(resolvedName, ""));
    const hiddenName = document.createElement("input");
    hiddenName.type = "hidden";
    hiddenName.dataset.field = "name";
    hiddenName.value = preset?.name || resolvedName;
    labelCell.appendChild(hiddenName);
    const hiddenId = document.createElement("input");
    hiddenId.type = "hidden";
    hiddenId.dataset.field = "id";
    hiddenId.value = pitchPresetDisplayId(preset);
    labelCell.appendChild(hiddenId);
    row.appendChild(labelCell);
    const idCell = document.createElement("td");
    idCell.className = "preset-id";
    idCell.textContent = pitchPresetDisplayId(preset) || " ";
    row.appendChild(idCell);
    const centCell = document.createElement("td");
    const centInput = document.createElement("input");
    centInput.type = "number";
    centInput.className = "preset-inline-input";
    centInput.step = String(state.settings.snapCent || 1);
    centInput.value = formatDecimal(note.cent);
    centInput.dataset.field = "cent";
    centCell.appendChild(centInput);
    row.appendChild(centCell);
    [["tags", "タグ"], ["memo", "メモ"]].forEach(([field, placeholder]) => {
      const td = document.createElement("td");
      const input = document.createElement("input");
      input.type = "text";
      input.className = "preset-inline-input";
      input.placeholder = placeholder;
      input.dataset.field = field;
      if (field === "tags") input.value = (preset?.tags || []).join(", ");
      if (field === "memo") input.value = preset?.memo || "";
      td.appendChild(input);
      row.appendChild(td);
    });
    const actionCell = document.createElement("td");
    actionCell.innerHTML = `<div class="preset-inline-actions"><button type="button" data-action="update-active-note" data-note-id="${escapeHtml(note.id)}">更新</button><button type="button" data-action="save-pitch-preset" data-note-id="${escapeHtml(note.id)}">追加</button></div>`;
    row.appendChild(actionCell);
    tbody.appendChild(row);
  });
  table.appendChild(tbody);
  container.appendChild(table);
  syncTableSelectAll(table, "active", presetUi.selectedActiveNoteIds, notes.map((note) => note.id));
  enhancePresetTable(table, "active");
  els.activeNotesSummary.textContent = `${state.activeNotes.length} 音を保持中`;
}


function populateChordBaseRootOptions() {
  const select = els.chordBaseRootSelect;
  const previous = select.value;
  select.innerHTML = "";
  if (state.activeNotes.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "現音高がありません";
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
  const sorted = sortedChordPresets();
  sorted.forEach((chord) => {
    const option = document.createElement("option");
    option.value = chord.id;
    option.textContent = chord.name;
    select.appendChild(option);
  });
  select.disabled = false;
  select.value = sorted.some((chord) => chord.id === previous) ? previous : sorted[0].id;
}


function saveCurrentPitchPreset(source = null) {
  const note = source?.note || state.pitchDraft;
  const values = source?.values || {
    id: els.pitchPresetIdInput.value,
    name: els.pitchPresetNameInput.value,
    tags: els.pitchPresetTagsInput.value,
    memo: els.pitchPresetMemoInput.value
  };
  const before = snapshotState();
  const displayId = slugifyIdPart(values.id || values.name || note.microStepInOctave) || `p${note.microStepInOctave}`;
  const generatedId = `PITCH_${displayId}_${note.microStepInOctave}`;
  const pitchName = values.name.trim() || `音高 ${formatDecimal(note.cent)}`;
  if (state.pitchPresets.some((preset) => pitchPresetDisplayId(preset) === displayId)) {
    setStatus(els.pitchPresetStatus, `ID ${displayId} は既存プリセットと重複しています。`, "error");
    return;
  }
  if (state.pitchPresets.some((preset) => preset.name === pitchName)) {
    setStatus(els.pitchPresetStatus, `名前 ${pitchName} は既存プリセットと重複しています。`, "error");
    return;
  }
  state.pitchPresets.push({
    id: generatedId,
    name: pitchName,
    shortName: displayId,
    cent: Number(note.cent),
    microStep: note.microStepInOctave,
    symbolRuleKey: "default",
    symbolMap: {},
    tags: parseCsvList(values.tags),
    memo: values.memo.trim()
  });
  const after = snapshotState();
  trackStateChange("create_pitch_preset", "音高プリセットを保存", before, after);
  els.pitchPresetIdInput.value = "";
  els.pitchPresetNameInput.value = "";
  els.pitchPresetShortNameInput.value = "";
  els.pitchPresetTagsInput.value = "";
  els.pitchPresetMemoInput.value = "";
  setStatus(els.pitchPresetStatus, `${pitchName} を保存しました。`, "success");
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
    option.textContent = `${formatPresetDisplayName(preset)} / ${formatDecimal(preset.cent)}¢`;
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
    els.recallChordSummary.textContent = "保存済みコードを選ぶと現音高へ展開できます。";
    els.loadChordBtn.disabled = true;
    return;
  }
  const root = resolveRecallRoot();
  if (!root) {
    els.recallChordSummary.textContent = "音高入力かプリセット選択をしてください。";
    els.loadChordBtn.disabled = true;
    return;
  }
  const rootLabel = els.recallRootTextInput.value.trim() || formatPresetDisplayName(findPitchPresetById(els.recallRootPresetSelect.value)) || "未選択";
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
  const chunkInfo = chunkContextForPartId(currentProgressionAnchorId());
  const current = chunkInfo.index >= 0 ? String(chunkInfo.index + 1).padStart(2, "0") : "00";
  const total = String(chunkInfo.chunks.length).padStart(2, "0");
  els.progCounter.textContent = `${current}/${total}`;
  const selected = selectedIndex >= 0 ? state.progression.parts[selectedIndex] : null;
  const chord = selected ? state.chordPresets.find((item) => item.id === selected.chordId) : null;
  const editorRoot = state.progressionEditor.rootNoteText;
  const bassLabel = bassTokenLabel();
  const inversionLabel = `${currentInversionLabel()} / oct ${currentVoicingOctave()}`;
  const sectionLabel = selected ? String(selected.sectionName || "").trim() : String(state.progressionEditor.sectionName || "").trim();
  els.progSummary.textContent = selected
    ? `${sectionLabel ? `${sectionLabel} / ` : ""}${chord?.name || selected.chordId} / ${formatDirectRootFromPart(selected.root)} / bass ${bassLabel} / ${inversionLabel} / ${selected.beats}/${selected.beatUnit || 4}`
    : `編集中: ${sectionLabel ? `${sectionLabel} / ` : ""}${state.progressionEditor.chordId || "未選択"} / ${editorRoot} / bass ${bassLabel} / ${inversionLabel} / ${state.progressionEditor.beats}/${state.progressionEditor.beatUnit || 4}`;
}


function saveChordFromActiveNotes() {
  if (state.activeNotes.length === 0) {
    setStatus(els.chordStatus, "現音高がありません。", "error");
    return;
  }
  const root = resolveRecallRoot();
  if (!root) {
    setStatus(els.chordStatus, "基音を指定してください。", "error");
    return;
  }
  const before = snapshotState();
  const rawName = els.chordNameInput.value.trim();
  const displayId = slugifyIdPart(els.chordIdInput.value || rawName || "AUTO") || `chord_${state.chordPresets.length + 1}`;
  const generatedId = `CHORD_${displayId}_${state.chordPresets.length + 1}`;
  const chordId = generatedId;
  const userLabels = parseCsvList(els.chordLabelsInput.value);
  const rootAbsolute = (root.octave * OCTAVE_MICROSTEP) + root.microStepInOctave;
  const orderedNotes = [...state.activeNotes.slice().sort((a, b) => (absoluteMicroStep(a) - rootAbsolute) - (absoluteMicroStep(b) - rootAbsolute))];
  const tones = orderedNotes.map((note, index) => {
    const relative = normalizePitch(0, absoluteMicroStep(note) - rootAbsolute);
    const preset = findPitchPresetByMicroStep(relative.microStepInOctave);
    const label = userLabels[index] || buildChordToneDefaultsFromAbsolute(note, index, rootAbsolute);
    return {
      pitchPresetId: preset ? preset.id : null,
      localAnonymousId: preset ? null : `anon:${chordId}:${String(index + 1).padStart(4, "0")}` ,
      localCent: preset ? null : Number(microStepToCent(relative.microStepInOctave)),
      octaveShift: relative.octave,
      label
    };
  });
  const chordName = rawName || deriveChordName(userLabels, tones);
  if (state.chordPresets.some((preset) => chordPresetDisplayId(preset) === displayId)) {
    setStatus(els.chordStatus, `ID ${displayId} は既存プリセットと重複しています。`, "error");
    return;
  }
  state.chordPresets.push({
    id: chordId,
    shortName: displayId,
    name: chordName,
    baseRoot: { octave: root.octave, microStepInOctave: root.microStepInOctave, pitchPresetId: root.pitchPresetId || null, noteText: root.noteText || "" },
    tones,
    tags: parseCsvList(els.chordTagsInput.value),
    memo: els.chordMemoInput.value.trim()
  });
  const after = snapshotState();
  trackStateChange("create_chord_preset", "コードプリセットを保存", before, after);
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
    setStatus(els.recallChordStatus, "保存済みコードが見つかりません。", "error");
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
      notesById.set(noteId, { id: noteId, octave: normalized.octave, microStepInOctave: normalized.microStepInOctave, cent: Number(microStepToCent(normalized.microStepInOctave)), sourceChordId: chord.id, sourceToneIndex: index });
    }
  });
  state.activeNotes = [...notesById.values()].sort((a, b) => absoluteMicroStep(a) - absoluteMicroStep(b));
  pitchUi.lastTouchedNoteId = state.activeNotes[0]?.id || null;
  syncDraftFromCent(microStepToCent(root.microStepInOctave), root.octave);
  const after = snapshotState();
  trackStateChange("load_chord_preset", "コードを現音高へ展開", before, after);
  syncFormFromState();
  render();
  await syncAudioToActiveNotes();
  setStatus(els.recallChordStatus, `${chord.name} を展開しました。`, "success");
}


function render() {
  const pitchVisible = isViewVisible("view-pitch");
  const progressionVisible = isViewVisible("view-progression");

  if (pitchVisible) {
    renderIfChanged("line", `${dataRevision.pitch}|${dataRevision.settings}|${pitchLineRenderKey()}`, renderLine);

    renderIfChanged(
      "activeNotes",
      `${dataRevision.pitch}|${dataRevision.settings}|${els.activeNotesFilterInput?.value || ""}|${presetUi.activeSort.column}:${presetUi.activeSort.direction}|${selectionKey(presetUi.selectedActiveNoteIds)}|${pitchTransientRenderKey()}`,
      renderActiveNotesV2
    );

    renderIfChanged(
      "pitchPresets",
      `${dataRevision.pitch}|${dataRevision.settings}|${els.pitchPresetFilterInput?.value || ""}|${presetUi.pitchSort.column}:${presetUi.pitchSort.direction}|${selectionKey(presetUi.selectedPitchPresetIds)}|${presetUi.editingPitchPresetId || ""}|${pitchTransientRenderKey()}`,
      renderPitchPresetsV2
    );


  }

  if (progressionVisible) {
    renderIfChanged(
      "chordPresets",
      [
        dataRevision.chord,
        dataRevision.pitch,
        els.chordTagFilterInput?.value || "",
        `${presetUi.chordSort.column}:${presetUi.chordSort.direction}`,
        selectionKey(presetUi.selectedChordPresetIds),
        presetUi.editingChordPresetId || "",
        els.recallRootTextInput?.value || "",
        els.recallRootPresetSelect?.value || "",
        els.chordNameInput?.value || "",
        els.chordIdInput?.value || "",
        els.chordTagsInput?.value || "",
        els.chordLabelsInput?.value || "",
        els.chordMemoInput?.value || ""
      ].join("|"),
      renderChordPresetsV2
    );
    renderIfChanged(
      "progressionGrid",
      `${dataRevision.progression}|${dataRevision.chord}|${state.settings.progressionCellWidth}|${state.progression.selectedPartId || ""}|${state.progression.playingPartId || ""}|${progressionUi.draggingPartId || ""}|${progressionUi.dragOverPartId || ""}|${progressionUi.dragPlacement || ""}`,
      renderProgressionGrid
    );

    renderIfChanged(
      "progressionSummary",
      [
        dataRevision.progression,
        dataRevision.chord,
        dataRevision.pitch,
        state.progression.selectedPartId || "",
        state.progression.playingPartId || "",
        state.progressionEditor.chordId || "",
        state.progressionEditor.rootNoteText || "",
        state.progressionEditor.sectionName || "",
        state.progressionEditor.beats || "",
        state.progressionEditor.beatUnit || "",
        state.progressionEditor.bassMode || "",
        state.progressionEditor.bassValue || "",
        state.progressionEditor.inversionStep || "",
        state.progressionEditor.voicingOctave || ""
      ].join("|"),
      renderProgressionSummary
    );

    renderIfChanged("progressionEditor", `${dataRevision.progression}|${dataRevision.chord}|${dataRevision.pitch}|${state.progression.selectedPartId || ""}|${state.progressionEditor.chordId || ""}|${state.progressionEditor.rootNoteText || ""}|${state.progressionEditor.beats || ""}|${state.progressionEditor.beatUnit || ""}|${els.progChordTagFilterInput?.value || ""}`, () => {
      renderProgressionChordButtons();
      renderProgressionEditorButtons();
      renderRecallSummary();
    });

    renderIfChanged("progressionControls", `${dataRevision.progression}|${state.progression.selectedPartId || ""}|${state.progression.playingPartId || ""}|${state.activeNotes.length}`, () => {
      els.addProgPartBtn.textContent = state.progression.selectedPartId ? "後ろに挿入" : "追加";
      if (els.addProgChunkBtn) els.addProgChunkBtn.disabled = !state.progressionEditor.chordId;
      if (els.addProgSectionBtn) els.addProgSectionBtn.disabled = !state.progressionEditor.chordId;
      els.deleteProgPartBtn.disabled = !state.progression.selectedPartId;
      els.progPrevBtn.disabled = state.progression.parts.length === 0;
      els.progNextBtn.disabled = state.progression.parts.length === 0;
      els.playProgBtn.disabled = state.progression.parts.length === 0;
      els.playProgBtn.textContent = state.progression.playingPartId ? "一時停止" : "再生";
      els.stopProgBtn.disabled = !state.progression.playingPartId;
      els.stopProgBtn.textContent = "停止";
      els.saveChordBtn.disabled = state.activeNotes.length === 0;
    });
  }

  renderIfChanged("bulkBars", `${selectionKey(presetUi.selectedPitchPresetIds)}|${selectionKey(presetUi.selectedChordPresetIds)}|${selectionKey(presetUi.selectedActiveNoteIds)}`, updateBulkBars);

  renderIfChanged("waveformButtons", state.settings.waveform, () => {
    document.querySelectorAll("#waveformButtonGroup button").forEach((button) => {
      if (button instanceof HTMLButtonElement) {
        button.classList.toggle("active", button.dataset.waveform === state.settings.waveform);
      }
    });
  });

  syncProgressionLayoutState();
}


function applyProjectFromStorage(saved) {
  if (!saved?.payload) return false;
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
  bumpAllDataRevisions();
  return true;
}

async function restoreFromStorage() {
  try {
    const result = await loadProjectResult();
    const authorityUnavailable =
      result.status === "read_failed" || result.status === "recovery_required";
    persistenceAuthorityReady = !authorityUnavailable;
    persistenceLoadError = authorityUnavailable ? result.error : null;
    applyProjectFromStorage(result.project);
    if (!persistenceAuthorityReady) {
      setPersistenceStatus(
        result.status === "recovery_required" ? "recovery-required" : "load-error",
        persistenceLoadError
      );
    }
    return result.project;
  } catch (error) {
    persistenceAuthorityReady = false;
    persistenceLoadError = error instanceof Error ? error : new Error(String(error || "Project load failed"));
    setPersistenceStatus("load-error", persistenceLoadError);
  }
}

async function retryProjectLoad() {
  const result = await loadProjectResult();
  if (result.status === "read_failed" || result.status === "recovery_required") {
    persistenceAuthorityReady = false;
    persistenceLoadError = result.error;
    setPersistenceStatus(
      result.status === "recovery_required" ? "recovery-required" : "load-error",
      result.error
    );
    return false;
  }

  persistenceLoadError = null;
  const recoveryAction = getPersistenceRecoveryAction(result.status, persistDirty);
  if (recoveryAction === "conflict") {
    persistenceAuthorityReady = false;
    setPersistenceStatus("load-conflict");
    return false;
  }

  persistenceAuthorityReady = true;
  if (recoveryAction === "persist-current") {
    await persistLoop(true);
    return true;
  }

  applyProjectFromStorage(result.project);
  if (migratePitchScaleInState(result.project)) markProjectDirty();
  syncDraftFromCent(state.pitchDraft.cent, state.pitchDraft.octave);
  syncFormFromState();
  invalidateRenderCache();
  render();
  setPersistenceStatus(result.status === "initialized" ? "saved" : "unchanged");
  return true;
}

async function retryPersistence() {
  if (!persistenceAuthorityReady) {
    return retryProjectLoad();
  }
  return persistLoop(true);
}

async function persistLoop(force = false) {
  if (!persistenceAuthorityReady) {
    setPersistenceStatus(persistenceLoadError ? "load-error" : "load-conflict", persistenceLoadError);
    return false;
  }
  // Only one IndexedDB writer at a time. Edits made while a write is
  // awaiting completion must be flushed in a subsequent iteration.
  if (persistInFlight) return persistInFlight;
  if (!force && !persistDirty) return false;

  const task = (async () => {
    let anyChanged = false;
    let forceOnce = force;
    while (forceOnce || persistDirty) {
      if (!persistenceAuthorityReady) {
        setPersistenceStatus(persistenceLoadError ? "load-error" : "load-conflict", persistenceLoadError);
        return false;
      }
      forceOnce = false;
      const revisionAtStart = persistRevision;
      const snapshot = buildProjectPayloadForSave();
      setPersistenceStatus("saving");
      try {
        const changed = await saveProject(snapshot);
        if (!persistenceAuthorityReady) {
          persistDirty = true;
          setPersistenceStatus(persistenceLoadError ? "load-error" : "load-conflict", persistenceLoadError);
          return false;
        }
        anyChanged = anyChanged || changed;
        if (persistRevision === revisionAtStart) {
          persistDirty = false;
          setPersistenceStatus(resolvePersistenceSaveResult(changed).status);
        } else {
          // The saved snapshot is no longer the newest project state.
          // Do not announce "saved" or discard the pending new edit.
          persistDirty = true;
          setPersistenceStatus("dirty");
        }
      } catch (error) {
        persistDirty = true;
        setPersistenceStatus("error", error);
        throw error;
      }
    }
    return anyChanged;
  })();

  persistInFlight = task;
  try {
    return await task;
  } finally {
    if (persistInFlight === task) persistInFlight = null;
  }
}

async function init() {
  runtimeState = classifyRuntime();
  ensureWorkspaceDom();
  restoreWorkspaceColumns();
  syncWorkspaceViewState("pitch");
  if (runtimeState.mode !== "https") {
    await resetDevelopmentCaches().catch(() => {});
  }
  const initialDocument = await restoreFromStorage();
  const migratedLegacy = migratePitchScaleInState(initialDocument);
  ensureDefaultLibraryState(state, DEFAULT_PITCH_PRESETS, DEFAULT_CHORD_PRESETS);
  state.activeNotes = [];
  syncDraftFromCent(0, state.pitchDraft.octave);
  syncFormFromState();
  attachEvents();
  if (migratedLegacy && persistenceAuthorityReady) markProjectDirty();
  setView("pitch");
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
    showRuntimeNotice("PWA モードで起動中です。設定やメニューから状態を確認できます。", "success");
  });

  if ("serviceWorker" in navigator && runtimeState.swAllowed && runtimeState.mode === "https") {
    const pwaVersion = window.__MU_CHORDBOT_PWA_VERSION__ || APP_BUILD;
    navigator.serviceWorker.register(`./service-worker.js?version=${encodeURIComponent(pwaVersion)}`, {
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
        "PWA 用の Service Worker 登録に失敗しました。<br>" +
        "PC 開発時は <code>localhost</code>、PWA 実機確認は HTTPS 公開 URL を使ってください。"
      );
    });
  }

  window.addEventListener("beforeunload", () => {
    if (persistTimerId) {
      clearTimeout(persistTimerId);
      persistTimerId = null;
    }
    persistLoop(true).catch(() => {});
  });
}

init().catch((err) => {
  console.error("init failed:", err);
  showRuntimeWarning(
    "初期化に失敗しました。<br>" +
    "このアプリは <code>localhost</code> または <code>127.0.0.1</code> の HTTP サーバーで開いてください。<br>" +
    "例: <code>python -m http.server 5173</code> を実行して <code>http://localhost:5173/</code> を開いてください。"
  );
});
