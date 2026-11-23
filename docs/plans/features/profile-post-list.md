# プロフィール画面 投稿一覧(1画面1カード縦スクロール)実装方針

> 既存の `docs/plans/features/*.md` と同様に `[確認済]` `[提案]` `[未確定]` タグを使用。実装は別会話で行う。

## 1. 機能の概要

- プロフィール画面の自己紹介の下に、そのユーザーの過去の投稿をカードで一覧表示する。
- 1画面に表示されるカードは1枚。下スクロールで次の投稿カードに移る(Xのような縦スクロール)。
- 現状 [確認済]:
  - `app/profile/page.tsx`(自分)と `app/profile/[userId]/page.tsx`(他人)はどちらも client component で、`useEffect` + ブラウザ用 Supabase クライアントで取得。
  - `other-user-profile-screen.md` と `DESIGN.md` §7.2 に「投稿一覧は将来追加予定」とあり、本機能はその続き。
  - 投稿カードは `components/PostCard.tsx` のみ(ホームの `app/page.tsx` で使用)。ページネーションは既存コードに無い。
- 対象画面 [未確定]: 自分(`/profile`)と他人(`/profile/[userId]`)の両方に出すのか。依頼文は「その人の投稿」とあるため、**両方に表示する案**で記述する。要確認。

## 2. 実装方針

### 2.1 表示レイアウト(スクロール構造)の比較

`.app-main`(globals.css:77)が非ホームページのスクロールコンテナで、`body` は `overflow:hidden`。ビューポート高さは「画面 − ヘッダー105px(700px未満は150px) − フッター49px」。

| 案 | 内容 | 長所 | 短所 |
|---|---|---|---|
| A(推奨) | プロフィールカードの下に、固定高さの専用スクロールコンテナ(`scroll-snap-type: y mandatory`)を置く | 他ページに影響しない。CSSのみで完結 | ページスクロールとリスト内スクロールの二重スクロール(プロフィールを読み終えた後にリストへ入る) |
| B | `.app-main` 自体をスナップコンテナにし、プロフィールカードも1スナップ項目にする | 二重スクロールなし | `.app-main` は全ページ共通。プロフィール画面のみクラス切替が必要で影響範囲が広い |
| C | スナップなし、各カードに `min-height` を与え通常スクロール | 最も単純 | 「1画面1カード」にならず要件を満たさない |

推奨: **A**。依頼範囲外の共通レイアウト変更を避けられる。二重スクロールの体験は実装後に確認し、不満なら B を別途検討する。

### 2.2 データ取得方式の比較

| 案 | 内容 | 評価 |
|---|---|---|
| A(推奨) | ブラウザ Supabase クライアントで `.range()` によるページング + IntersectionObserver で追加読み込み | 既存アーキテクチャ(全てクライアント側取得、Route Handler/Server Action なし)と整合 |
| B | 全件一括取得(ホームの `loadFeed` と同方式) | 最小実装だが、投稿が増えると重い。ホームも同様なので許容する選択肢はある |
| C | Server Component 化 / API Route 新設 | 既存構成から外れ過剰。不採用 |

推奨: **A**(1ページ 10件程度、件数は [提案])。

## 3. 具体的な設計・実装方法

### 3.1 新規コンポーネント `components/ProfilePostList.tsx`(client)
- props: `userId: string`(表示対象)、`username: string`、`viewerId: string | null`(PostCard の edit/delete 判定用、ログインユーザーID)。
- 内部 state: `posts`, `tagsByPost`, `hasMore`, `loading`, `error`。
- 取得クエリ(ホーム `loadFeed` の手動 join を踏襲、`app/page.tsx:27-111` 参照):
  1. `posts.select("*").eq("user_id", userId).order("created_at", {ascending:false}).order("id", {ascending:false}).range(from, to)`
  2. `post_tags.select("post_id, tags(id, name)").in("post_id", ids)` → `lib/tags.ts` の `normalizeTags` でグルーピング
  - username は親ページが取得済みのため `profiles` クエリは不要。
- 追加読み込み: リスト末尾の番兵要素を `IntersectionObserver` で監視。`root` はスナップコンテナ(窓全体ではない)。`range` の戻り件数が1ページ未満なら `hasMore=false`。
- 各投稿を `<div className="profile-post-item">`(スナップ項目、高さ=コンテナ高さ、中央寄せ)で包み、既存 `PostCard` をそのまま使う。
- 空状態: 「まだ投稿がありません。」(ホームの「該当する投稿はありません。」に倣う)。
- 読み込み中/エラー: 既存同様に「読み込み中...」と日本語メッセージ。失敗時は `console.error` + 画面にメッセージ、再読み込みは [未確定](リトライボタンの要否)。

### 3.2 `PostCard` の再利用
- `onDelete` が必須: 削除時は state から該当投稿を除くハンドラを渡し、`supabase.from("posts").delete()` 自体はホームの `handleDelete`(app/page.tsx)と同じ処理を踏襲。
- `PostCard` 自体は原則変更しない。`.post-card` は高さ220px・3行クランプ固定(globals.css:255-268, 347-367)なので、`.profile-post-item .post-card` で寸法のみ上書きするか、そのままの大きさで中央配置する [未確定: 1画面1枚に見せるためカードを拡大するか、カードは据え置きで余白を大きく取るか]。

