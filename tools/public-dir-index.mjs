// @ts-check
import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 開発サーバー（npm run dev）専用の小さなAstroインテグレーション。
 *
 * public/ に置いた作品を、本番と同じURLで開けるようにする。
 *   /mostly-dark/works/particle-tracks/ → public/works/particle-tracks/index.html を返す
 *
 * 本番（GitHub Pages）と npm run preview は最初からこう動くが、astro dev はフォルダのURLで
 * index.html を返さず404になる。その差を埋めるだけで、ビルド結果には何も影響しない。
 *
 * @returns {import("astro").AstroIntegration}
 */
export default function publicDirIndex() {
  let baseWithSlash = "/";
  let publicDir = "";

  /** public/ の中のパスかどうか（../ で外に出るパスは扱わない） */
  const isInsidePublic = (/** @type {string} */ p) => p.startsWith(publicDir + path.sep);

  const isFile = (/** @type {string} */ p) => {
    try {
      return statSync(p).isFile();
    } catch {
      return false;
    }
  };

  return {
    name: "public-dir-index",
    hooks: {
      "astro:config:done": ({ config }) => {
        baseWithSlash = `/${config.base.replace(/^\/+|\/+$/g, "")}/`.replace(/\/{2,}/g, "/");
        publicDir = fileURLToPath(config.publicDir).replace(/[\\/]+$/, "");
      },
      "astro:server:setup": ({ server }) => {
        server.middlewares.use((req, res, next) => {
          if (req.method !== "GET" && req.method !== "HEAD") return next();

          // Astro は req.url から base を外して渡してくるので、base 付きの元のURL（originalUrl）で判定する
          const rawUrl = /** @type {{ originalUrl?: string }} */ (req).originalUrl ?? req.url ?? "/";
          let pathname;
          try {
            pathname = decodeURIComponent(new URL(rawUrl, "http://localhost").pathname);
          } catch {
            return next(); // URLとして読めないものは Astro に任せる
          }
          if (!pathname.startsWith(baseWithSlash) || !pathname.endsWith("/")) return next();

          const dir = path.resolve(publicDir, pathname.slice(baseWithSlash.length));
          const indexFile = path.join(dir, "index.html");
          // public/ の外を指すURLや、index.html の無いフォルダ（Astro のページ）は Astro に任せる
          if (!isInsidePublic(dir) || !isFile(indexFile)) return next();

          res.statusCode = 200;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.setHeader("Cache-Control", "no-cache");
          if (req.method === "HEAD") {
            res.end();
            return;
          }
          createReadStream(indexFile)
            .on("error", (err) => next(err))
            .pipe(res);
        });
      },
    },
  };
}
