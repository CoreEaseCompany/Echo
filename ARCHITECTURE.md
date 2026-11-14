# ARCHITECTURE.md

# Echo - システム構成・アーキテクチャ設計書

## 1. 概要

### 1.1 目的

本ドキュメントは、匿名SNS「Echo」のシステム構成、技術構成、各レイヤーの責務、データの流れ、実装方針を定義する。

Claude Codeなどの開発支援ツールは、機能の追加・修正・リファクタリングを行う際、本ドキュメントを参考にすること。

### 1.2 システム概要

EchoはNext.jsをフロントエンドとして使用し、Supabaseをバックエンドサービスとして利用するWebアプリケーションである。

独自のバックエンドサーバーは現時点では設けず、Supabaseの機能を利用して認証・データ管理を行う。

### 1.3 基本構成

```text
User
 |
 | Browser
 v
Next.js Application
 |
 | React / TypeScript
 |
 | Supabase Client
 v
Supabase
 |
 +-- Authentication
 |
 +-- PostgreSQL Database
 |
 +-- Row Level Security
```

### 1.4 アーキテクチャの方針

- シンプルな構成を維持する。
- 不必要なバックエンドサーバーを設けない。
- Supabaseをバックエンドサービスとして利用する。
- フロントエンドとデータ管理の責務を分離する。
- データベース側でアクセス制御を行う。
- コンポーネント単位でUIを管理する。
- 将来的な機能追加に対応できる構成にする。
- 運用コストを可能な限り抑える。

---

# 2. 技術構成

## 2.1 使用技術

| 分類 | 技術 | 役割 |
|---|---|---|
| フレームワーク | Next.js | Webアプリケーション全体 |
| UIライブラリ | React | UIコンポーネント・状態管理 |
| 言語 | TypeScript | 静的型付け |
| スタイリング | CSS | UIデザイン |
| CSSフレームワーク | Tailwind CSS | スタイリング補助 |
| BaaS | Supabase | バックエンド機能 |
| DB | PostgreSQL | データ保存 |
| 認証 | Supabase Auth | ユーザー認証 |
| バージョン管理 | Git / GitHub | ソースコード管理 |
| AI開発支援 | Claude Code | コード調査・実装・修正 |
| デプロイ候補 | Vercel | Next.jsのホスティング |

※実際の依存関係やバージョンはpackage.jsonを確認すること。

## 2.2 Next.js

Next.jsはアプリケーション全体のフレームワークとして使用する。

主な役割：

- ページのルーティング
- Reactコンポーネントの管理
- ページ単位のレイアウト
- CSSの読み込み
- アプリケーションのビルド・実行

App Routerを使用し、appディレクトリ内のファイル構成によってURLと画面を管理する。

### ルーティング

| ファイル | URL | 役割 |
|---|---|---|
| app/page.tsx | / | ホーム |
| app/login/page.tsx | /login | ログイン |
| app/signup/page.tsx | /signup | 新規登録 |
| app/post/page.tsx | /post | 投稿作成 |
| app/post/[id]/page.tsx | /post/[id] | 投稿詳細 |
| app/profile/page.tsx | /profile | 自分のプロフィール |
| app/profile/[userId]/page.tsx | /profile/[userId] | 他ユーザーのプロフィール |

動的ルートは `[id]` や `[userId]` で表現する。

## 2.3 React

Reactは画面のUIと状態管理を担当する。

主な役割：

- コンポーネントの作成
- データに応じた画面表示
- ユーザー操作の処理
- フォーム入力の管理
- ローディング状態の管理
- データ更新後の再描画

現在の実装では、必要なページやコンポーネントでClient Componentを使用している。

Client Componentではファイル先頭に以下を記述する。

```tsx
"use client";
```

React Hooksを利用する場合は、コンポーネントの責務と状態の管理場所を意識する。

主に使用するHooks：

- useState
- useEffect

状態管理は必要な範囲に限定し、コンポーネント間で不必要に複雑な状態共有を行わない。

## 2.4 TypeScript

TypeScriptはデータやコンポーネントの型を定義するために使用する。

例：

```tsx
type Post = {
  id: number;
  user_id: string;
  content: string;
};
```

型定義によって以下を実現する。

- データ構造の明確化
- 型の不一致によるエラーの防止
- コードの可読性向上
- リファクタリングの安全性向上

`any` の安易な使用は避け、必要な型を適切に定義する。

## 2.5 Supabase

Supabaseはバックエンドサービスとして利用する。

主な機能：

