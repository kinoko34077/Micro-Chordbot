export const CURRENT_PITCH_ENCODING = "cent-x100";
export const LEGACY_PITCH_ENCODING = "cent-x3";

// Old and new files may share specVersion 1.2.0. Infer from actual
// preset cent/microStep pairs, never the magnitude of a root pitch.
export function detectPitchEncoding(document) {
  if (document?.pitchEncoding === CURRENT_PITCH_ENCODING ||
      document?.pitchEncoding === LEGACY_PITCH_ENCODING) {
    return document.pitchEncoding;
  }
  if (document?.pitchEncoding != null) return "unknown";
  const presets = document?.payload?.pitchPresets ?? document?.pitchPresets ?? [];
  let modern = 0;
  let legacy = 0;
  for (const preset of presets) {
    const cent = preset?.cent;
    const step = preset?.microStep;
    if (typeof cent !== "number" || !Number.isFinite(cent) ||
        typeof step !== "number" || !Number.isFinite(step) || Math.abs(cent) < 0.02) continue;
    const modernMatch = Math.abs(Math.round(cent * 100) - step) <= 2;
    const legacyMatch = Math.abs(Math.round(cent * 3) - step) <= 2;
    if (modernMatch && !legacyMatch) modern += 1;
    if (legacyMatch && !modernMatch) legacy += 1;
  }
  if (modern > 0 && legacy === 0) return CURRENT_PITCH_ENCODING;
  if (legacy > 0 && modern === 0) return LEGACY_PITCH_ENCODING;
  return "unknown"; // no destructive conversion without evidence
}

export function cloneStateSnapshot(state) {
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

export function buildProjectPayload(state) {
  return {
    app: "muChordbot",
    specVersion: "1.2.0",
    extensionType: "mcb",
    pitchEncoding: CURRENT_PITCH_ENCODING,
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

export function buildProgressionPayload(state) {
  return {
    app: "muChordbot",
    specVersion: "1.2.0",
    extensionType: "mcbp",
    pitchEncoding: CURRENT_PITCH_ENCODING,
    exportType: "progression",
    payload: {
      progression: state.progression,
      progressionEditor: state.progressionEditor
    }
  };
}

export function buildLibraryPayload(state) {
  return {
    app: "muChordbot",
    specVersion: "1.2.0",
    extensionType: "mcbl",
    pitchEncoding: CURRENT_PITCH_ENCODING,
    exportType: "library",
    payload: {
      pitchPresets: state.pitchPresets,
      chordPresets: state.chordPresets
    }
  };
}

export function ensureDefaultLibrary(state, defaultPitchPresets, defaultChordPresets) {
  if (!Array.isArray(state.pitchPresets) || state.pitchPresets.length === 0) {
    state.pitchPresets = JSON.parse(JSON.stringify(defaultPitchPresets));
  }
  if (!Array.isArray(state.chordPresets) || state.chordPresets.length === 0) {
    state.chordPresets = JSON.parse(JSON.stringify(defaultChordPresets));
  }
}

export function migratePitchScale(state, pitchTools, {encoding = CURRENT_PITCH_ENCODING} = {}) {
  const { microStepToCent, centToMicroStep, normalizePitch, OCTAVE_MICROSTEP } = pitchTools;
  const buildNoteId = (octave, microStepInOctave) => `note:${octave}:${microStepInOctave}`;

  (state.pitchPresets || []).forEach((preset) => {
    if (Number.isFinite(Number(preset.cent))) {
      preset.cent = Number(microStepToCent(centToMicroStep(preset.cent)));
      preset.microStep = centToMicroStep(preset.cent);
    }
  });

  (state.activeNotes || []).forEach((note) => {
    const cent = Number.isFinite(Number(note.cent)) ? Number(note.cent) : microStepToCent(note.microStepInOctave || 0);
    const normalized = normalizePitch(note.octave || 0, centToMicroStep(cent));
    note.octave = normalized.octave;
    note.microStepInOctave = normalized.microStepInOctave;
    note.cent = Number(microStepToCent(normalized.microStepInOctave));
    note.id = buildNoteId(note.octave, note.microStepInOctave);
  });

  const migratePitchObject = (pitch) => {
    if (!pitch || !Number.isFinite(Number(pitch.microStepInOctave))) return;
    if (encoding !== LEGACY_PITCH_ENCODING) return;
    const normalized = normalizePitch(pitch.octave || 0, Math.round(Number(pitch.microStepInOctave) / 3 * 100));
    pitch.octave = normalized.octave;
    pitch.microStepInOctave = normalized.microStepInOctave;
  };

  (state.chordPresets || []).forEach((chord) => migratePitchObject(chord.baseRoot));
  (state.progression?.parts || []).forEach((part) => {
    migratePitchObject(part.root);
    migratePitchObject(part.bass);
  });
  migratePitchObject(state.pitchDraft);
}
