# 機能実装方針: プロフィールアイコン画像の変更・保存

確認の種類: [確認済]=コードで確認 / [提案]=本方針の提案 / [未確定]=仕様不明・要確認（実装前に決める）

## 1. 機能の概要

- プロフィール画面（`/profile`）で、アイコンを**写真から選んで設定・変更・削除**できるようにする。
- 画像を設定していないユーザー（および削除したユーザー）は、これまでどおり `getUserColor` の色アイコンを表示する。
- 合意済みの仕様:
  - 画像は**公開バケット**に保存し、公開URLで表示する（URLを知っていればログインなしでも見られる。ファイル名はランダムで推測しにくい）。
  - 表示箇所は**自分のプロフィール・他ユーザーのプロフィール・チャットのアバターの3か所**。
  - 写真は**中央を正方形に自動で切り抜き、256×256px に縮小**して保存する（切り抜き範囲を選ぶUIは作らない）。
  - 「画像を削除」で**色アイコンに戻せる**。
  - プロフィールのアイコンサイズは、現状（48px）の**1.5倍の72px**に変更する（チャットのアバター28pxは変更しない）。
  - 透過画像は JPEG 化の際に**背景を白**で塗る。
  - アイコン設定欄に**匿名性に関する注意文**を表示する。

### 現状の確認

- [確認済] アイコンは色の円のみ。`lib/userColor.ts` の `getUserColor(userId)` で色を決め、DB には保存していない。
- [確認済] 色アイコンの表示箇所は3か所。
  - `app/profile/page.tsx`（`.profile-card__icon`、変更前48px → 72px）
  - `app/profile/[userId]/page.tsx`（`.profile-card__icon`、変更前48px → 72px）
  - `app/post/[id]/page.tsx`（`.chat-message__avatar`、28px。`/profile/{user_id}` への `Link`）
- [確認済] ホーム（`app/page.tsx`）の `PostCard` はユーザー名のみでアイコンはない（今回の対象外）。
- [確認済] `profiles` は `user_id, username, bio, created_at, updated_at`。RLS は SELECT=認証済み、INSERT/UPDATE=本人、DELETE なし。プロフィール保存は `upsert(..., { onConflict: "user_id" })`。
- [確認済] `lib/types.ts` の `Profile` 型は `user_id, username, bio`。
- [確認済] チャット画面は `comments` のみ取得しており、`profiles` は取得していない。
- [確認済] Storage は非公開バケット `chat-media` を利用中。関連処理は `lib/chatMedia.ts`、メタデータ除去は `lib/stripImageMetadata.ts`（Canvas 再エンコード、`imageOrientation: "from-image"`）。
- [確認済] ユーザー投稿画像の表示は `<img>`（`components/ChatMedia.tsx`。`@next/next/no-img-element` を該当行のみ無効化）。
- [確認済] DB 変更は SQL エディタで実施し、`DATABASE.md` に記録する運用（§11）。

## 2. 実装方針（比較と推奨）

### 2.1 画像の保存先

| 案 | 内容 | 長所 | 短所 |
|---|---|---|---|
| **A（推奨・合意済み）** | 公開バケット `avatars` を新設し、公開URLで表示 | URL が固定でブラウザキャッシュが効く。チャットで参加者全員分の署名URLを発行する必要がない。期限切れ対応も不要 | URL を知っていれば未ログインでも見られる |
| B | 非公開バケット＋署名付きURL（chat-media と同じ） | ログインユーザーのみ閲覧可で方針が一貫 | チャットで参加者全員の URL 一括発行・期限切れ時の再発行が必要。実装量が増える |
| C | 既存の `chat-media` に同居 | バケット追加不要 | 公開設定・パス規則・削除ルールが混ざり保守しにくい |

### 2.2 DB に保存する値

| 案 | 内容 | 判断 |
|---|---|---|
| **パス（推奨）** | `profiles.avatar_path` に `{user_id}/{uuid}.jpg` を保存し、表示時に `getPublicUrl` で URL を組み立てる | `comments.media_path` と同じ考え方。バケット移行・ドメイン変更に強く、RLS/CHECK で所有者を検証しやすい |
| URL | 公開URLそのものを保存 | 他ドメインの URL を入れられるため、CHECK での検証が難しい |

