/**
 * 現在の宇宙のエネルギー組成（トップページの帯グラフとファビコンの元データ）。
 *
 * Planck 2018（TT,TE,EE+lowE+lensing）の ΛCDM フィットから計算した値：
 *   Ω_Λ = 0.6847
 *   Ω_c h² = 0.1200, Ω_b h² = 0.02237, h = 0.6736
 *   → Ω_c = 0.264（ダークマター）, Ω_b = 0.049（ふつうの物質）
 *   残りの約0.1%はニュートリノなど。
 * 出典: Planck Collaboration (2020), A&A 641, A6, Table 2
 *
 * ※ public/favicon.svg の扇形も同じ比率で描いている。値を変えたらそちらも描き直すこと。
 */
export interface Component {
  key: "de" | "dm" | "baryon";
  label: string;
  /** 百分率（小数第1位まで） */
  percent: number;
  /** 光（電磁気力）と関わるかどうか */
  luminous: boolean;
}

export const COMPOSITION: readonly Component[] = [
  { key: "de", label: "ダークエネルギー", percent: 68.5, luminous: false },
  { key: "dm", label: "ダークマター", percent: 26.4, luminous: false },
  { key: "baryon", label: "ふつうの物質", percent: 4.9, luminous: true },
];

export const COMPOSITION_SOURCE = {
  label: "Planck 2018",
  url: "https://arxiv.org/abs/1807.06209",
} as const;
