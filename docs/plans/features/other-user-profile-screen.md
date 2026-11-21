# 機能実装方針: 他ユーザーのプロフィール画面(閲覧専用)

確認の種類: [確認済]=コードで確認 / [提案]=本方針の提案 / [未確定]=仕様不明・要確認

## 1. 機能の概要

- 他ユーザーのプロフィールを `/profile/[userId]` で閲覧する画面。
- 画面構成は自分のプロフィール(`/profile`)と同じ(パネル・タイトル・色付きアイコン・ユーザーネーム・自己紹介)。「保存する」ボタンは無く、全項目編集不可。メールアドレスは表示しない。
- 自分自身の userId で開いた場合は `/profile`(編集可能な自分用画面)へリダイレクトする。
- 投稿一覧は将来追加予定。今回は未実装。
- 遷移元(実装済み): 投稿カード(`components/PostCard.tsx:78`)、チャットのアイコン(`app/post/[id]/page.tsx:361`)から `/profile/${user_id}` へ。

### 現状の確認

- [確認済] `app/profile/[userId]/page.tsx` は既に存在するが、**素のHTML(h1 / 自己紹介 / `<hr>` / 投稿一覧 / 戻るリンク)で、自分のプロフィールとは見た目が別物**。取得ロジック(`profiles` を `user_id` で `maybeSingle`、エラー/未存在の分岐)は流用できる。
- [確認済] `app/profile/page.tsx` と `app/globals.css:712-820` に `.profile-card*` が実装済み(パネル、`__title`、`__icon`、`__field`、`__input--readonly`、`--state`、`__message`、`__link`)。**CSSは新規追加ほぼ不要**。
- [確認済] アイコンは `getUserColor(userId)`(`lib/userColor.ts`)で決定。チャット・自分のプロフィールと同色になる。
- [確認済] `profiles` は `user_id, username, bio, ...`。メールは持たず `auth.users` にのみある。他ユーザーの `auth.users` はクライアントから読めない。
- [確認済] `Profile` 型は `lib/types.ts`(`user_id, username, bio`)で足りる。
- [確認済] SELECT は認証済みユーザーのみ(DATABASE.md §3.3 / REQUIREMENTS §9)。

## 2. 実装方針(比較と推奨)

| 案 | 内容 | 長所 | 短所 |
|---|---|---|---|
| **A(推奨)** | `app/profile/[userId]/page.tsx` のJSXを `.profile-card*` を使った閲覧専用構造に書き換える。取得ロジックは既存を活用。DB変更なし | 変更が1ファイル、過剰でない。CSS再利用 | 自分用とJSXが約30行重複 |
| B | `components/ProfileCard.tsx`(`readOnly` prop)に共通化し両画面で使う | 見た目変更が1か所 | `/profile` 側も改修が必要=今回の範囲外の変更。画面が2つだけで過剰 |
| C | サーバーコンポーネント化 | サーバー側で取得 | 既存に前例なし。過剰 |

**推奨は A。** 共通化(B)は画面が増えた時に検討する。

## 3. 具体的な設計・実装方法

### 3.1 画面構造([提案])

```
section.profile-card
  h1.profile-card__title          プロフィール
  div.profile-card__icon          style.backgroundColor = getUserColor(profile.user_id)
  div.profile-card__field
    label                         ユーザーネーム
    input[readOnly]               value = profile.username ?? ""   class: profile-card__input--readonly
  div.profile-card__field
    label                         自己紹介
    textarea[readOnly]            value = profile.bio ?? ""        class: profile-card__input--readonly
```

- 「保存する」ボタン・`__footer`・メールアドレス欄・保存メッセージは置かない。
- 既存の「投稿一覧」「`<hr>`」「戻るリンク」は自分のプロフィールに無いため削除する(Header で移動可能)。投稿一覧は画面イメージ未確定のため今回は未実装(将来追加予定)。
- `input` / `textarea` は `disabled` ではなく `readOnly`(文字を選択・コピーでき、スクリーンリーダーにも読まれる)。`.profile-card__input--readonly` を再利用(メール欄と同じ見た目)。
- `.profile-card__field input:focus` の青い枠は編集可能に見えるため、閲覧専用では抑制する小さなCSS追加が必要になる可能性あり(実装時に確認。例: `.profile-card__input--readonly:focus { border-color: #9ca3af; box-shadow: none; }`)。

### 3.2 ロジック(既存を維持)

- `useParams()` で `userId` を取得。まず `auth.getUser()` で本人判定を行い、`user.id === userId` なら `router.replace("/profile")`(`useRouter` / `next/navigation`)で自分用画面へ遷移する。編集UIは `/profile` に一本化し、編集ロジックを重複させない。判定中は「読み込み中...」を表示してちらつきを避ける。
- 他ユーザーの場合は `profiles` を `eq("user_id", userId).maybeSingle()` で取得(既存コード)。
- 状態は `loading` / `profile` / `message`。取得エラー→「プロフィールの取得に失敗しました」、未存在→「プロフィールが見つかりません」を `.profile-card--state` のパネルで表示し、`.profile-card__link` で「ホームへ戻る」リンク(既存の文言・リンクを踏襲)。
- 投稿一覧を表示しないなら `posts` の取得処理と `PostSummary` 型は削除(不要クエリを残さない)。
- 書き込み系(upsert / update)は一切持たない。
- `username` が null/空の場合は「名前未設定」を表示する([提案]。既存画面と同じ表記)。`bio` が空なら空欄のまま。

