# 機能実装方針: チャット画面での画像・動画の投稿

確認の種類: [確認済]=コードで確認 / [提案]=本方針の提案 / [未確定]=仕様不明・要確認(実装前に決める)

## 1. 機能の概要

- 投稿のチャット画面（`/post/[id]`）で、テキストに加えて**画像・動画**を送信・表示できるようにする。
- 合意済みの仕様:
  - 画像・動画は**ログインユーザーのみ閲覧可**（非公開バケット＋署名付きURL）。
  - 1チャット内で送信できる画像・動画の**件数制限はなし**。
  - チャットの**投稿者も返信者も**送信できる（＝ログインユーザー全員。既存のコメント権限と同じ）。
  - **投稿作成画面（`/post`）では添付不可**。今回の対象はチャットのみ。

### 現状の確認

- [確認済] チャットは `app/post/[id]/page.tsx`（client component）。メッセージは `comments` テーブルを利用し、Supabase Realtime（`postgres_changes` の INSERT）で新着を購読している。
- [確認済] `comments` は `id, user_id, post_id, content, created_at`。`content` は NOT NULL かつ「500文字以下・空白のみ不可」の CHECK 制約あり（制約名は未確認）。
- [確認済] RLS: comments の SELECT=認証済み、INSERT/DELETE=本人、UPDATE なし。
- [確認済] Supabase Storage の利用実績はなし。マイグレーション用ディレクトリもなく、DB変更は SQL エディタで実施し `DATABASE.md` に記録する運用。
- [確認済] `lib/types.ts` の `Comment` 型は `id, user_id, content, created_at`。
- [確認済] 画像表示は `components/Header.tsx` で `next/image`（ローカル画像）を使っているのみ。`next.config.ts` に `images` 設定はない。
- [確認済] `TASKS.md` に「画像投稿機能」が未完了タスクとして存在する。

## 2. 実装方針（比較と推奨）

### 2.1 メッセージとメディアの紐付け

| 案 | 内容 | 長所 | 短所 |
|---|---|---|---|
| **A（推奨）** | `comments` に `media_path` / `media_type` 列を追加。1メッセージ＝最大1ファイル | 既存の取得・Realtime・削除処理・RLSがそのまま使える。INSERT が1回で済む | 1メッセージに複数添付はできない（複数送るときは複数メッセージ） |
| B | 添付用テーブル `comment_media`（1:N）を新設 | 1メッセージに複数添付できる | テーブル・RLS・JOIN・Realtime購読が増え、INSERT が2段階になり失敗時の整合性処理も増える |
| C | `chat_media_messages` など別テーブルでメディア専用メッセージを管理 | 既存 comments に手を入れない | 一覧が2系統になり並び替え・購読が複雑。過剰 |

**推奨は A。** 「1チャット内の件数制限なし」は、1メッセージ1ファイルを繰り返し送れることで満たせる。1メッセージに複数添付が必須なら B に切り替える（[未確定] 参照）。

### 2.2 ファイルの保存・配信

- **Supabase Storage の非公開バケット `chat-media`** に保存し、表示時に**署名付きURL**（`createSignedUrls`）を発行する。[提案]
- アップロードはブラウザから Supabase クライアントで直接行う（既存の「独自バックエンドなし」方針に合わせる）。権限は Storage の RLS で制御する。
- 表示は `<img>` / `<video>` を使う（`next/image` は使わない）。理由: 署名付きURLは期限付きで毎回変わるため画像最適化のキャッシュが効かず、ユーザー投稿画像はサイズも不明なため。ESLint の `@next/next/no-img-element` は理由をコメントして該当行のみ無効化する。[提案]

## 3. 具体的な設計・実装方法

### 3.1 受け付けるファイル [提案・値は要確認]

| 種別 | MIME | 上限サイズ |
|---|---|---|
| 画像 | `image/jpeg`, `image/png`, `image/webp`, `image/gif` | 10MB |
| 動画 | `video/mp4`, `video/webm`, `video/quicktime` | 50MB |

- SVG は XSS の危険があるため除外する。HEIC はブラウザで表示できないことが多いため除外する。
- Supabase 無料プランはアップロード1ファイルあたりの上限がグローバルで 50MB のため、動画上限は 50MB 以下にする（プランは要確認）。
- JPEG / PNG / WebP は、3.3 の再エンコード後の画像をアップロードする（元画像はアップロードしない）。

### 3.2 ストレージのパス設計

```
chat-media/{user_id}/{post_id}/{uuid}.{拡張子}
```

