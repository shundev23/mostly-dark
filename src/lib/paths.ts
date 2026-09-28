/**
 * サイト内リンクを作る補助関数。
 *
 * GitHub Pages のプロジェクトサイトは /mostly-dark/ の下で配信される。
 * <a href="/works/"> と直接書くと本番では https://shundev23.github.io/works/ を指して404になるので、
 * サイト内リンクは必ず withBase() を通す。
 */

/** astro.config.mjs の base（例: "/mostly-dark"）。末尾の / の有無は設定次第なので、ここで揃える */
const BASE = import.meta.env.BASE_URL;
const BASE_WITH_SLASH = BASE.endsWith("/") ? BASE : `${BASE}/`;

/** "https:" "mailto:" などのスキーム付きURLと、"//" で始まるURLを外部リンクとみなす */
export function isExternal(url: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith("//");
}

/**
 * base からの相対パスを、サイト内の絶対パスに変える。
 *
 *   withBase("")        → "/mostly-dark/"
 *   withBase("works/")  → "/mostly-dark/works/"
 *   withBase("/works/") → "/mostly-dark/works/"（先頭の / は無視する）
 *
 * 外部URLとページ内リンク（"#..."）は、そのまま返す。
 */
export function withBase(path: string): string {
  if (isExternal(path) || path.startsWith("#")) return path;
  return BASE_WITH_SLASH + path.replace(/^\/+/, "");
}

/**
 * ナビゲーション用。今いるページとリンク先の関係を aria-current の値で返す。
 *   そのページ自体 → "page"、その棚の中のページ → "true"、無関係 → undefined
 */
export function currentState(pathname: string, sectionPath: string): "page" | "true" | undefined {
  const href = withBase(sectionPath);
  if (pathname === href) return "page";
  if (pathname.startsWith(href)) return "true";
  return undefined;
}
