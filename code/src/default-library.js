export const ROOT_NOTE_SEMITONES = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

export const ROOT_ACCIDENTAL_OPTIONS = [
  { id: "flat", symbol: "b", delta: -1 },
  { id: "natural", symbol: "", delta: 0 },
  { id: "sharp", symbol: "#", delta: 1 }
];

export const DEFAULT_PITCH_PRESETS = [
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

export const DEFAULT_CHORD_PRESETS = [
  { id: "CHORD_MAJ", name: "maj", baseRoot: { octave: 4, microStepInOctave: 0, pitchPresetId: "PITCH_P1_0", noteText: "C4" }, tones: [{ pitchPresetId: "PITCH_P1_0", localAnonymousId: null, localCent: null, octaveShift: 0, label: "Root" }, { pitchPresetId: "PITCH_M3_1200", localAnonymousId: null, localCent: null, octaveShift: 0, label: "M3" }, { pitchPresetId: "PITCH_P5_2100", localAnonymousId: null, localCent: null, octaveShift: 0, label: "P5" }], tags: ["basic", "major"], memo: "" },
  { id: "CHORD_MIN", name: "min", baseRoot: { octave: 4, microStepInOctave: 0, pitchPresetId: "PITCH_P1_0", noteText: "C4" }, tones: [{ pitchPresetId: "PITCH_P1_0", localAnonymousId: null, localCent: null, octaveShift: 0, label: "Root" }, { pitchPresetId: "PITCH_m3_900", localAnonymousId: null, localCent: null, octaveShift: 0, label: "m3" }, { pitchPresetId: "PITCH_P5_2100", localAnonymousId: null, localCent: null, octaveShift: 0, label: "P5" }], tags: ["basic", "minor"], memo: "" },
  { id: "CHORD_7", name: "7", baseRoot: { octave: 4, microStepInOctave: 0, pitchPresetId: "PITCH_P1_0", noteText: "C4" }, tones: [{ pitchPresetId: "PITCH_P1_0", localAnonymousId: null, localCent: null, octaveShift: 0, label: "Root" }, { pitchPresetId: "PITCH_M3_1200", localAnonymousId: null, localCent: null, octaveShift: 0, label: "M3" }, { pitchPresetId: "PITCH_P5_2100", localAnonymousId: null, localCent: null, octaveShift: 0, label: "P5" }, { pitchPresetId: "PITCH_m7_3000", localAnonymousId: null, localCent: null, octaveShift: 0, label: "m7" }], tags: ["basic", "dominant"], memo: "" },
  { id: "CHORD_M7", name: "M7", baseRoot: { octave: 4, microStepInOctave: 0, pitchPresetId: "PITCH_P1_0", noteText: "C4" }, tones: [{ pitchPresetId: "PITCH_P1_0", localAnonymousId: null, localCent: null, octaveShift: 0, label: "Root" }, { pitchPresetId: "PITCH_M3_1200", localAnonymousId: null, localCent: null, octaveShift: 0, label: "M3" }, { pitchPresetId: "PITCH_P5_2100", localAnonymousId: null, localCent: null, octaveShift: 0, label: "P5" }, { pitchPresetId: "PITCH_M7_3300", localAnonymousId: null, localCent: null, octaveShift: 0, label: "M7" }], tags: ["basic", "major"], memo: "" },
  { id: "CHORD_m7", name: "m7", baseRoot: { octave: 4, microStepInOctave: 0, pitchPresetId: "PITCH_P1_0", noteText: "C4" }, tones: [{ pitchPresetId: "PITCH_P1_0", localAnonymousId: null, localCent: null, octaveShift: 0, label: "Root" }, { pitchPresetId: "PITCH_m3_900", localAnonymousId: null, localCent: null, octaveShift: 0, label: "m3" }, { pitchPresetId: "PITCH_P5_2100", localAnonymousId: null, localCent: null, octaveShift: 0, label: "P5" }, { pitchPresetId: "PITCH_m7_3000", localAnonymousId: null, localCent: null, octaveShift: 0, label: "m7" }], tags: ["basic", "minor"], memo: "" },
  { id: "CHORD_SUS4", name: "sus4", baseRoot: { octave: 4, microStepInOctave: 0, pitchPresetId: "PITCH_P1_0", noteText: "C4" }, tones: [{ pitchPresetId: "PITCH_P1_0", localAnonymousId: null, localCent: null, octaveShift: 0, label: "Root" }, { pitchPresetId: "PITCH_P4_1500", localAnonymousId: null, localCent: null, octaveShift: 0, label: "P4" }, { pitchPresetId: "PITCH_P5_2100", localAnonymousId: null, localCent: null, octaveShift: 0, label: "P5" }], tags: ["basic", "sus"], memo: "" },
  { id: "CHORD_DIM", name: "dim", baseRoot: { octave: 4, microStepInOctave: 0, pitchPresetId: "PITCH_P1_0", noteText: "C4" }, tones: [{ pitchPresetId: "PITCH_P1_0", localAnonymousId: null, localCent: null, octaveShift: 0, label: "Root" }, { pitchPresetId: "PITCH_m3_900", localAnonymousId: null, localCent: null, octaveShift: 0, label: "m3" }, { pitchPresetId: "PITCH_B5_1800", localAnonymousId: null, localCent: null, octaveShift: 0, label: "b5" }], tags: ["basic", "dim"], memo: "" }
];