### 3.3 プロフィールページへの組み込み
- 自己紹介 `textarea#bio` の `</div>` の後(`app/profile/[userId]/page.tsx` 約117行目、`app/profile/page.tsx` は保存ボタン/メッセージの後)に `<ProfilePostList />` を配置。
- 自分のページは編集フォーム直下に置くか、保存ボタンの下に置くか [未確定]。保存ボタンより下を推奨。

### 3.4 スタイル(`app/globals.css` のプロフィール節に追加、BEM・`profile-post-*` 接頭辞)
- `.profile-post-list`: `height: calc(100dvh - 105px - 49px)`(700px未満はヘッダー150px。既存メディアクエリに合わせる)、`overflow-y:auto`、`scroll-snap-type:y mandatory`、`overscroll-behavior:contain`。
- `.profile-post-item`: `height:100%`、`scroll-snap-align:start`、中央配置。
- 既存のカスタムスクロールバー(未コミットの globals.css 変更)は `*` に掛かるため自動適用。
- ヘッダー高さの値は実装時に globals.css で再確認(本調査の値はエージェント報告ベース)。

## 4. 変更・追加が想定されるファイル

| ファイル | 内容 |
|---|---|
| `components/ProfilePostList.tsx`(新規) | 取得・ページング・描画 |
| `app/profile/[userId]/page.tsx` | `ProfilePostList` を配置 |
| `app/profile/page.tsx` | 同上(対象に含める場合) |
| `app/globals.css` | `.profile-post-list` / `.profile-post-item` 追加 |
| `lib/types.ts` | 追加不要の見込み(`Post` `Tag` 流用) |
| `DESIGN.md` §7 | 「投稿一覧は将来追加予定」を更新(他の plan が実装後更新としている慣例に従う) |

## 5. データベースへの変更

- **スキーマ変更は不要**(`posts.user_id` と `created_at` は既存)。
- インデックス [未確定]: `DATABASE.md` ではインデックス未確認。`posts(user_id, created_at DESC)` の複合インデックスがあると望ましいが、現状データ量では必須ではない。必要なら別途 SQL を検討(本件では提案のみ)。
- RLS [確認済]: 認証済みユーザーは `posts` を SELECT 可能なため他人の投稿も取得できる。未ログインは不可で、両プロフィールページが事前に `auth.getUser()` を確認済み。
- 削除権限 [要確認]: 調査上、`posts` の DELETE ポリシーが無い(`DATABASE.md` §3.2 と §5.4 / 今回差分で記述が食い違う)。削除ボタンを出すと失敗する可能性があるため、実装前に実DBの確認が必要。既存ホームの問題で本機能の範囲外だが、挙動の前提として明記する。

## 6. 処理フロー

1. プロフィールページ表示 → `auth.getUser()` → プロフィール取得(既存)。
2. `ProfilePostList` マウント → 1ページ目(10件)を `posts` から取得 → `post_tags` でタグ取得 → 描画。
3. ユーザーが下スクロール → 次カードへスナップ。
4. 末尾付近の番兵が表示 → 次ページ取得・追記。件数が1ページ未満なら終了。
5. 自分の投稿のカードで編集/削除 → `PostCard` 既存処理。削除時は一覧 state から除去。

## 7. 実装後の確認・テスト項目

(テストツール未導入のため手動確認。`npm run lint` / `npm run build` が通ること)
- 自己紹介の下に投稿が新しい順で表示される。
- 1画面に1カードのみ、スクロールでスナップして次のカードに移る(PC/スマホ幅の両方、ヘッダー150px時含む)。
- 投稿0件 / 1件 / 10件ちょうど / 11件以上(追加読み込み)の各ケース。
- 追加読み込みで重複・欠落がない。最後まで来たら読み込みが止まる。
- 他人のページでは編集/削除ボタンが出ない。自分のページでは出る。
- タグ、投稿内容リンク(`/post/[id]`)、ユーザー名リンクが動作する。
- 取得失敗(オフライン等)でメッセージが表示される。
- ホーム画面のカード表示、他ページのスクロールに影響が出ていない。
- 未ログイン時に従来どおりログイン促進表示になる。

## 8. 実装時の注意点

- AGENTS.md のとおり、このNext.js(16.2.7)は既知のものと異なる。実装前に `node_modules/next/dist/docs/01-app/01-getting-started/` の client components / data fetching ガイドを読む(本調査では未読)。
- スタイルは globals.css の BEM 方式に統一し、Tailwind ユーティリティは新規に多用しない。
- `.app-main` 内ネストスクロールになるため、`overscroll-behavior: contain` でスクロール連鎖を制御。
- IntersectionObserver の `root` をスナップコンテナにしないと追加読み込みが発火しない。
- 並び順は `created_at` が同値になり得るため `id` を二次キーにする。
- 範囲外(提案しない): 無限スクロールのホーム適用、PostCard の大改修、DELETE ポリシー修正、インデックス追加の実施、投稿ソート/フィルタ。

## 9. 決定済み・未決定

- 決定(推奨案): 専用スナップコンテナ(2.1 A)、クライアント側 `.range()` ページング(2.2 A)、`PostCard` 再利用。
- 未決定: 対象画面(両方か)、カードを拡大するか、自分のページでの配置位置、1ページ件数、リトライUIの要否、DELETE権限の実態、`DESIGN.md` 更新を同時に行うか。
