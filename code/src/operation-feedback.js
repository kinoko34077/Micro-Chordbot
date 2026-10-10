const DEFAULT_FAILURE_DETAIL = "詳細を確認して再試行してください。";

function errorDetail(error) {
  const detail = error instanceof Error ? error.message : String(error || "");
  return detail.trim();
}

export function formatFailureMessage(prefix, error) {
  const detail = errorDetail(error);
  return detail ? `${prefix} (${detail})` : `${prefix} ${DEFAULT_FAILURE_DETAIL}`;
}

export function getPersistenceStatus(status, error = null) {
  switch (status) {
    case "dirty":
      return {
        message: "未保存の変更があります。自動保存を待機中です。",
        tone: "info",
        retry: false
      };
    case "saving":
      return {
        message: "保存中…",
        tone: "info",
        retry: false
      };
    case "saved":
      return {
        message: "保存しました。",
        tone: "success",
        retry: false
      };
    case "unchanged":
      return {
        message: "保存対象の変更はありません。",
        tone: "info",
        retry: false
      };
    case "load-error":
      return {
        message: formatFailureMessage("保存済みデータを確認できません。現在の内容は自動保存せず、読込を再試行できます。", error),
        tone: "error",
        retry: true
      };
    case "recovery-required":
      return {
        message: formatFailureMessage("保存済みデータを安全に移行できません。自動保存を停止しています。元の IndexedDB データを退避してから再試行してください。", error),
        tone: "error",
        retry: true
      };
    case "load-conflict":
      return {
        message: "保存済みデータを再確認しましたが、この起動中の変更と競合しています。自動保存は停止しています。必要な内容をエクスポートしてから再読込してください。",
        tone: "error",
        retry: false
      };
    case "error":
      return {
        message: formatFailureMessage("保存に失敗しました。再試行してください。", error),
        tone: "error",
        retry: true
      };
    default:
      return {
        message: "保存状態を確認できません。",
        tone: "error",
        retry: true
      };
  }
}

export function getActiveVoiceIdsForFailureCleanup(activeNotes) {
  const ids = (Array.isArray(activeNotes) ? activeNotes : [])
    .map((note) => note?.id)
    .filter((id) => typeof id === "string" && id);
  return [...new Set(ids)];
}

export function getPersistenceRecoveryAction(loadStatus, dirty) {
  if (loadStatus === "read_failed" || loadStatus === "recovery_required") return "retry-read";
  if (dirty && loadStatus === "loaded") return "conflict";
  if (dirty && loadStatus === "initialized") return "persist-current";
  return "apply-loaded";
}

export function resolvePersistenceSaveResult(changed) {
  return {
    dirty: false,
    status: changed ? "saved" : "unchanged"
  };
}

function isRecord(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasId(value) {
  return isRecord(value) && typeof value.id === "string" && value.id.trim().length > 0;
}

function validIds(values, validItem) {
  if (!Array.isArray(values)) return false;
  const ids = new Set();
  return values.every((item) => {
    if (!hasId(item) || ids.has(item.id) || !validItem(item)) return false;
    ids.add(item.id);
    return true;
  });
}

function finite(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function validPitch(pitch) {
  return hasId(pitch) && typeof pitch.name === "string" &&
    finite(pitch.cent) && finite(pitch.microStep) &&
    (!("tags" in pitch) || Array.isArray(pitch.tags));
}

function validPitchPosition(root) {
  return isRecord(root) && finite(root.octave) &&
    (finite(root.microStepInOctave) || typeof root.noteText === "string");
}

function validTone(tone) {
  if (!isRecord(tone)) return false;
  const namedPreset = typeof tone.pitchPresetId === "string" && tone.pitchPresetId.trim();
  const local = finite(tone.localCent);
  return Boolean(namedPreset || local);
}

function validChord(chord) {
  return hasId(chord) && typeof chord.name === "string" &&
    validPitchPosition(chord.baseRoot) &&
    Array.isArray(chord.tones) && chord.tones.every(validTone);
}

function validPart(part) {
  return hasId(part) && (part.chordId == null || typeof part.chordId === "string") &&
    validPitchPosition(part.root) && finite(part.beats) && part.beats > 0 &&
    (!("beatUnit" in part) || (finite(part.beatUnit) && part.beatUnit > 0));
}

function validProgression(progression) {
  return isRecord(progression) && validIds(progression.parts, validPart) &&
    (!("columns" in progression) || (finite(progression.columns) && progression.columns >= 1));
}

function validLibrary(payload) {
  return isRecord(payload) &&
    validIds(payload.pitchPresets, validPitch) &&
    validIds(payload.chordPresets, validChord);
}

export function detectImportKind(parsed) {
  if (!isRecord(parsed) || parsed.app !== "muChordbot" || !isRecord(parsed.payload)) {
    throw new Error("対応していないデータ形式です。");
  }

  const extensions = {mcb: "project", mcbl: "library", mcbp: "progression"};
  const declaredByExtension = extensions[parsed.extensionType];
  const declaredByExport = parsed.exportType;
  if (
    !declaredByExtension && !["project", "library", "progression"].includes(declaredByExport) ||
    declaredByExtension && declaredByExport && declaredByExtension !== declaredByExport
  ) {
    throw new Error("対応していないデータ形式です。");
  }
  const kind = declaredByExtension || declaredByExport;
  if (kind === "library") {
    if (!validLibrary(parsed.payload)) throw new Error("library データが不完全です。");
    return kind;
  }
  if (kind === "progression") {
    if (!validProgression(parsed.payload.progression) ||
        ("progressionEditor" in parsed.payload && !isRecord(parsed.payload.progressionEditor))) {
      throw new Error("progression データが不完全です。");
    }
    return kind;
  }
  if (kind === "project") {
    const settings = parsed.payload.settings;
    if (!validLibrary(parsed.payload) || !validProgression(parsed.payload.progression) ||
        !isRecord(settings) || !finite(settings.a4Hz) || settings.a4Hz <= 0 ||
        !finite(settings.bpm) || settings.bpm <= 0 ||
        !isRecord(parsed.payload.progressionEditor)) {
      throw new Error("project データが不完全です。");
    }
    return kind;
  }
  throw new Error("対応していないデータ形式です。");
}

export function getImportFailureMessage(error) {
  return formatFailureMessage("読み込みに失敗しました。データは変更していません。", error);
}

export function getAudioFailureMessage(error) {
  return formatFailureMessage("音声を開始できませんでした。再試行してください。", error);
}
