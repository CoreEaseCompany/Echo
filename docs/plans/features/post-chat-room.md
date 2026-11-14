# 機能実装方針: 投稿カードからのチャット画面

確認の種類: [確認済]=コードで確認 / [提案]=本方針の提案 / [未確定]=仕様不明・要確認(実装前に決める)

## 1. 機能の概要

- 投稿カードの投稿内容を押下すると、その投稿に紐づくチャット画面へ遷移する。
- 画面構成(image.png):
  - 中央の半透明パネル
  - ① チャットタイトル
  - ② タグ(`#タグ`)
  - ③ メッセージ一覧(各メッセージに色付きの丸アイコン。自分は右、他人は左)
  - ④ 下部の入力欄
  - 上部ナビ(ホーム / 投稿する / プロフィール / ログアウト)は既存の Header を流用する。
- 1投稿 = 1チャットルーム。ログイン済みユーザーなら誰でも参加できる、と解釈している([未確定] 参照)。

### 現状の確認

- [確認済] `components/PostCard.tsx` は本文を `<Link href={`/post/${post.id}`}>` で包んでおり、既に `/post/[id]` へ遷移する。**カード側の導線は変更不要**。
- [確認済] `app/post/[id]/page.tsx` は「投稿詳細 + 共感 + コメント」の未装飾ページ(client component、`useParams()` 使用)。
- [確認済] `comments` テーブル(`id, user_id, post_id, content, created_at`)が既にあり、チャットメッセージと同じ形。
- [確認済] 全ページ `"use client"`。データ取得は `useEffect` + ブラウザ用 supabase クライアント。サーバークライアント、Route Handler、Server Action、Realtime の利用実績はなし。
- [確認済] `posts` に title カラムはない(本文 `content` のみ)。アバターや色アイコンの既存実装もない。

## 2. 実装方針(比較と推奨)

| 案 | 内容 | 長所 | 短所 |
|---|---|---|---|
| **A(推奨)** | 既存の `comments` をメッセージとして再利用し、`/post/[id]` をチャットUIに作り替える | DB変更がほぼ不要。既存のRLSとコードを活用でき、ルート追加もない | 既存のコメント表示・共感ボタンの扱いを決める必要がある |
| B | `chat_messages` テーブルと `/chat/[postId]` を新設する | 既存機能と完全に分離できる | コメントと二重管理になる。DB・ルート・型が増え、過剰 |
| C | 1対1のDM方式(会話テーブルを新設) | プライバシーが高い | 画面構成(複数人の色丸)と合わない。過剰 |

**推奨は A。** 過剰な設計を避け、既存資産を最大限使える。

リアルタイム更新は Supabase Realtime(`postgres_changes`)の購読を推奨する [提案]。Realtime を使わない場合は、取得と送信後の追記だけでも成立するが、他ユーザーの投稿は再読込まで見えない。

## 3. 具体的な設計・実装方法

### 3.1 画面(`app/post/[id]/page.tsx` の再構成)

- 取得
  1. `posts`(id 指定)
  2. `post_tags` + `tags(name)`
  3. `comments`(`post_id` で絞り込み、`created_at` 昇順)
  4. `profiles` は不要(名前を出さない方針。[未確定])
  - ホームと同じ「手動 join」の流儀に合わせる。
- 構造(BEM風。`DESIGN.md` §9 に準拠):

  ```
  section.chat-room
    header.chat-room__header   h1.chat-room__title / ul.chat-room__tags
    div.chat-room__messages    (内部スクロール。overscroll-behavior: contain)
      div.chat-message[.chat-message--mine]
        span.chat-message__avatar (色丸)  /  p.chat-message__text
    form.chat-room__form       textarea + 送信ボタン
  ```

- タイトル: 投稿本文 `content` を表示する。長文はCSSで行数を制限する。[未確定: タイトル専用カラムを追加するか]
- タグ: `#` + タグ名。ホームと同様に `post_tags` → `tags` で取得する。
- 自分/他人の判定: `supabase.auth.getUser()` の id と `comment.user_id` を比較し、一致すれば `--mine` を付与して右寄せにする。
- 色丸: DB変更なしで、`user_id` 文字列のハッシュから hue を算出し `hsl(h 60% 45%)` とする小関数を `lib/` に追加する。同じユーザーは常に同じ色になる。
- 自動スクロール: 初回表示時と新着時に、メッセージ領域の最下部へ移動する。
- 送信: `supabase.from("comments").insert({ post_id, user_id, content })`。
  - trim して空なら送信しない。
  - 成功後に入力欄をクリアする。
  - Enter で送信、Shift+Enter で改行とする [提案・要確認]。
- リアルタイム:
  ```ts
  supabase
    .channel(`post-${id}`)
    .on("postgres_changes",
      { event: "INSERT", schema: "public", table: "comments", filter: `post_id=eq.${id}` },
      handler)
    .subscribe();
  ```
  - `useEffect` の cleanup で `removeChannel` を呼ぶ。
  - 自分の送信分は insert の返り値(`.select().single()`)で追加し、受信側では `id` の重複を除外する。
- 未ログイン: `/login` へ誘導する。`/post` など他のページに route guard がない既存課題は、本件では対象外とし、このページだけ対応する。
- レイアウト・CSS: `app/globals.css` に `.chat-room*` を追加する。
  - パネルは既存のガラス風(半透明 + `backdrop-filter`)を踏襲する。
  - 幅は mockup に合わせ、中央の縦長にする(例: max-width 420px。高さは `.app-main` 内で 100%)。
  - 入力欄は下部に固定し、メッセージ領域だけがスクロールする。
  - `left` や `transform` による位置ずらしは使わない。

