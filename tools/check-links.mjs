// @ts-check
/**
 * ビルド後のサイト内リンク検査（npm run build の最後に自動で走る）
 *
 * dist/ のすべての HTML から href・src・srcset・poster を拾い、次のどれかに当たるものを一覧にして止める。
 *   1. "/" で始まるのに base（例: /mostly-dark/）で始まらないリンク … GitHub Pages では404になる
 *   2. リンク先のファイルが dist/ に無いリンク
 *   3. 404ページの中の相対リンク … 404ページはどの階層のURLでも返されるので、相対パスだと切れる
 * GitHub Actions でも同じ build が走るので、壊れたリンクがあると公開する前に失敗する。
 *
 * 外部サイト（https://...）へのリンクは、ネットワークの状態に左右されないよう検査しない。
 */
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import config from "../astro.config.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const distDir = path.resolve(projectRoot, config.outDir ?? "dist");
// "/mostly-dark" → "/mostly-dark/"。base が未設定なら "/"
const base = `/${(config.base ?? "").replace(/^\/+|\/+$/g, "")}/`.replace(/\/{2,}/g, "/");
const siteOrigin = config.site ? new URL(config.site).origin : null;
// 相対URLを解決するためだけの仮のオリジン
const DUMMY_ORIGIN = "https://site.invalid";

/**
 * dist/ 以下の .html をすべて列挙する
 * @param {string} dir
 * @returns {AsyncGenerator<string>}
 */
async function* walkHtml(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkHtml(full);
    else if (entry.isFile() && entry.name.endsWith(".html")) yield full;
  }
}

/**
 * dist/works/index.html → "/mostly-dark/works/" のように、そのHTMLが配信されるURLのパスを返す
 * @param {string} htmlFile
 */
function servedPath(htmlFile) {
  const rel = path.relative(distDir, htmlFile).split(path.sep).join("/");
  if (rel === "index.html") return base;
  if (rel.endsWith("/index.html")) return base + rel.slice(0, -"index.html".length);
  return base + rel;
}

/** @param {string} s */
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

const ATTR_RE = /\s(href|src|srcset|poster)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi;

/**
 * HTML からリンク（URL文字列）を取り出す。<script>・<style>・コメントの中は対象外
 * @param {string} html
 * @returns {string[]}
 */
function extractUrls(html) {
  const body = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, (m) => m.slice(0, m.indexOf(">") + 1))
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");
  /** @type {string[]} */
  const urls = [];
  for (const m of body.matchAll(ATTR_RE)) {
    const attr = m[1].toLowerCase();
    const value = decodeEntities(m[2] ?? m[3] ?? m[4] ?? "").trim();
    if (attr === "srcset") {
      for (const candidate of value.split(",")) {
        const url = candidate.trim().split(/\s+/)[0];
        if (url) urls.push(url);
      }
    } else if (value) {
      urls.push(value);
    }
  }
  return urls;
}

/** @type {Map<string, boolean>} */
const existsCache = new Map();

/**
 * base 以下のパスが dist/ の実ファイルに対応するか（ディレクトリなら index.html を探す）
 * @param {string} pathname
 * @returns {Promise<boolean>}
 */
async function targetExists(pathname) {
  const cached = existsCache.get(pathname);
  if (cached !== undefined) return cached;
  let exists = false;
  const rel = decodeURIComponent(pathname.slice(base.length));
  const candidates = rel === "" || rel.endsWith("/") ? [`${rel}index.html`] : [rel, `${rel}/index.html`];
  for (const candidate of candidates) {
    const abs = path.resolve(distDir, candidate);
    if (abs !== distDir && !abs.startsWith(distDir + path.sep)) continue; // dist/ の外は見ない
    try {
      if ((await stat(abs)).isFile()) {
        exists = true;
        break;
      }
    } catch {
      // 見つからなければ次の候補へ
    }
  }
  existsCache.set(pathname, exists);
  return exists;
}

/**
 * 1つのリンクを検査して、問題があればその説明を返す（問題がなければ null）
 * @param {string} url リンクの文字列
 * @param {string} pageUrl リンクが書かれたページのURLパス（相対リンクの基準）
 * @param {boolean} isNotFoundPage 404ページかどうか
 * @returns {Promise<string | null>}
 */
async function inspect(url, pageUrl, isNotFoundPage) {
  if (url.startsWith("#") || /^(mailto|tel|javascript|data|blob):/i.test(url)) return null;

  let pathname;
  if (/^[a-z][a-z\d+.-]*:/i.test(url) || url.startsWith("//")) {
    // 絶対URL。自分のサイト（site + base）宛てのときだけ中身を確かめる
    const u = new URL(url, DUMMY_ORIGIN);
    if (!siteOrigin || u.origin !== siteOrigin || !u.pathname.startsWith(base)) return null;
    pathname = u.pathname;
  } else if (url.startsWith("/")) {
    if (!url.startsWith(base) && `${url}/` !== base) {
      return `base（${base}）が抜けています。src/lib/paths.ts の withBase() を通してください`;
    }
    pathname = new URL(url, DUMMY_ORIGIN).pathname;
  } else {
    if (isNotFoundPage) return "404ページでは相対リンクを使えません。withBase() で絶対パスにしてください";
    pathname = new URL(url, DUMMY_ORIGIN + pageUrl).pathname;
    if (!pathname.startsWith(base)) return `サイトの外（${base} より上）を指しています`;
  }

  try {
    return (await targetExists(pathname)) ? null : "リンク先が dist/ にありません";
  } catch {
    return "URLの形が正しくありません";
  }
}

async function main() {
  try {
    await stat(path.join(distDir, "index.html"));
  } catch {
    console.error(`✗ ${path.relative(projectRoot, distDir)}/index.html がありません。先に astro build を実行してください`);
    process.exit(1);
  }

  /** @type {Map<string, { url: string; reason: string }[]>} HTMLファイル → 問題の一覧 */
  const problems = new Map();
  let pageCount = 0;
  let linkCount = 0;

  for await (const file of walkHtml(distDir)) {
    pageCount += 1;
    const rel = path.relative(distDir, file).split(path.sep).join("/");
    const html = await readFile(file, "utf8");
    const pageUrl = servedPath(file);
    const isNotFoundPage = rel === "404.html";

    for (const url of new Set(extractUrls(html))) {
      linkCount += 1;
      const reason = await inspect(url, pageUrl, isNotFoundPage);
      if (reason) {
        const list = problems.get(rel) ?? [];
        list.push({ url, reason });
        problems.set(rel, list);
      }
    }
  }

  if (problems.size > 0) {
    const total = [...problems.values()].reduce((n, list) => n + list.length, 0);
    console.error(`\n✗ サイト内リンクに問題が ${total} 件あります\n`);
    for (const [file, list] of problems) {
      console.error(`  ${file}`);
      for (const { url, reason } of list) console.error(`    - ${url}\n      ${reason}`);
    }
    console.error("");
    process.exit(1);
  }

  console.log(`✓ サイト内リンク OK（HTML ${pageCount} ファイル・リンク ${linkCount} 件、base = ${base}）`);
}

await main();