- 先頭フォルダを `user_id` にし、Storage RLS で「自分のフォルダにだけ書き込める」ようにする。
- ファイル名は `crypto.randomUUID()` で生成する。拡張子は元のファイル名ではなく MIME から決める（ファイル名に含まれる個人情報や不正な文字を持ち込まないため）。
- 拡張子と `contentType` は、**アップロードする Blob の MIME**（JPEG/PNG/WebP は再エンコード後の Blob）から決める。
- `upsert: false` を指定してアップロードする。

### 3.3 画像メタデータの除去 [決定済み]

匿名性を守るため、JPEG / PNG / WebP はアップロード前にブラウザの Canvas で再エンコードし、EXIF（GPS 位置情報・撮影日時・カメラ情報など）を引き継がないようにする。

- **新規ファイル `lib/stripImageMetadata.ts`**: `stripImageMetadata(file: File): Promise<Blob>`
  - チャット専用の処理ではないため `lib/chatMedia.ts` から分離する（将来ほかの画像アップロードでも使える）。
- **処理手順**
  1. `createImageBitmap(file, { imageOrientation: "from-image" })` で読み込む。EXIF Orientation を適用した向きでピクセルを取得するため、Canvas に描いた時点で正しい向きになり、Orientation タグがなくなっても向きが崩れない。
  2. `bitmap.width` × `bitmap.height` の Canvas を作り、`drawImage` で描画する（PNG・WebP の透過を保つため背景は塗らない）。
  3. `canvas.toBlob(callback, 出力MIME, 品質)` で出力する。

     | 入力 | 出力MIME | 品質 |
     |---|---|---|
     | image/jpeg | image/jpeg | 0.9 |
     | image/png | image/png | 指定なし（可逆・透過維持） |
     | image/webp | image/webp | 0.9 |

  4. `bitmap.close()` でメモリを解放する。
- **エラーとして扱う条件**（いずれの場合も元画像はアップロードしない）
  - `createImageBitmap` の失敗（壊れたファイル、拡張子だけ偽装したファイル、Canvas の最大サイズ超過など）
  - `toBlob` の結果が `null`
  - 出力 Blob の `type` が指定した MIME と違う（WebP をエンコードできないブラウザは PNG で返すことがあるため）
  - 再エンコード後のサイズが画像の上限（10MB）を超える（PNG は元より大きくなることがある）
- **GIF**: 対象外。再エンコードせず元ファイルをそのままアップロードする（Canvas ではアニメーションが失われるため）。
- **実行タイミング**: ファイル選択時に実行し、結果の Blob を状態に保持する。プレビューも再エンコード後の Blob から作るため、「実際にアップロードされる画像」と「向き」を送信前に確認できる。処理中は送信ボタンを無効にし、「画像を処理中...」を表示する。

### 3.4 共通処理 `lib/chatMedia.ts`（新規）

画面からストレージ処理を分離し、ページを肥大化させない。

- `CHAT_MEDIA_BUCKET`、許可MIME、サイズ上限の定数
- `validateChatMedia(file)` → `{ type: "image" | "video" }` かエラーメッセージ（形式・元ファイルのサイズ）
- `prepareChatMedia(file)` → `{ blob, type }`。`validateChatMedia` → JPEG/PNG/WebP なら `stripImageMetadata` → 再エンコード後のサイズ確認、の順に行う。失敗時はエラーメッセージを返す
- `uploadChatMedia(userId, postId, blob)` → 保存したパス（引数は再エンコード後の `Blob`）
- `createChatMediaUrls(paths)` → `Record<path, signedUrl>`（`createSignedUrls` でまとめて発行。有効期限は 1 時間を想定）
- `removeChatMedia(path)` → ストレージから削除

### 3.5 表示コンポーネント `components/ChatMedia.tsx`（新規）

- props: `type`, `url`（未発行なら `undefined`）
- `image` → `<img loading="lazy" alt="添付画像">`、`video` → `<video controls preload="metadata" playsInline>`
- URL 未取得のときは読み込み中プレースホルダーを表示する。
- 読み込みエラー時（署名付きURLの期限切れなど）は親に通知し、URL を1回だけ再発行する。

### 3.6 チャット画面 `app/post/[id]/page.tsx` の変更

