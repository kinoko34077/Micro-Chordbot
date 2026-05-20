export function parseCsvList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function normalizeFilterText(value) {
  return String(value || "").trim().toLowerCase();
}

export function sortByColumn(items, sortState, valueResolver) {
  const column = sortState?.column || "name";
  const direction = sortState?.direction === "desc" ? -1 : 1;
  return [...items].sort((a, b) => {
    const av = valueResolver(a, column);
    const bv = valueResolver(b, column);
    const result = typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av ?? "").localeCompare(String(bv ?? ""), "ja", { numeric: true });
    return result * direction;
  });
}

export function toggleSortState(sortState, column) {
  if (sortState.column === column) {
    sortState.direction = sortState.direction === "asc" ? "desc" : "asc";
  } else {
    sortState.column = column;
    sortState.direction = "asc";
  }
}

export function sortIndicator(sortState, column) {
  if (sortState?.column !== column) return "";
  return sortState.direction === "desc" ? " ↓" : " ↑";
}

export function slugifyIdPart(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^0-9A-Za-z_:-]/g, "")
    .toUpperCase();
}

export function formatDecimal(value, maxFractionDigits = 2) {
  const num = Math.round(Number(value) * 100) / 100;
  if (!Number.isFinite(num)) return "";
  return num.toFixed(maxFractionDigits).replace(/\.?0+$/, "");
}