### 2.3 画像の加工

- ブラウザの Canvas で「中央の正方形を切り抜き → 256×256px に縮小 → JPEG で再エンコード」する。[提案]
- Canvas で描き直すため、EXIF（GPS 位置情報・撮影日時・カメラ情報）は自動的に除去される（匿名性の確保）。
- 出力形式を **JPEG（品質 0.9）に統一**する。理由: WebP はエンコードできないブラウザがあり、PNG は写真だとサイズが大きいため。透過画像は背景を白で塗りつぶす（3.2 参照）。

### 2.4 保存のタイミング

- **既存の「保存する」ボタンで、ユーザー名・自己紹介と一緒に保存する。**[提案]
  - 画像を選ぶとプレビューに反映され、「保存する」で確定する。「画像を削除」も保存時に確定する。
  - 理由: `profiles` 行がまだないユーザーでも、既存の upsert（ユーザー名必須）に乗せられる。ボタンが1つで操作が分かりやすい。
- 画像選択と同時に即保存する方式は、`profiles` 行がない場合の扱いが増えるため採用しない。

## 3. 具体的な設計・実装方法

### 3.1 受け付けるファイル [提案・値は要確認]

| 項目 | 値 |
|---|---|
| 入力 MIME | `image/jpeg`, `image/png`, `image/webp` |
| 入力サイズ上限 | 10MB（chat-media の画像と同じ） |
| 保存形式 | `image/jpeg`、256×256px、品質 0.9（数十KB程度を想定） |

- SVG（XSS の危険）、HEIC（ブラウザで読めないことが多い）、GIF（アニメーションが失われる）は除外する。

### 3.2 共通処理 `lib/avatar.ts`（新規）

`lib/chatMedia.ts` と同じ粒度で、画面から Storage 処理を分離する。

- 定数: `AVATAR_BUCKET = "avatars"`、`AVATAR_SIZE = 256`、許可MIME、入力上限、`AVATAR_ACCEPT`（file input の `accept` 用）
- `prepareAvatarImage(file: File): Promise<{ blob: Blob } | { error: string }>`
  1. MIME・サイズを検証する。
  2. `createImageBitmap(file, { imageOrientation: "from-image" })` で読み込む（スマホ写真の向きを反映）。
  3. 短辺を一辺とする中央の正方形を `drawImage(bitmap, sx, sy, s, s, 0, 0, 256, 256)` で 256×256 の Canvas に描く。
  4. 先に背景を白（`#ffffff`）で塗る（透過 PNG / WebP を JPEG にすると透過部分が黒くなるため）。
  5. `canvas.toBlob(cb, "image/jpeg", 0.9)`。`null` や `type !== "image/jpeg"` はエラー。
  6. `bitmap.close()` で解放。失敗時は元画像をアップロードしない。
- `uploadAvatar(userId: string, blob: Blob): Promise<string>` → パス `{userId}/{crypto.randomUUID()}.jpg` に `contentType: "image/jpeg"`, `upsert: false` でアップロードし、パスを返す（失敗時は throw）。
- `getAvatarUrl(path: string | null): string | null` → `supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl`（通信なし）
- `removeAvatar(path: string): Promise<void>` → Storage から削除（失敗はログのみ）

補足:
- 毎回新しいファイル名（UUID）で保存する。同じファイル名で上書きすると、公開URLが同じためブラウザ・CDN のキャッシュで古い画像が表示され続けるため。
- `lib/stripImageMetadata.ts` は「元サイズのまま形式を保って再エンコード」する処理で、切り抜き・縮小・形式変換とは目的が違うため、変更せず流用もしない（chat の動作に影響させない）。

### 3.3 表示コンポーネント `components/UserAvatar.tsx`（新規）

3か所の色アイコンを置き換える共通コンポーネント。

