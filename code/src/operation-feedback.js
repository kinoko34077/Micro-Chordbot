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
  if (loadStatus === "read_failed") return "retry-read";
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

export function detectImportKind(parsed) {
  if (!parsed || typeof parsed !== "object" || parsed.app !== "muChordbot" || !parsed.payload || typeof parsed.payload !== "object") {
    throw new Error("対応していないデータ形式です。");
  }

  const extensionType = parsed.extensionType;
  const isLibrary = extensionType === "mcbl" || parsed.exportType === "library";
  const isProgression = extensionType === "mcbp" || parsed.exportType === "progression";
  const isProject = extensionType === "mcb" || parsed.exportType === "project";
  const isIdentifiedObjectArray = (value) =>
    Array.isArray(value) &&
    value.every((item) => item && typeof item === "object" && typeof item.id === "string" && item.id.trim());

  if (isLibrary) {
    if (!isIdentifiedObjectArray(parsed.payload.pitchPresets) || !isIdentifiedObjectArray(parsed.payload.chordPresets)) {
      throw new Error("library データが不完全です。");
    }
    return "library";
  }

  if (isProgression) {
    if (
      !parsed.payload.progression ||
      typeof parsed.payload.progression !== "object" ||
      !isIdentifiedObjectArray(parsed.payload.progression.parts)
    ) {
      throw new Error("progression データが不完全です。");
    }
    return "progression";
  }

  if (isProject) {
    if (
      !parsed.payload.settings ||
      typeof parsed.payload.settings !== "object" ||
      !isIdentifiedObjectArray(parsed.payload.pitchPresets) ||
      !isIdentifiedObjectArray(parsed.payload.chordPresets) ||
      !parsed.payload.progression ||
      typeof parsed.payload.progression !== "object" ||
      !isIdentifiedObjectArray(parsed.payload.progression.parts)
    ) {
      throw new Error("project データが不完全です。");
    }
    return "project";
  }

  throw new Error("対応していないデータ形式です。");
}

export function getImportFailureMessage(error) {
  return formatFailureMessage("読み込みに失敗しました。データは変更していません。", error);
}

export function getAudioFailureMessage(error) {
  return formatFailureMessage("音声を開始できませんでした。再試行してください。", error);
}
