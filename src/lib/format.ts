/**
 * 日付の表示。ビルドするマシン（GitHub Actions は UTC）に左右されないよう、日本時間に固定する。
 */
const dateParts = new Intl.DateTimeFormat("ja-JP", {
  timeZone: "Asia/Tokyo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function ymd(date: Date): { y: string; m: string; d: string } {
  if (Number.isNaN(date.getTime())) throw new RangeError("日付として読めない値です");
  const parts = dateParts.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return { y: get("year"), m: get("month"), d: get("day") };
}

/** 画面に出す形（例: 2026.09.27） */
export function formatDate(date: Date): string {
  const { y, m, d } = ymd(date);
  return `${y}.${m}.${d}`;
}

/** <time datetime> に入れる形（例: 2026-09-27） */
export function isoDate(date: Date): string {
  const { y, m, d } = ymd(date);
  return `${y}-${m}-${d}`;
}
