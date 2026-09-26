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

export function getImportFailureMessage(error) {
  return formatFailureMessage("読み込みに失敗しました。データは変更していません。", error);
}

export function getAudioFailureMessage(error) {
  return formatFailureMessage("音声を開始できませんでした。再試行してください。", error);
}