- props: `userId: string`、`avatarPath: string | null | undefined`、`className: string`、`href?: string`、`ariaLabel?: string`
- 外枠（`href` があれば `Link prefetch={false}`、なければ `div`）に `className` と `backgroundColor: getUserColor(userId)` を常に指定する（画像の読み込み中・失敗時も色アイコンとして見える）。
- `avatarPath` があれば `<img src={getAvatarUrl(avatarPath)} alt="" loading="lazy">` を中に表示する（装飾画像のため `alt=""`。プロフィールでは現状どおり `aria-hidden`）。
- `onError` で画像を非表示にし、色アイコンだけにする（ファイルが消えている場合など）。
- `next/image` は使わない（ユーザー画像・既存の `ChatMedia` に合わせる）。ESLint の `no-img-element` は理由をコメントして該当行のみ無効化する。

### 3.4 自分のプロフィール `app/profile/page.tsx` の変更

- **状態の追加**
  - `avatarPath: string | null`（保存済みのパス。初期取得時に `data.avatar_path`）
  - `pendingAvatar: Blob | null`（選択済み・未保存の加工済み画像）
  - `previewUrl: string | null`（`pendingAvatar` の `URL.createObjectURL`。差し替え・保存後・アンマウント時に `revokeObjectURL`）
  - `removeRequested: boolean`（「画像を削除」が押された）
  - `processing: boolean`（加工中）
- **アイコン部分の UI**
  - アイコン表示: `previewUrl` があればそれを、`removeRequested` なら色のみ、それ以外は `UserAvatar`（保存済み画像）。
  - 「画像を選択」ボタン＋非表示の `<input type="file" accept={AVATAR_ACCEPT}>`。
  - 画像がある（保存済みまたは選択中）ときだけ「画像を削除」ボタンを表示。
  - ボタンの下に**注意文を常に表示**する（`<p className="profile-card__icon-note">`）。文言案: 「アイコン画像は誰でも閲覧できます。顔写真など、個人を特定できる画像は設定しないでください。」（文言は実装時に調整可）
  - 選択時に `prepareAvatarImage` を実行。NG なら既存の `message` にエラーを表示。選択した input の値は毎回クリアし、同じファイルを再選択できるようにする。
- **保存 `handleSave` の変更**（既存のユーザー名検証の後）
  1. `pendingAvatar` があれば `uploadAvatar` でアップロード（失敗したら DB には書かずエラー表示）。
  2. `profileData` に `avatar_path` を含める: 新画像ならそのパス、削除なら `null`。**変更がないときは `avatar_path` を含めない**（既存値を上書きしないため）。
  3. upsert に失敗したら、1 でアップロードしたファイルを `removeAvatar` で削除（孤立ファイル防止）。ユーザー名重複（23505）の既存処理はそのまま。
  4. 成功したら、古い `avatarPath` があり変更された場合（差し替え・削除）に古いファイルを `removeAvatar` で削除（失敗はログのみ）。
  5. 状態を更新: `avatarPath` を新しい値に、`pendingAvatar`・`previewUrl`・`removeRequested` をリセット。
  - 加工中・保存中は「保存する」「画像を選択」「画像を削除」を無効化する。

### 3.5 他ユーザーのプロフィール `app/profile/[userId]/page.tsx` の変更

- `select("*")` で `avatar_path` も取得されるため、取得処理の変更は不要。
- 色アイコンの `div` を `UserAvatar`（`avatarPath={profile.avatar_path}`）に置き換えるだけ。

### 3.6 チャット画面 `app/post/[id]/page.tsx` の変更

- **状態の追加**: `avatarPaths: Record<string, string | null>`（`user_id` → `avatar_path`）
- **関数の追加**: `loadAvatars(userIds: string[])` — まだ取得していない `user_id` だけを `profiles.select("user_id, avatar_path").in("user_id", ids)` で取得し、`avatarPaths` に追加する。取得失敗はログのみ（色アイコンのまま表示）。profiles 行がないユーザーは `null` として記録し、再取得しない。
- **初期取得**: comments 取得後、`comment.user_id` の重複を除いた一覧で `loadAvatars` を呼ぶ（完了を待たずに表示を始める。メディアURLと同じ扱い）。
- **Realtime / 自分の送信**: 追加されたメッセージの `user_id` が未取得なら `loadAvatars([added.user_id])`。
- **表示**: `.chat-message__avatar` の `Link` を `UserAvatar`（`href={/profile/${comment.user_id}}`、`ariaLabel="プロフィールを見る"`、`avatarPath={avatarPaths[comment.user_id]}`）に置き換える。
- チャットを開いている間に相手がアイコンを変えても、再読み込みまで反映されない（許容。注意点に記載）。