- Supabase Authによる認証
- PostgreSQLによるデータ管理
- RLSによるアクセス制御
- データの取得・登録・更新・削除

現時点ではSupabaseのJavaScript Clientを使用してデータベースにアクセスしている。

---

# 3. システム構成と責務

## 3.1 レイヤー構成

基本的には以下の役割に分ける。

```text
Presentation Layer
  |
  | React Components
  | Pages
  | UI State
  |
  v
Application / Data Access
  |
  | Supabase Client
  | Data Retrieval
  | Data Manipulation
  |
  v
Backend Service
  |
  | Supabase Auth
  | PostgreSQL
  | RLS
  |
  v
Database
```

### Presentation Layer

画面表示とユーザー操作を担当する。

主な処理：

- 投稿一覧の表示
- 投稿内容の入力
- ボタン操作
- 画面遷移
- ローディング・エラー表示

### Application / Data Access

画面とSupabaseの間でデータをやり取りする。

主な処理：

- データ取得
- データ登録
- データ更新
- データ削除
- 取得データの整形
- エラー処理

現時点では、これらの処理の一部を各ページコンポーネント内で実装している。

今後、共通化する価値がある処理はlibやhooksなどへ分離することを検討する。

### Backend Service

Supabaseが担当する。

主な処理：

- ユーザー認証
- データベース操作
- アクセス制御
- データの永続化

### Database

PostgreSQLでデータを保存する。

テーブル構造とリレーションの詳細はDATABASE.mdを参照する。

---

# 4. Supabaseとの接続

## 4.1 クライアントの初期化

Supabase Clientは以下のファイルで管理する。

```text
lib/supabase.ts
```

基本的にはアプリケーション内で共通のSupabase Clientを利用する。

初期化時には環境変数から接続情報を取得する。

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

※実際の環境変数名は現在のlib/supabase.tsを確認すること。

## 4.2 接続イメージ

```text
Page / Component
       |
       v
  supabase client
       |
       v
 Supabase API
       |
       v
 PostgreSQL
```

画面からSupabase Clientを通じてデータ操作を行う。

## 4.3 データ操作

基本的なデータ操作はSupabase Clientを使用する。

### SELECT

データ取得：

```tsx
const { data, error } = await supabase
  .from("posts")
  .select("*");
```

### INSERT

データ登録：

```tsx
const { error } = await supabase
  .from("posts")
  .insert({
    user_id: userId,
    content: content,
  });
```

### UPDATE

データ更新：

```tsx
const { error } = await supabase
  .from("posts")
  .update({
    content: newContent,
  })
  .eq("id", postId);
```

### DELETE

データ削除：

```tsx
const { error } = await supabase
  .from("posts")
  .delete()
  .eq("id", postId);
```

※上記は基本的な操作例。実際のテーブル構造や型、認証状態に合わせて使用すること。

## 4.4 エラー処理

Supabaseの操作では、戻り値のerrorを確認する。

基本方針：

- errorが存在する場合は処理を失敗として扱う。
- エラー内容を適切にログへ出力する。
- ユーザーには理解しやすいメッセージを表示する。
- エラー発生時に成功したようなUI更新を行わない。
- ローディング状態を確実に解除する。

---

# 5. 認証アーキテクチャ

## 5.1 認証方式

Supabase Authを使用する。

メールアドレスとパスワードによる認証を基本とする。

認証関連の操作：

- 新規登録
- ログイン
- ログアウト
- ログイン状態の取得
- パスワードリセット

## 5.2 認証状態の取得

Supabase Authから現在のユーザー情報を取得する。

例：

```tsx
const {
  data: { user },
} = await supabase.auth.getUser();
```

取得したユーザー情報からユーザーIDを利用する。

## 5.3 認証状態の管理

認証状態によって画面や操作を制御する。

例：

- ログイン済み：投稿作成・コメント・共感などを利用できる。
- 未ログイン：ログイン・新規登録画面へ誘導する。
- 自分の投稿：編集・削除操作を表示する。
- 他人の投稿：編集・削除操作を表示しない。

ただし、フロントエンドでの表示制御だけに依存しない。

実際のデータ操作はSupabaseのRLSでも制限する。

## 5.4 セッション管理

Supabase Authのセッション管理を利用する。

認証状態の変更を検知する必要がある場合は、`onAuthStateChange` の利用を検討する。

複数ページで認証状態を取得する場合は、重複した処理や不要なリクエストを避ける。

将来的には認証状態を共通化する方法も検討する。

---

