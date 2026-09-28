# ほぼダーク

宇宙の95%を占める「見えないもの」を、式とデータで追いかける。
ダークマターとダークエネルギーを中心に、天体物理学・宇宙論を独学している記録。

公開URL: https://shundev23.github.io/mostly-dark/

## 3つの棚

| 棚 | URL | 中身 |
|---|---|---|
| 作品 | `/mostly-dark/works/` | 3Dや図解で、目に見えない動きを見えるようにしたもの |
| 実習 | `/mostly-dark/labs/` | 公開データを自分で解析して、教科書の話を数字で確かめた記録（準備中） |
| ノート | `/mostly-dark/notes/` | 教科書の式を、飛ばさずに手で追った記録（準備中） |

## ディレクトリ構成

```
mostly-dark/
├── .github/
│   └── workflows/
│       └── deploy.yml            # main に push → ビルド → GitHub Pages に公開
├── public/                       # 加工せずにそのまま配信するファイル
│   ├── favicon.svg               # 宇宙の組成を描いた扇形のアイコン
│   └── works/
│       └── particle-tracks/      # 作品「素粒子の軌跡」の本体（three.js の静的ページ）
├── src/
│   ├── components/               # 画面の部品
│   │   ├── CompositionBar.astro  # トップの帯グラフ（宇宙の組成）
│   │   ├── EmptyState.astro      # まだ中身がない棚の表示
│   │   ├── PageHeader.astro      # 各棚のページ上部
│   │   ├── ShelfCard.astro       # トップの棚のカード
│   │   ├── SiteFooter.astro
│   │   ├── SiteHeader.astro
│   │   └── WorkCard.astro        # 作品のカード
│   ├── content/
│   │   └── works/                # 作品の紹介（1作品 = 1ファイル）
│   │       ├── covers/           # カードに出す表紙画像
│   │       └── particle-tracks.md
│   ├── data/
│   │   └── composition.ts        # 宇宙の組成の数値（Planck 2018）
│   ├── layouts/
│   │   └── BaseLayout.astro      # 全ページ共通の <head>・ヘッダー・フッター
│   ├── lib/
│   │   ├── format.ts             # 日付の表示（日本時間に固定）
│   │   ├── paths.ts              # base 付きのサイト内リンクを作る withBase()
│   │   └── works.ts              # 作品一覧の取得（新しい順・下書きを除く）
│   ├── pages/                    # ファイルの場所がそのままURLになる
│   │   ├── index.astro           # トップ          → /mostly-dark/
│   │   ├── works/index.astro     # 作品の一覧      → /mostly-dark/works/
│   │   ├── labs/index.astro      # 実習（準備中）  → /mostly-dark/labs/
│   │   ├── notes/index.astro     # ノート（準備中）→ /mostly-dark/notes/
│   │   └── 404.astro             # 見つからないページ
│   ├── styles/
│   │   └── global.css            # 色・文字・余白の基準
│   ├── content.config.ts         # 作品の項目の定義（書き間違いをビルド時に止める）
│   └── site.ts                   # サイト名と、3つの棚の名前・説明
├── tools/
│   ├── check-links.mjs           # ビルド後のリンク切れ検査
│   └── public-dir-index.mjs      # 開発サーバーでも public/ の作品を本番と同じURLで開く
├── .gitignore
├── .nvmrc                        # Node のバージョン（24）
├── astro.config.mjs              # site・base などの設定
├── package.json
├── package-lock.json             # 依存パッケージのバージョンを固定（GitHub Actions もこれを使う）
├── tsconfig.json
└── README.md
```

## 手元で動かす

Node.js 22.12 以上が必要（GitHub Actions では 24 を使う）。

| コマンド | すること |
|---|---|
| `npm install` | 依存パッケージを入れる（最初の1回と、package.json を変えたとき） |
| `npm run dev` | 開発サーバーを起動 → http://localhost:4321/mostly-dark/ |
| `npm run build` | 型チェック → ビルド → リンク検査。GitHub Actions と同じ内容 |
| `npm run preview` | ビルド結果（dist/）を本番と同じ形で確認 |

## 作品を追加する

1. 作品のファイル一式を `public/works/作品名/` に置く。入口は `index.html` にして、ページ内の CSS・JS・画像は相対パスで読み込む。
2. `src/content/works/作品名.md` を作り、一覧に出す情報を書く。

   ```md
   ---
   title: 作品名
   summary: 一覧のカードに出す一行説明（120文字まで）
   publishedAt: 2026-10-01
   href: works/作品名/
   tags: [タグ1, タグ2]
   cover: ./covers/作品名.webp     # 任意。付けたら coverAlt も必須
   coverAlt: 表紙画像の説明
   draft: false                    # true にすると本番には出ない（npm run dev では見える）
   ---
   ```

3. `npm run build` が通れば、push して公開できる状態。次のような書き間違いは、ここでエラーになる。
   - `href` を `/works/...` のように `/` で始めた（本番で404になる書き方）
   - 表紙画像のファイル名が違う、`coverAlt` を書き忘れた
   - リンク先のファイルが無い

## 公開の流れ

`main` に push すると、GitHub Actions が「インストール → 型チェック → ビルド → リンク検査 → 公開」を自動で行う。途中で失敗したら公開されず、前の版がそのまま残る。進み具合はリポジトリの Actions タブで見られる。

## base（/mostly-dark/）について

GitHub Pages のプロジェクトサイトなので、サイト全体が `/mostly-dark/` の下に置かれる。

- サイト内リンクは `src/lib/paths.ts` の `withBase()` を通す。`<a href="/works/">` と直接書くと本番で404になり、`npm run build` のリンク検査で止まる。
- リポジトリ名を変えたら、`astro.config.mjs` の `base` も同じ名前に変える。

## 使っているもの

- [Astro](https://astro.build/) 7
- [three.js](https://threejs.org/) r128（MIT License、`public/works/particle-tracks/vendor/three/` に同梱）
- Google Fonts：IBM Plex Sans JP / IBM Plex Mono / Shippori Mincho / STIX Two Text
- 宇宙の組成の数値：Planck Collaboration (2020), *A&A* 641, A6（[arXiv:1807.06209](https://arxiv.org/abs/1807.06209)）