### 3.7 型 `lib/types.ts`

- `Profile` に `avatar_path: string | null` を追加する。

### 3.8 スタイル `app/globals.css`

既存の BEM 風命名（`DESIGN.md` 準拠）に合わせる。

- `.profile-card__icon` / `.chat-message__avatar` に `overflow: hidden` を追加し、中の画像を `width: 100%; height: 100%; object-fit: cover; display: block;` で円に収める（例: `.user-avatar__image` を追加）。
- `.profile-card__icon-actions`（「画像を選択」「画像を削除」ボタンの並び）
- `.profile-card__icon-note`（注意文。既存の補足テキストに合わせた小さめの文字・控えめな色）
- `.profile-card__icon` のサイズを 48px から 72px（1.5倍）に変更する。自分・他ユーザーのプロフィールの両方に適用され、色アイコンも同じ大きさになる。チャットの `.chat-message__avatar`（28px）は変更しない。

## 4. 変更・追加が想定されるファイル

| ファイル | 種別 | 内容 |
|---|---|---|
| `lib/avatar.ts` | 新規 | 検証・切り抜き/縮小/再エンコード・アップロード・公開URL・削除 |
| `components/UserAvatar.tsx` | 新規 | 画像または色のアイコン表示（3か所で共通利用） |
| `app/profile/page.tsx` | 変更 | 画像選択・プレビュー・削除・保存処理 |
| `app/profile/[userId]/page.tsx` | 変更 | `UserAvatar` に置き換え |
| `app/post/[id]/page.tsx` | 変更 | 参加者の `avatar_path` 取得、`UserAvatar` に置き換え |
| `lib/types.ts` | 変更 | `Profile` に `avatar_path` |
| `app/globals.css` | 変更 | アイコン画像・ボタンのスタイル |
| `DATABASE.md` | 変更 | profiles の追加列・制約、Storage `avatars` とポリシー、§6.6 の手順 |
| `ARCHITECTURE.md` | 変更（必要なら） | Storage のバケット構成に `avatars` を追記 |

`lib/userColor.ts` は変更しない（画像がないときのフォールバックとしてそのまま使う）。

## 5. データベースへの変更

Supabase の SQL エディタで実行する。実行前に `DATABASE.md` §11.1 に従い実DBの構造を確認すること。

### 5.1 profiles への列追加と制約

```sql
-- アイコン画像のパス（未設定は NULL = 色アイコン）
alter table public.profiles
  add column avatar_path text;

-- 自分のフォルダ以外のファイルを参照させない
alter table public.profiles
  add constraint profiles_avatar_path_owner_check
  check (
    avatar_path is null
    or avatar_path like user_id::text || '/%'
  );
```

| カラム | 型 | 制約 | 説明 |
|---|---|---|---|
| avatar_path | text | NULL可 / 所有者チェック | Storage `avatars` 上のパス（`{user_id}/{uuid}.jpg`。バケット名は含まない）。NULL なら色アイコン |

- profiles の RLS ポリシーは**変更不要**（SELECT=認証済み、INSERT/UPDATE=本人のまま）。
- 既存行は NULL のまま（全員色アイコンで表示される）。

### 5.2 Storage バケット

```sql
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  1048576, -- 1MB（256px の JPEG は数十KB。余裕を持たせた上限）
  array['image/jpeg']
);
```

- `public = true` のため、公開URL（`/storage/v1/object/public/avatars/...`）はRLSを通らず誰でも取得できる。
- `allowed_mime_types` と `file_size_limit` で、クライアント処理を回避した大きなファイルや別形式のアップロードをサーバー側で拒否する。