# 6. セキュリティアーキテクチャ

## 6.1 基本方針

データの安全性はフロントエンドとデータベースの両方で確保する。

特に重要なのはSupabaseのRow Level Security（RLS）である。

## 6.2 RLS

各テーブルでRLSを有効にし、ユーザーごとのデータ操作を制御する。

基本方針：

- 投稿の更新・削除は投稿者本人のみ。
- プロフィールの更新は本人のみ。
- コメントの削除は投稿者本人のみ。
- 共感の追加・解除は操作した本人のみ。
- post_tagsの追加・削除は対象投稿の投稿者本人のみ。

具体的なポリシーはDATABASE.mdおよびSupabaseの実設定を確認する。

## 6.3 認証とRLSの関係

```text
User
 |
 v
Next.js Application
 |
 | Supabase Client
 | Authentication Token
 v
Supabase API
 |
 v
PostgreSQL
 |
 | RLS Policy
 | auth.uid() によるユーザー判定
 v
許可された操作のみ実行
```

フロントエンドでユーザーIDを指定してデータ操作を行う場合でも、データベース側で認証ユーザーと操作対象の整合性を確認する。

## 6.4 環境変数・秘密情報

- Supabaseの接続情報は環境変数で管理する。
- `.env.local` はGitHubへ公開しない。
- Service Role Keyなどの秘密鍵をクライアント側に記述しない。
- 公開用キーと秘密鍵を区別する。
- 秘密情報をログや画面に出力しない。

---

# 7. データフロー

## 7.1 投稿一覧取得

```text
1. ホーム画面を表示
       |
       v
2. Supabase Authからユーザー情報を取得
       |
       v
3. tagsテーブルからタグ一覧を取得
       |
       v
4. postsテーブルから投稿一覧を取得
       |
       v
5. profilesから投稿者情報を取得
       |
       v
6. post_tagsからタグ情報を取得
       |
       v
7. 取得データを画面表示用に整理
       |
       v
8. PostCardコンポーネントへ渡す
       |
       v
9. 投稿一覧を表示
```

## 7.2 投稿作成

```text
1. 投稿作成画面を表示
       |
       v
2. 投稿内容・タグを入力
       |
       v
3. 入力値を検証
       |
       v
4. postsテーブルに投稿を登録
       |
       v
5. 登録された投稿IDを取得
       |
       v
6. post_tagsにタグを登録
       |
       v
7. 投稿完了
```

注意：

postsへの登録成功後にpost_tagsへの登録が失敗した場合、投稿だけが残る可能性がある。

将来的にはトランザクションやRPCなどを利用して、投稿とタグの登録を一体的に処理する方法を検討する。

## 7.3 投稿編集

```text
1. 投稿者本人が編集操作
       |
       v
2. 編集フォームを表示
       |
       v
3. 新しい投稿内容を入力
       |
       v
4. 入力値を検証
       |
       v
5. Supabase UPDATE
       |
       v
6. RLSによる権限確認
       |
       v
7. 更新成功
       |
       v
8. 画面の状態を更新
```

## 7.4 投稿削除

```text
1. 投稿者本人が削除操作
       |
       v
2. Supabase DELETE
       |
       v
3. RLSによる権限確認
       |
       v
4. 投稿を削除
       |
       v
5. 関連データを適切に処理
       |
       v
6. 投稿一覧を更新
```

関連データの削除は外部キー制約のON DELETE CASCADEなどを利用する。

実際の設定はDATABASE.mdを確認すること。

## 7.5 共感

```text
1. 投稿の共感ボタンを押す
       |
       v
2. 現在の共感状態を確認
       |
       +----------------------+
       |                      |
       v                      v
   未共感                  共感済み
       |                      |
       v                      v
   INSERT                 DELETE
       |                      |
       +----------+-----------+
                  |
                  v
             画面を更新
```

同じユーザーが同じ投稿に複数回共感できないよう、データベース側でも制約を設ける。

## 7.6 コメント

```text
1. コメントを入力
       |
       v
2. 入力値を検証
       |
       v
3. commentsへINSERT
       |
       v
4. 投稿者情報などを取得
       |
       v
5. コメント一覧を更新
```

---

# 8. データベース構成

現在使用している主なテーブル：

| テーブル | 役割 |
|---|---|
| posts | 投稿 |
| profiles | プロフィール |
| empathies | 共感 |
| comments | コメント |
| tags | タグ |
| post_tags | 投稿とタグの中間テーブル |

## 8.1 テーブル間の関係