- **状態の追加**: `preparedMedia: { blob: Blob; type: "image" | "video" } | null`、`processing`（再エンコード中）、`previewUrl`（再エンコード後の Blob から作成。`URL.createObjectURL`。解除時・送信後・アンマウント時に `revokeObjectURL`）、`mediaUrls: Record<string, string>`
- **初期取得**: comments 取得後、`media_path` を持つものをまとめて `createChatMediaUrls` で URL を発行する。
- **Realtime / 自分の送信**: 追加されたメッセージに `media_path` があれば、その1件分の URL を発行して `mediaUrls` に追加する。`payload.new` には追加列も含まれるため、購読処理の変更は不要。
- **入力欄**:
  - 非表示の `<input type="file" accept="image/*,video/*">` と添付ボタンを `chat-room__form-footer` に追加する。
  - 選択時に `prepareChatMedia` を実行し（処理中は `processing`）、NGなら既存の `errorMessage` に表示して添付しない。
  - 選択中はプレビュー（画像サムネイル／動画）と「取り消す」ボタンを表示する。
  - 送信ボタンの有効条件を「処理中でなく、`input.trim()` があるか `preparedMedia` がある」に変更する。
- **送信 `handleSend`**:
  1. `preparedMedia` があれば、その Blob を `uploadChatMedia` でアップロードする。
  2. `comments` に `content`（空なら `""`）、`media_path`、`media_type` を INSERT する。
  3. INSERT に失敗したら、アップロードしたファイルを `removeChatMedia` で削除する（孤立ファイル防止）。
  4. 成功したら入力欄とファイル選択をリセットする。
  - 送信中は添付ボタンも無効化する（既存の `sending` を流用）。ボタン表示は動画アップロードが長いことを考え「送信中...」のままでよい。
- **削除 `handleDeleteComment`**: comments の行を削除した後、`media_path` があればストレージからも削除する。ストレージ削除の失敗はログのみ（画面上は削除済みとして扱う）。行を先に消すことで「画像だけ消えて壊れたメッセージ」が残らないようにする。
- **表示**: `chat-message__body` 内で、`content` が空でなければ本文を、`media_path` があれば `ChatMedia` を表示する。

### 3.7 スタイル `app/globals.css`

既存の BEM 風命名（`DESIGN.md` 準拠）に合わせて追加する。

- `.chat-message__media`（最大幅・最大高さ、角丸、`object-fit: contain`）
- `.chat-room__attach`（添付ボタン）
- `.chat-room__preview` / `.chat-room__preview-remove`（送信前プレビュー）

## 4. 変更・追加が想定されるファイル

| ファイル | 種別 | 内容 |
|---|---|---|
| `app/post/[id]/page.tsx` | 変更 | ファイル選択・プレビュー・送信・削除・表示 |
| `lib/chatMedia.ts` | 新規 | 検証・前処理・アップロード・署名URL発行・削除 |
| `lib/stripImageMetadata.ts` | 新規 | Canvas 再エンコードによる画像メタデータの除去 |
| `components/ChatMedia.tsx` | 新規 | 画像／動画の表示 |
| `lib/types.ts` | 変更 | `Comment` に `media_path: string \| null`、`media_type: "image" \| "video" \| null` を追加 |
| `app/globals.css` | 変更 | メディア・添付ボタン・プレビューのスタイル |
| `DATABASE.md` | 変更 | comments の追加列・制約、Storage バケットとポリシーを追記 |
| `ARCHITECTURE.md` | 変更 | 基本構成に Supabase Storage を追記 |
| `TASKS.md` | 変更 | 「画像投稿機能」の状態を更新 |

## 5. データベースへの変更

Supabase の SQL エディタで実行する。実行前に `DATABASE.md` §11.1 に従い実DBの構造を確認すること。

### 5.1 comments への列追加と制約

```sql
-- メディア列の追加（既存行は NULL のまま）
alter table comments
  add column media_path text,
  add column media_type text;

-- 種別は image / video のみ
alter table comments
  add constraint comments_media_type_check
  check (media_type in ('image', 'video'));

-- path と type は両方あるか、両方ないか
alter table comments
  add constraint comments_media_pair_check
  check ((media_path is null) = (media_type is null));

-- 自分のフォルダ以外のファイルを参照させない
alter table public.comments
add constraint comments_media_path_owner_check
check (
  media_path is null
  or media_path like user_id::text || '/' || post_id::text || '/%'
);

-- 本文チェックの置き換え：メディアがあれば本文は空でもよい
-- ※既存の制約名は未確認。下記で確認してから drop する
-- select conname from pg_constraint where conrelid = 'public.comments'::regclass and contype = 'c';
BEGIN;

ALTER TABLE public.comments
DROP CONSTRAINT comments_content_check;

ALTER TABLE public.comments
ADD CONSTRAINT comments_content_check
CHECK (
  char_length(content) <= 500
  AND (
    btrim(content, E' \t\n\r　') <> ''
    OR (
      content = ''
      AND media_path IS NOT NULL
    )
  )
);

COMMIT;
```

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| media_path | text | NULL可 / 所有者チェック | Storage 上のパス（`{user_id}/{post_id}/{uuid}.{ext}`） |
| media_type | text | NULL可 / `image` or `video` | メディア種別 |

