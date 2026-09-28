import { defineCollection } from "astro:content";
import { glob } from "astro/loaders";
import { z } from "astro/zod";

/**
 * 作品のリンク先。次のどちらかだけを許す。
 *   - base からの相対パス（例: "works/particle-tracks/"）… public/ に置いた作品
 *   - https:// で始まる外部URL
 * "/works/..." のように / で始めると base が抜けて本番で404になるので、ビルド時に止める。
 */
const href = z
  .string()
  .trim()
  .min(1)
  .refine((v) => v.startsWith("https://") || (!v.startsWith("/") && !/^[a-z][a-z\d+.-]*:/i.test(v)), {
    error: 'href は "works/作品名/" のような相対パスか、https:// で始まるURLにしてください',
  });

/**
 * 作品（1作品 = src/content/works/ の .md 1ファイル）。
 * 作品本体は public/works/作品名/ に置き、ここには一覧に出す情報だけを書く。
 */
const works = defineCollection({
  loader: glob({ base: "./src/content/works", pattern: "*.md" }),
  schema: ({ image }) =>
    z
      .object({
        title: z.string().min(1),
        /** 一覧のカードに出す一行説明 */
        summary: z.string().min(1).max(120),
        publishedAt: z.coerce.date(),
        updatedAt: z.coerce.date().optional(),
        href,
        tags: z.array(z.string().min(1)).default([]),
        /** 表紙画像（.md からの相対パス）。無くてもよい */
        cover: image().optional(),
        /** 表紙画像の説明（画面読み上げ用）。cover を付けたら必須 */
        coverAlt: z.string().min(1).optional(),
        /** true にすると本番では出さない（npm run dev では表示される） */
        draft: z.boolean().default(false),
      })
      .refine((data) => data.cover === undefined || data.coverAlt !== undefined, {
        error: "cover を付けたら coverAlt（画像の説明）も書いてください",
        path: ["coverAlt"],
      }),
});

export const collections = { works };