```text
auth.users
    |
    +---- profiles
    |
    +---- posts
    |       |
    |       +---- comments
    |       |
    |       +---- empathies
    |       |
    |       +---- post_tags
    |                 |
    |                 +---- tags
    |
    +---- comments
    |
    +---- empathies
```

## 8.2 リレーション

- 1ユーザーは複数の投稿を作成できる。
- 1ユーザーは1つのプロフィールを持つ。
- 1投稿は複数のコメントを持つ。
- 1投稿は複数の共感を持つ。
- 1投稿には複数のタグを設定できる。
- 1つのタグは複数の投稿に設定できる。
- postsとtagsはpost_tagsによって多対多で関連付ける。

詳細はDATABASE.mdを参照する。

---

# 9. フロントエンドのファイル構成

現在の主な構成：

```text
Echo/
|
+-- app/
|   |
|   +-- layout.tsx
|   +-- page.tsx
|   +-- globals.css
|   |
|   +-- login/
|   |   +-- page.tsx
|   |
|   +-- signup/
|   |   +-- page.tsx
|   |
|   +-- post/
|   |   +-- page.tsx
|   |   +-- [id]/
|   |       +-- page.tsx
|   |
|   +-- profile/
|       +-- page.tsx
|       +-- [userId]/
|           +-- page.tsx
|
+-- components/
|   +-- Header.tsx
|   +-- PostCard.tsx
|
+-- lib/
|   +-- supabase.ts
|   +-- tags.ts
|   +-- types.ts
|   +-- userColor.ts
|
+-- public/
|   +-- images/
|
+-- README.md
+-- REQUIREMENTS.md
+-- DESIGN.md
+-- ARCHITECTURE.md
```

※実際の構成はプロジェクト内のファイルを確認すること。

## 9.1 app/

ページ単位のコンポーネントと共通レイアウトを管理する。

| ファイル | 責務 |
|---|---|
| app/layout.tsx | 共通レイアウト |
| app/page.tsx | ホーム・投稿一覧 |
| app/login/page.tsx | ログイン |
| app/signup/page.tsx | 新規登録 |
| app/post/page.tsx | 投稿作成 |
| app/post/[id]/page.tsx | 投稿詳細 |
| app/profile/page.tsx | 自分のプロフィール |
| app/profile/[userId]/page.tsx | 他ユーザーのプロフィール |

## 9.2 components/

複数ページで再利用するUIコンポーネントを管理する。

| ファイル | 責務 |
|---|---|
| Header.tsx | ヘッダー |
| PostCard.tsx | 投稿カード |

## 9.3 lib/

外部サービスや共通処理に関するコードを管理する。

| ファイル | 責務 |
|---|---|
| supabase.ts | Supabase Clientの初期化 |
| tags.ts | タグ一覧の取得・結合取得したタグの整形 |
| types.ts | 共通のデータ型（Post / Tag / Profile など） |
| userColor.ts | ユーザーIDからアイコン色を決定 |

今後、共通のデータ取得処理やユーティリティを追加する場合も、責務に応じて整理する。

---

# 10. コード設計・実装方針

## 10.1 コンポーネント設計

- 再利用可能なUIはコンポーネントに分離する。
- 1つのコンポーネントに過剰な責務を持たせない。
- Propsの型を明確に定義する。
- コンポーネント間の依存関係を複雑にしない。

## 10.2 状態管理

現時点ではReactのuseStateとuseEffectを中心に状態管理を行う。

基本方針：

- 状態は必要なコンポーネントで管理する。
- 同じデータを複数の場所で不必要に保持しない。
- Propsを通じて必要なデータを渡す。
- データ更新後はReactのstateを通じて画面を更新する。
- Reactのstateを直接変更しない。
- useEffectの依存配列を適切に設定する。

## 10.3 データアクセス

現時点では各ページやコンポーネントからSupabase Clientを利用している。

今後、共通化する価値がある処理は以下のように分離することを検討する。

```text
lib/
  supabase.ts
  posts.ts
  profiles.ts
  comments.ts
  empathies.ts
```

ただし、現段階で一括してリファクタリングする必要はない。

機能追加や保守性の改善に応じて段階的に進める。

## 10.4 型定義

データベースの構造とTypeScriptの型定義を一致させる。

可能であればSupabase CLIなどで生成したDatabase型を利用することも検討する。

同じ型を複数ファイルで重複定義しないようにする。

## 10.5 エラー処理