### 3.2 PostCard

- 原則変更なし。
- ただし mockup の「投稿内容を押下」を満たすため、現在のリンク範囲(本文のみ)で足りるかを確認する [未確定]。

## 4. 変更・追加が想定されるファイル

| ファイル | 内容 |
|---|---|
| `app/post/[id]/page.tsx` | チャットUIへ再構成(取得・送信・購読) |
| `app/globals.css` | `.chat-room*` / `.chat-message*` のスタイルを追加 |
| `lib/userColor.ts`(新規) | `user_id` → 色を返す関数 |
| `types/`(任意) | `Post` / `Comment` 型。既存は各ファイルで局所定義のため、同じ流儀でもよい |
| `DATABASE.md` | DB変更を行った場合のみ更新(§11 のルール) |
| `components/PostCard.tsx` | 原則変更なし |

## 5. データベースへの変更

- **必須の変更はない**(`comments` を再利用する)。
- 必要になりうる変更(SQLは提示のみ。実行前にユーザー承認が必要 [DATABASE.md §11]):
  1. Realtime の有効化:
     ```sql
     alter publication supabase_realtime add table public.comments;
     ```
  2. 文字数制約(任意):
     ```sql
     alter table public.comments
       add constraint comments_content_len
       check (char_length(btrim(content)) between 1 and 500);
     ```
  3. RLS が `DATABASE.md` の記載どおりか確認する。想定は SELECT が authenticated 全件可、INSERT が `auth.uid() = user_id`。[確認済] リポジトリに SQL やマイグレーションはなく、実DBは未検証。**実DBで要確認。**
- RLS は無効化しない。

## 6. 処理フロー

1. ホームでカードの本文を押下 → `/post/{id}` へ遷移する。
2. ログイン確認。未ログインなら `/login` へ。
3. 投稿・タグ・コメントを取得して描画し、最下部へスクロールする。
4. Realtime チャンネルを購読する。
5. 入力 → 送信 → insert → 自分の画面に即時追加(右・自分の色丸)。
6. 他ユーザーの INSERT を受信 → 左側に追加し、最下部へ移動する。ユーザーが上にスクロール中なら強制スクロールしない [提案]。
7. 画面を離れたら購読を解除する。

## 7. 実装後の確認・テスト項目

- [ ] ホームのカード本文を押すとチャット画面へ遷移する(編集中・ユーザー名リンク・削除ボタンと干渉しない)
- [ ] タイトル・タグ・メッセージ・入力欄が image.png の構成で表示される
- [ ] 自分は右、他人は左に表示される。同じユーザーは同じ色、別のユーザーは別の色になる
- [ ] 空・空白のみは送信できない。送信後に入力欄がクリアされる
- [ ] 2アカウント(別ブラウザ)で、再読込なしに相互にメッセージが届く
- [ ] 自分の送信分が Realtime 受信で重複表示されない
- [ ] 長文・多数のメッセージでも、メッセージ領域だけがスクロールし、入力欄とヘッダーは固定される
- [ ] タグなしの投稿、存在しない・削除済みの投稿ID、メッセージ0件の表示
- [ ] 未ログイン時の挙動、送信失敗時のエラー表示
- [ ] 画面幅 600px 以下でパネルが崩れない
- [ ] `npm run build` と `npm run lint` が通る(テストランナーは未導入)
- [ ] ホーム画面のスクロールとカード配置が従来どおり

## 8. 実装時の注意点

- `AGENTS.md` により、実装前に `node_modules/next/dist/docs/` を確認する。Next 16 では `params` は Promise。client では既存どおり `useParams()` を使ってよい。`middleware` は `proxy.ts` に改名されている。
- 本文は React のテキストとして描画し、`dangerouslySetInnerHTML` は使わない(XSS対策)。
- 実質的な保護は RLS が担う。クライアントから送られる `user_id` は信用せず、RLS で検証されていることを確認する。
- `app/globals.css` と `app/layout.tsx` には未コミットの変更(スクロール修正)がある。競合や巻き込みに注意する。チャットの内部スクロールは `.post-grid-scroll` と同じパターンにする。
- エラーは `alert` ではなく画面内メッセージで表示する(プロフィール画面の流儀に合わせる)[提案]。
- スコープ外(今回は提案しない): 既存ページへの route guard 追加、型の統一リファクタ、nested `<main>` 問題の修正、既読・通知・メッセージ削除。

## 未確定・要確認事項(実装前に決める。推測で実装しない)

1. **参加者**: 投稿には誰でも書き込める公開ルームでよいか。mockup では複数人の色違いの丸が見えるため、複数人と解釈している。
2. **既存コメントとの関係**: 既存のコメントをすべてチャット履歴として表示してよいか。mockup にない共感(empathy)ボタンと投稿者名の表示は、チャット画面から外してよいか。
3. **タイトル**: 投稿本文をタイトルに使うか、`posts.title` を新設するか。
4. **匿名性**: 名前は出さず色丸だけでよいか。丸を押してプロフィールへ移動できるようにするか。自分の色は固定か。
5. **リアルタイム**: 必須か。Supabase の Realtime を有効化してよいか。
6. **メッセージの編集・削除**、最大文字数(500 を仮置き)、Enter での送信可否。
7. **実DBの RLS・テーブル定義**: リポジトリに SQL がないため、実際の設定は未確認。