- `content` の NOT NULL は維持し、メディアのみのメッセージは `""` を入れる。
- comments の RLS ポリシーは**変更不要**（INSERT=本人、DELETE=本人のまま）。
- UPDATE ポリシーがないため、送信後にメディアを差し替えることはできない（仕様どおり）。

### 5.2 Storage バケット

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media',
  'chat-media',
  false,
  52428800, -- 50MB（動画の上限。画像の 10MB はアプリ側で検証）
  array[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]
);
```

- `allowed_mime_types` と `file_size_limit` により、クライアント検証を回避されてもサーバー側で弾ける。

### 5.3 Storage の RLS（`storage.objects`）

```sql
-- ログインユーザーはチャットメディアを閲覧できる（署名付きURLの発行に必要）
create policy "Authenticated users can view chat media"
on storage.objects for select
to authenticated
using (bucket_id = 'chat-media');

-- 自分のフォルダにのみアップロードできる
create policy "Users can upload own chat media"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 自分のファイルのみ削除できる
create policy "Users can delete own chat media"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- UPDATE ポリシーは作成しない（上書き・差し替え不可）
```

## 6. 処理フロー

### 送信

```
ファイル選択 → validateChatMedia（MIME・元サイズ）
  ├ NG → エラー表示
  └ OK
     ├ [JPEG/PNG/WebP] stripImageMetadata（Canvas で再エンコード）
     │    ├ 失敗 → エラー表示（元画像はアップロードしない）
     │    └ 成功 → 再エンコード後のサイズ確認
     │         ├ NG → エラー表示
     │         └ OK → 再エンコード後の Blob でプレビュー表示
     └ [GIF / 動画] 元ファイルのままプレビュー表示
送信ボタン
  → uploadChatMedia（preparedMedia の Blob。Storage RLS・バケット制限でサーバー側も検証）
     ├ 失敗 → エラー表示（DBには何も書かない）
     └ 成功 → comments に INSERT（content / media_path / media_type）
          ├ 失敗 → removeChatMedia でファイル削除 → エラー表示
          └ 成功 → 署名URL発行 → 一覧に追加 → 入力欄リセット
```

### 受信・表示

```
初期表示: comments 取得 → media_path をまとめて createSignedUrls → 表示
他ユーザー送信: Realtime INSERT → media_path があれば1件分 URL 発行 → 表示
URL期限切れ: <img>/<video> の onError → 1回だけ再発行
```

### 削除

```
削除ボタン → comments DELETE（RLS で本人のみ）
  → 成功: media_path があれば Storage から削除（失敗はログのみ）→ 一覧から除去