- 非同期処理ではエラーを適切に捕捉する。
- Supabaseのerrorを確認する。
- エラー時にstateを不整合な状態にしない。
- ローディング状態を確実に解除する。
- ユーザー向けメッセージと開発者向けログを区別する。

---

# 11. パフォーマンス方針

## 11.1 データ取得

- 必要なカラムだけ取得することを基本とする。
- 不必要な再取得を避ける。
- 複数テーブルを取得する場合は取得回数を意識する。
- 投稿数が増加した場合はページネーションを検討する。

## 11.2 React

- 不必要な再レンダリングを避ける。
- stateの更新範囲を適切にする。
- コンポーネントの責務を小さく保つ。
- useMemoやuseCallbackは必要性を確認してから利用する。

## 11.3 CSS

- 不必要な重複CSSを避ける。
- レイアウトのためだけの複雑な絶対配置を避ける。
- GridとFlexboxを適切に使う。

---

# 12. デプロイ・運用構成

## 12.1 想定構成

```text
User Browser
     |
     v
Vercel
     |
     v
Next.js Application
     |
     v
Supabase
     |
     +-- Authentication
     |
     +-- PostgreSQL
```

## 12.2 デプロイ

Next.jsアプリケーションのデプロイ先としてVercelを想定する。

環境変数はVercelの環境変数設定で管理する。

本番環境と開発環境の接続先を混同しないこと。

## 12.3 運用コスト

個人開発のため、可能な限り低コストで運用する。

- 無料プランを優先する。
- 不必要な外部APIを使用しない。
- 従量課金サービスの導入前に費用を確認する。
- Supabaseの利用量を意識する。
- 必要に応じて利用状況を確認する。

---

# 13. 将来的な拡張方針

以下は将来の検討事項であり、現時点で実装済みではない。

## 13.1 バックエンド処理の分離

機能が増加した場合、Supabaseへのデータアクセス処理をlibなどに分離する。

複雑な処理や複数テーブルの整合性が必要な処理は、PostgreSQLの関数やRPCなどの利用を検討する。

## 13.2 認証処理の共通化

認証状態の取得やユーザー情報の管理を共通化する方法を検討する。

## 13.3 投稿のページネーション

投稿数が増加した場合、全投稿を一度に取得する構成からページネーションへ移行する。

## 13.4 モデレーション

- 通報機能
- 不適切な投稿への対応
- スパム対策
- ブロック機能

## 13.5 AI機能

AIによる悩み相談などを検討する可能性がある。

ただしAPI利用料金が発生するため、費用対効果を確認してから導入する。

---

# 14. Claude Codeへの実装ルール

実装・修正・リファクタリングを行う際は、以下を守ること。

## 14.1 実装前

1. 現在のプロジェクト構成を確認する。
2. 対象ファイルの実装を確認する。
3. 関連するコンポーネントを確認する。
4. Supabaseのテーブル構造やRLSへの影響を確認する。
5. README.md、REQUIREMENTS.md、DESIGN.md、DATABASE.mdを必要に応じて参照する。
6. 仕様が不明な場合はユーザーに確認する。

## 14.2 実装中

- 既存の設計を尊重する。
- 変更範囲を必要最小限にする。
- 既存機能を壊さない。
- 不必要なライブラリを追加しない。
- 秘密情報をコードに記述しない。
- フロントエンドだけでセキュリティを完結させない。
- TypeScriptの型を適切に扱う。
- Reactのstateを直接変更しない。

## 14.3 実装後

- 変更したファイルを報告する。
- 変更内容と理由を説明する。
- npm run buildを実行して確認する。
- 必要に応じて動作確認方法を提示する。
- エラーが残っている場合は明確に報告する。
- データベース変更がある場合はSQLやRLSの変更内容も報告する。

## 14.4 ドキュメントの更新

仕様やアーキテクチャを変更した場合は、関連ドキュメントも更新する。

特に以下の変更ではドキュメント更新を検討する。

- 新しいテーブルの追加
- 新しい認証方式の追加
- 新しい外部サービスの導入
- データ取得方法の大幅な変更
- 画面構成の変更
- 共通コンポーネントの追加

---

# 15. 関連ドキュメント

| ファイル | 役割 |
|---|---|
| README.md | プロジェクト概要・環境構築 |
| REQUIREMENTS.md | 機能要件 |
| DESIGN.md | 画面・UI設計 |
| ARCHITECTURE.md | 技術構成・システム設計 |
| DATABASE.md | DB構造・リレーション |
| TASKS.md | 実装状況・残タスク |