### 5.3 Storage の RLS（`storage.objects`）

```sql
-- 自分のフォルダのみ参照できる（remove() は SELECT 権限も必要なため）
-- 公開URLでの表示には不要。全員に許可すると一覧取得（list）でファイルを列挙できるため本人に限定する
create policy "Users can view own avatars"
on storage.objects for select
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 自分のフォルダにのみアップロードできる
create policy "Users can upload own avatars"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 自分のファイルのみ削除できる
create policy "Users can delete own avatars"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- UPDATE ポリシーは作成しない（毎回新しいファイル名で保存するため上書き不要）
```

- `remove()` に SELECT 権限が必要という Supabase の仕様は、実装時に公式ドキュメントで再確認すること（[未確定]）。

## 6. 処理フロー

### 画像の選択

```
画像を選択 → prepareAvatarImage
  ├ 形式・サイズNG → エラー表示
  ├ 読み込み/エンコード失敗 → エラー表示（元画像は使わない）
  └ OK（中央正方形・256px・JPEG）→ pendingAvatar に保持 → プレビュー表示
画像を削除 → removeRequested = true、pendingAvatar を破棄 → 色アイコンをプレビュー
```

### 保存

```
保存する → ユーザー名の検証（既存）
  → pendingAvatar あり？
     ├ あり → uploadAvatar
     │    ├ 失敗 → エラー表示（DB は変更しない）
     │    └ 成功 → newPath
     └ なし
  → profiles を upsert（avatar_path: newPath / null(削除) / 含めない(変更なし)）
     ├ 失敗 → newPath があれば removeAvatar(newPath) → エラー表示（23505 は既存の文言）
     └ 成功 → 旧パスがあり変更された場合 removeAvatar(旧パス)（失敗はログのみ）
              → 状態を更新 →「プロフィールを保存しました」
```

### 表示

```
プロフィール: profiles 取得（select *）→ UserAvatar（avatar_path → getPublicUrl）
チャット: comments 取得 → user_id を重複除去 → profiles(user_id, avatar_path) を in で取得 → UserAvatar
          Realtime INSERT → 未取得の user_id なら1件取得
画像読み込み失敗 → img を隠して色アイコン表示
```

## 7. 実装後の確認・テスト項目

### 機能

- [ ] JPEG / PNG / WebP を選ぶとプレビューが表示され、「保存する」で保存される
- [ ] 再読み込み後も設定した画像が表示される
- [ ] 画像を差し替えると新しい画像が表示され、Storage の古いファイルが削除される
- [ ] 「画像を削除」→「保存する」で色アイコンに戻り、Storage のファイルも削除される
- [ ] 画像を選んで保存せずに離脱すると、何も変わらない（Storage にもファイルが残らない）
- [ ] 画像を変更せずユーザー名だけ保存しても、既存の画像が消えない
- [ ] profiles 行がない新規ユーザーが、ユーザー名と画像を同時に保存できる
- [ ] 他ユーザーのプロフィールに相手の画像が表示される
- [ ] チャットで各参加者のアバターに画像が表示され、画像がない人は色アイコンのまま
- [ ] チャットに新しい参加者が Realtime で投稿したとき、その人の画像も表示される
- [ ] チャットのアバタークリックでプロフィールへ遷移する（既存動作）
- [ ] `/profile` のアイコン設定欄に注意文が表示される（他ユーザーのプロフィールには表示されない）

### 画像加工

- [ ] 横長・縦長の写真が中央で正方形に切り抜かれる
- [ ] スマホで縦向きに撮った写真（Orientation=6 など）が正しい向きになる
- [ ] 保存されたファイルが 256×256 の JPEG で、EXIF（GPS・撮影日時・カメラ情報）が残っていない（exiftool などで確認）
- [ ] 透過 PNG / WebP の透過部分が白になる（黒くならない）
- [ ] iPhone Safari・Android Chrome・PC（Chrome / Firefox / Safari）で確認する

### 入力検証・エラー

