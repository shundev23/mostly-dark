import { getCollection, type CollectionEntry } from "astro:content";
import { withBase } from "./paths";

export type Work = CollectionEntry<"works">;

/**
 * 公開する作品を新しい順に返す。
 * draft: true の作品は、開発サーバー（npm run dev）でだけ表示する。
 */
export async function getPublishedWorks(): Promise<Work[]> {
  const works = await getCollection("works", ({ data }) => import.meta.env.DEV || !data.draft);
  return [...works].sort((a, b) => b.data.publishedAt.getTime() - a.data.publishedAt.getTime());
}

/** 作品のリンク先を、実際に <a href> へ入れるURLにする */
export function workUrl(work: Work): string {
  return withBase(work.data.href);
}