### 3.3 セキュリティ・エラーハンドリング

- 閲覧専用でも**権限の担保はRLS**(フロントの readOnly は表示制御に過ぎない)。他人の `profiles` の UPDATE は `auth.uid() = user_id` のRLSで拒否される前提。RLS の実設定は確認済みで問題なし。
- メールアドレスは他ユーザー画面に出さない(技術的にも取得不可、かつ匿名SNS方針に沿う)。
- 内部エラー詳細は画面に出さず `console.error` のみ(既存流儀)。
- `userId` はURLパラメータなので任意の文字列が来うる。uuid形式でない場合 Supabase がエラーを返す → 取得失敗として扱われ、クラッシュしない(確認項目に含める)。
- 未ログイン時: 既存はログイン確認なし。RLSで0件→「見つかりません」となり紛らわしい。[提案] `auth.getUser()` で未ログインなら「ログインしてください」+ `/login` リンク(自分のプロフィールと同じ表示)。

## 4. 変更・追加が想定されるファイル

| ファイル | 内容 |
|---|---|
| `app/profile/[userId]/page.tsx` | JSXを閲覧専用パネルに再構成、`getUserColor` import、投稿取得の削除、自分のIDなら `/profile` へリダイレクト、未ログイン分岐(提案) |
| `app/globals.css` | 必要なら readOnly 用のフォーカス抑制を数行追記(末尾追記で他クラスは触らない) |
| `DESIGN.md` §7 | 他ユーザープロフィールの画面構成を実装に合わせて更新 |

新規ファイル・新規コンポーネントなし。`lib/types.ts`・`lib/userColor.ts`・`components/*` は変更なし。

## 5. データベースへの変更

**なし。** 既存の `profiles` を SELECT するのみ。RLS(認証済みユーザーは SELECT 可 / 本人のみ INSERT・UPDATE)は Supabase 側で確認済みで問題なし。

## 6. 処理フロー

1. 投稿カード or チャットのアイコンをクリック → `/profile/{userId}`
2. `auth.getUser()` → 未ログインなら「ログインしてください」で終了(提案)
3. ログインユーザーのID と `userId` が一致 → `router.replace("/profile")` で終了(自分用の編集画面へ)
4. 他ユーザーなら `profiles` を `user_id` で取得
5. エラー → 取得失敗表示 / 0件 → 見つかりません表示 / 取得成功 → 閲覧専用パネルを表示
6. アイコン色は `getUserColor(userId)`、ユーザーネーム・自己紹介を readOnly で表示

## 7. 実装後の確認・テスト項目

- 投稿カード・チャットのアイコンから他ユーザーのプロフィールへ遷移できる。
- 画面が自分のプロフィールと同じ見た目(パネル・アイコン・ラベル位置)で、保存ボタンがない。
- ユーザーネーム・自己紹介が入力・編集できない(キー入力で変化しない)。文字の選択・コピーは可能。
- アイコン色がそのユーザーのチャット上のアイコンと一致する。
- 自己紹介が空 / ユーザー名が未設定のユーザーで崩れない。
- 存在しない uuid、uuid形式でない文字列で「見つかりません」/ 取得失敗表示になりクラッシュしない。
- 未ログインでの表示(提案どおりなら「ログインしてください」)。
- メールアドレスが画面・ネットワークレスポンスに含まれない。
- 開発者ツールで他人の profiles を UPDATE しても拒否される(RLS)。
- 自分自身の `userId`(`/profile/{自分のID}`)を開くと `/profile` に遷移し、これまで通り編集・保存できる。
- スマホ幅(375px)、Header・スクロール・他画面への影響なし。
- `npm run lint` / `npm run build` が通る。

## 8. 実装時の注意点

- 本プロジェクトの Next.js 16 は従来と異なる。実装前に `node_modules/next/dist/docs/` の該当箇所(動的ルート・`useParams`)を確認する(`AGENTS.md`)。
- `/profile/[userId]` は静的ルート `/profile` と共存する。`profile/page.tsx`(自分)は触らない。
- 範囲外: 自分用画面の変更・共通コンポーネント化、フォロー/ブロック/通報、アイコン画像、投稿一覧の高機能化。

## 9. 確定事項・未確定事項

### 確定(ユーザー回答済み)

1. メールアドレス: 他ユーザーのものは表示しない。
2. 投稿一覧: 画面イメージ未確定のため今回は未実装(現状の投稿一覧・投稿取得は削除。将来追加予定)。
3. 自分自身の userId を開いた場合: これまで通り編集可能であること。実現方法として `/profile` へのリダイレクトを採用([提案]。編集UIを1か所に保ち重複を避ける)。
4. RLS: 確認完了、問題なし。

### 未確定

- 閲覧専用の入力欄の見た目(メール欄と同じ灰色 or 通常の白)。本方針はメール欄と同じ `__input--readonly` を再利用。