- [ ] SVG・GIF・HEIC・PDF などはエラー表示になる
- [ ] 10MB を超える画像はエラー表示になる
- [ ] 壊れたファイル・拡張子だけ変えたファイルはエラーになる
- [ ] 通信を切って保存するとエラー表示になり、選択中の画像・入力内容が残る
- [ ] ユーザー名重複で upsert が失敗したとき、アップロードした画像が Storage に残らない
- [ ] 加工中・保存中は各ボタンが無効になる

### セキュリティ（DevTools から直接 Supabase API を叩いて確認）

- [ ] 他人の `user_id` フォルダにアップロードできない
- [ ] 他人のファイルを削除できない
- [ ] 他人のフォルダのパスを `avatar_path` に設定できない（CHECK 制約）
- [ ] 他人の profiles の `avatar_path` を更新できない（既存 RLS）
- [ ] JPEG 以外・1MB 超のファイルを API で直接アップロードしても拒否される
- [ ] 他人のフォルダを `list` で列挙できない
- [ ] 既存のプロフィール保存・チャット送信・メディア表示が従来どおり動く

### 表示

- [ ] プロフィール・チャットでアイコンが円形に収まり、はみ出さない
- [ ] スマホ幅で崩れない
- [ ] 画像ファイルが消えている場合に色アイコンで表示される

## 8. 実装時の注意点

- **公開バケット**: 画像は未ログインでも URL で見られる（合意済み）。顔写真など個人を特定できる画像を設定すると匿名性が下がるため、`/profile` に注意文を表示する。
- **キャッシュ**: 同じファイル名で上書きすると古い画像がキャッシュから表示されるため、必ず UUID の新しいファイル名で保存する。
- **upsert の上書き**: `avatar_path` を変更していないときは `profileData` に含めない（`undefined` も含めないよう注意）。含めると他タブでの変更を `null` で消すおそれがある。
- **孤立ファイル**: 保存失敗時は新ファイル、保存成功時は旧ファイルを削除する。旧ファイルの削除失敗やアカウント削除（profiles は CASCADE で消えるが Storage は残る）による孤立ファイルは今回対応せず、既知の制約として `DATABASE.md` に記載する。
- **Object URL の解放**: プレビュー用の `URL.createObjectURL` は差し替え・保存後・アンマウント時に `revokeObjectURL` する（チャット画面の `previewUrlRef` と同じ方法）。
- **チャットの取得回数**: 参加者の profiles は `in` でまとめて1回取得し、取得済みの `user_id` は再取得しない（Realtime のたびに全件取得しない）。
- **Canvas の上限**: iOS Safari は高画素の画像で `createImageBitmap` / Canvas が失敗することがある（エラー表示になる）。
- **型の更新**: `Profile` に列を追加したら、`profiles` を参照している箇所（`app/page.tsx` の `Pick<Profile, ...>` など）で型エラーがないか確認する。
- **Next.js のバージョン**: `AGENTS.md` のとおり、Next.js の API を使う場合は `node_modules/next/dist/docs/` を確認してから実装する（本方針では `<img>` を使うため影響は小さい）。
- **DATABASE.md の更新**: §3.3 profiles、§3.x Storage（avatars）、§5.4/5.5 のポリシー、§6.6 プロフィールの更新、§7.3.1 CHECK 制約、§9 の注意点を更新する。

## 9. 未確定事項（実装前に決める）

決定済み: プロフィールのアイコンサイズは72px（1.5倍）／透過画像の背景色は白／注意文は表示する。

| 項目 | 内容 | 本方針の仮置き |
|---|---|---|
| 保存サイズ・形式 | 256px・JPEG 品質 0.9 でよいか | 256px / JPEG 0.9 |
| 入力上限 | 10MB でよいか | 10MB |
| ホーム（PostCard）への表示 | 現在アイコンがない。今回の範囲外 | 表示しない |
| `remove()` の必要権限 | SELECT ポリシーが必要かを Supabase の最新ドキュメントで確認 | 本人フォルダの SELECT を付与 |
| 不適切な画像への対応 | 通報・非表示などの仕組み | 今回の範囲外 |

