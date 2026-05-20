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

export function migratePitchScale(state, pitchTools) {
  const { microStepToCent, centToMicroStep, normalizePitch, OCTAVE_MICROSTEP } = pitchTools;
  const buildNoteId = (octave, microStepInOctave) => `note:${octave}:${microStepInOctave}`;

  state.pitchPresets.forEach((preset) => {
    if (Number.isFinite(Number(preset.cent))) {
      preset.cent = Number(microStepToCent(centToMicroStep(preset.cent)));
      preset.microStep = centToMicroStep(preset.cent);
    }
  });

  state.activeNotes.forEach((note) => {
    const cent = Number.isFinite(Number(note.cent)) ? Number(note.cent) : microStepToCent(note.microStepInOctave || 0);
    const normalized = normalizePitch(note.octave || 0, centToMicroStep(cent));
    note.octave = normalized.octave;
    note.microStepInOctave = normalized.microStepInOctave;
    note.cent = Number(microStepToCent(normalized.microStepInOctave));
    note.id = buildNoteId(note.octave, note.microStepInOctave);
  });

  const migratePitchObject = (pitch) => {
    if (!pitch || !Number.isFinite(Number(pitch.microStepInOctave))) return;
    const legacyLikely = Math.abs(Number(pitch.microStepInOctave)) <= 3600 && OCTAVE_MICROSTEP > 3600;
    if (!legacyLikely) return;
    const normalized = normalizePitch(pitch.octave || 0, Math.round(Number(pitch.microStepInOctave) / 3 * 100));
    pitch.octave = normalized.octave;
    pitch.microStepInOctave = normalized.microStepInOctave;
  };

  state.chordPresets.forEach((chord) => migratePitchObject(chord.baseRoot));
  state.progression.parts.forEach((part) => migratePitchObject(part.root));
  migratePitchObject(state.pitchDraft);
}