```

## 7. 実装後の確認・テスト項目

### 機能

- [ ] 画像のみ／動画のみ／本文＋画像／本文＋動画を送信できる
- [ ] 送信した画像・動画が自分の画面に表示される
- [ ] 別ブラウザ（別ユーザー）に Realtime で画像・動画が表示される
- [ ] 再読み込み後も表示される（署名URLの一括発行）
- [ ] 同じチャットで続けて複数のメディアを送信できる
- [ ] 投稿者・返信者どちらのアカウントでも送信できる
- [ ] 選択後の「取り消す」でプレビューが消え、テキストのみ送信になる
- [ ] 自分のメディアメッセージを削除すると、Storage からもファイルが消える
- [ ] 本文もファイルもない状態では送信ボタンが無効
- [ ] 投稿作成画面（`/post`）には添付UIがない

### 入力検証・エラー

- [ ] 許可外の形式（SVG、PDF、HEIC など）はエラー表示になる
- [ ] 上限超過ファイル（画像 10MB 超、動画 50MB 超）はエラー表示になる
- [ ] 通信を切った状態で送信するとエラー表示になり、入力内容・選択ファイルが残る
- [ ] INSERT 失敗時にアップロード済みファイルが残らない

### 画像メタデータ

- [ ] GPS 付きの JPEG を送信し、Storage からダウンロードしたファイルに EXIF（GPS・撮影日時・カメラ情報）が残っていないことを exiftool などで確認する
- [ ] PNG・WebP も同様にメタデータが残っていない
- [ ] スマホで縦向きに撮影した写真（Orientation=6 など）が、プレビュー・送信後ともに正しい向きで表示される
- [ ] 透過 PNG の透過が保たれる
- [ ] WebP は WebP（`image/webp`）で保存される
- [ ] 壊れたファイル・拡張子だけ変えたファイルはエラーになり、Storage にも comments にも何も残らない
- [ ] 再エンコード中は送信ボタンが無効で「画像を処理中...」が表示される
- [ ] GIF はアニメーションしたまま送信・表示される
- [ ] iPhone Safari・Android Chrome・PC（Chrome / Firefox / Safari）で確認する

### セキュリティ（DevTools やコンソールから直接 Supabase API を叩いて確認）

- [ ] 未ログインでは署名URL発行・アップロードができない
- [ ] 他人の `user_id` フォルダにアップロードできない
- [ ] 他人のファイルを削除できない
- [ ] 他人のフォルダのパスを `media_path` に指定した comments を INSERT できない
- [ ] `media_type` に `image`/`video` 以外を入れられない
- [ ] 許可外 MIME のファイルを API で直接アップロードしても拒否される
- [ ] 既存のテキストメッセージの送信・表示・削除が従来どおり動く

### 表示

- [ ] 縦長・横長・大きな画像がメッセージ枠からはみ出さない
- [ ] スマホ幅で表示が崩れない
- [ ] 画像の読み込み後も、最下部への自動スクロールが期待どおり動く

## 8. 実装時の注意点

- **画像の向き（EXIF Orientation）**: 主要ブラウザは現在 EXIF の向きを既定で適用するが、ブラウザ差があるため `imageOrientation: "from-image"` を明示し、実機で確認する。
- **アニメーション WebP**: Canvas で再エンコードすると1枚目だけになる。
- **Canvas のサイズ上限**: iOS Safari は Canvas の面積に上限があり、高画素の写真だと失敗することがある（この場合は仕様どおりエラーになる）。
- **残るメタデータ**: GIF（コメントや XMP）と動画（撮影場所などを含むことがある）のメタデータは除去されない。
- **画質**: JPEG は品質 0.9 で再出力するため、画質がわずかに落ち、ファイルサイズも変わる。
- **自動スクロールのずれ**: 画像は読み込み完了後に高さが確定するため、`scrollHeight` が後から伸びる。画像の `onLoad` で「最下部付近なら再度スクロール」するか、`.chat-message__media` に最大高さを指定してずれを抑える。
- **署名付きURLの期限**: 長時間開いたままだと期限が切れる。`onError` で1回だけ再発行し、無限ループさせない。
- **Object URL の解放**: プレビュー用の `URL.createObjectURL` は送信後・取り消し時・アンマウント時に必ず `revokeObjectURL` する。
- **二重送信**: 動画のアップロードは時間がかかるため、`sending` 中は送信・添付ボタンを無効化する。
- **孤立ファイル**: 投稿の削除（ON DELETE CASCADE）やアカウント削除で comments は消えるが、Storage のファイルは残る。今回の範囲では対応せず、既知の制約として `DATABASE.md` に記載する。
- **型の更新**: `Comment` 型に列を追加したら、`comments` を `select("*")` している箇所で型エラーがないか確認する。
- **Next.js のバージョン**: `AGENTS.md` のとおり、`next/image` など Next.js の API を使う場合は `node_modules/next/dist/docs/` を確認してから実装する（本方針では `<img>` を使うため影響は小さい）。
- **既存制約名の確認**: comments の本文 CHECK 制約名は未確認。SQL 実行前に `pg_constraint` で確認する。

## 9. 未確定事項（実装前に決める）

| 項目 | 内容 | 本方針の仮置き |
|---|---|---|
| 1メッセージの添付数 | 「1チャット内の件数制限なし」は合意済み。1メッセージに複数添付が必要かは未確認 | 1メッセージ1ファイル（必要なら案Bへ変更） |
| 本文とメディアの同時送信 | 本文とメディアを1メッセージで送れるか | 送れる（本文は任意） |
| サイズ上限・形式 | 3.1 の値でよいか。Supabase のプラン上限も要確認 | 画像 10MB / 動画 50MB |
| WebP 非対応ブラウザ | WebP をエンコードできないブラウザ（一部の Safari など）では WebP を送信できない。エラーのままにするか、JPEG/PNG に変換して送るか | エラーのまま |
| 高画素画像の縮小 | 再エンコード前に縮小するか（例: 長辺 4096px）。縮小すれば Canvas の上限による失敗を防げるが、画像は小さくなる | 縮小しない |
| 動画・GIF のメタデータ | 除去されないことを利用者に表示するか | 表示しない |
| 動画の長さ制限 | 秒数で制限するか | 制限なし（サイズのみ） |
| 不適切な画像への対応 | 通報・非表示などの仕組み | 今回の範囲外 |
