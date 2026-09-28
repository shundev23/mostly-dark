// @ts-check
import { defineConfig } from "astro/config";
import publicDirIndex from "./tools/public-dir-index.mjs";

/**
 * ほぼダーク のサイト設定
 *
 * GitHub Pages の「プロジェクトサイト」として https://shundev23.github.io/mostly-dark/ に公開する。
 * サイト内リンクはすべて base を基準に作っている（src/lib/paths.ts の withBase）。
 * リポジトリ名を変えたら、base も同じ名前に変えること。
 */
export default defineConfig({
  site: "https://shundev23.github.io",
  base: "/mostly-dark",

  // GitHub Pages は /works を /works/ へリダイレクトする。開発サーバーでも同じ形に揃えて、
  // 「手元では開けたのに本番で404」を防ぐ
  trailingSlash: "always",
  build: {
    format: "directory",
  },

  integrations: [
    // npm run dev でも public/works/作品名/ を本番と同じURLで開けるようにする（ビルド結果には影響しない）
    publicDirIndex(),
  ],
});
