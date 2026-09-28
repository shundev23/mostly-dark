/**
 * サイト全体で使う名前と説明。
 * ヘッダー・トップページ・各棚のページが同じ定義を読むので、文言を変えるときはここだけ直す。
 */
export const SITE = {
  title: "ほぼダーク",
  titleEn: "MOSTLY DARK",
  tagline: "宇宙の95%を占める「見えないもの」を、式とデータで追いかける。",
  description:
    "宇宙の95%を占める「見えないもの」を、式とデータで追いかける。ダークマターとダークエネルギーを中心に、天体物理学・宇宙論を独学している記録。",
  author: "shundev23",
  repoUrl: "https://github.com/shundev23/mostly-dark",
} as const;

export type SectionKey = "works" | "labs" | "notes";

export interface Section {
  key: SectionKey;
  /** base からの相対パス。末尾は必ず "/" */
  path: `${string}/`;
  label: string;
  labelEn: string;
  /** 棚の一行説明 */
  lead: string;
  /** 一覧ページの meta description */
  description: string;
}

/** 3つの棚。並び順がそのままナビゲーションとトップページの順になる */
export const SECTIONS: readonly Section[] = [
  {
    key: "works",
    path: "works/",
    label: "作品",
    labelEn: "WORKS",
    lead: "3Dや図解で、目に見えない動きを見えるようにする。",
    description: "3Dや図解で、目に見えない動きを見えるようにした作品の一覧。",
  },
  {
    key: "labs",
    path: "labs/",
    label: "実習",
    labelEn: "LABS",
    lead: "公開データを自分で解析して、教科書の話を数字で確かめる。",
    description: "公開データを自分で解析して、教科書の話を数字で確かめた実習の記録。",
  },
  {
    key: "notes",
    path: "notes/",
    label: "ノート",
    labelEn: "NOTES",
    lead: "教科書の式を、飛ばさずに手で追った記録。",
    description: "教科書の式を、飛ばさずに手で追った学習ノート。",
  },
];

export function getSection(key: SectionKey): Section {
  const section = SECTIONS.find((s) => s.key === key);
  if (!section) throw new Error(`未定義の棚です: ${key}`);
  return section;
}
