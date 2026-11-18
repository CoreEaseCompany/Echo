# Echo 公開前監査レポート（調査のみ・コード/DB/ファイルは未変更）

調査日: 2026-11-15（コミット 36641f0 時点、git は clean）

凡例: **[確認済]**=コードを実際に読んで確認 / **[推測]**=コードからの推論 / **[未確認]**=Supabase側設定・実機動作など確認不能

実施した確認: 全 `app/` `components/` `lib/` と `globals.css`(937行)・`TASKS.md`・`DATABASE.md` 主要部を通読。`npx eslint` は出力なし（エラー/警告なし）[確認済]。`next build`・実機表示・`npm audit` は未実行 [未確認]。

---

## 1. 現在のプロジェクトの状態

### 構成 [確認済]
Next.js 16.2.7 / React 19 / Supabase JS v2 / Tailwind v4。全ページ `"use client"`、ブラウザから Supabase を直接呼ぶ構成（サーバー側ロジック・middleware なし）。

| ファイル | 役割 |
|---|---|
| `app/layout.tsx` | 共通レイアウト（雲SVGフィルタ・Header・`<main class=app-main>`・固定フッター） |
| `app/page.tsx` | ホーム：タグ絞り込み＋投稿グリッド＋削除 |
| `app/post/page.tsx` | 投稿作成（タグ選択） |
| `app/post/[id]/page.tsx` | 投稿詳細＝チャット画面（共感・コメント・Realtime購読） |
| `app/profile/page.tsx` / `[userId]/page.tsx` | 自分のプロフィール編集 / 他ユーザー閲覧 |
| `app/login` `register` `reset-password(/update)` | 認証系 |
| `components/Header.tsx` `PostCard.tsx` | ヘッダー（認証状態監視）/ 投稿カード（編集UI内蔵） |
| `lib/supabase.ts` `types.ts` `tags.ts` `userColor.ts` | クライアント / 共通型 / タグ取得 / ID→色 |

不自然な点: `post/[id]/page.tsx` が434行で取得・Realtime・共感・送信・描画を1ファイルに集約（責務の偏り）。`PostCard` は編集の DB 更新まで内包。型は `lib/types.ts` に集約済み。

### 機能別の状況
| 機能 | 状態 |
|---|---|
| 認証 | 登録/ログイン/ログアウト/リセット要求/新PW設定が存在。動作は実機[未確認]。バリデーション・ローディング・UIが貧弱 |
| 投稿 | 作成（500字・タグ・失敗時ロールバック・二重送信防止あり）/一覧/編集(PostCard)/削除(ホームのみ)。**編集に文字数上限・削除に確認なし** |
| コメント | チャット形式で送信/削除/Realtime受信。**投稿者名・プロフィールへのリンクなし**、他者の削除は同期されない |
| 共感 | 追加/解除/件数は**詳細画面のみ**。処理中ガードなし |
| プロフィール | 自分の編集（upsert、重複名エラー処理）良好。公開側 `/profile/[userId]` は**完全に未スタイル** |
| タグ | 取得・選択・表示・絞り込みは動作する実装。競合/件数上限に弱い |

---

## 2・3. 問題点一覧と重要度

### 高
| # | 問題 | 根拠 |
|---|---|---|
| H1 | **RLS・DB制約・Realtime設定の実体が未検証** | 全アクセスがクライアント直叩きでRLSが唯一の防御線。DATABASE.md §5 は方針とSQLのみ。`posts_content_check` は「本番DBへの適用が必要（未適用なら保存が失敗しうる）」と文書自身が注記（DATABASE.md:101-112）。コメントはCHECKなし（DATABASE.md:195-205）で、`post-chat-room.md:113` に案はあるが文書未反映。コメントのRealtime（`app/post/[id]/page.tsx:117-141`）は publication 設定とSELECTポリシーが前提だが DATABASE.md に記載なし。TASKS優先度Aの検証項目はすべて未チェック。**Supabase側は未確認** |
| H2 | **登録後のメール確認フロー・本番Redirect URLが未整備** | `register/page.tsx:13-26` は成功時に無言で `/login` へ。確認メール必須設定なら案内なしでログイン失敗する（REQUIREMENTS:79 は本人確認を要求）。`reset-password` は `window.location.origin` 依存（`reset-password/page.tsx:22`）で、本番URLをSupabaseに登録しないと失敗 [未確認] |
| H3 | **未ログイン時の挙動が公開サイトとして不適切** | RLSは `to authenticated`。未ログインのホームは取得が空になり「該当する投稿はありません。」と表示（`app/page.tsx:215`）＝取得失敗/未ログイン/本当に0件が区別不能。ログイン誘導なし。詳細は `post/[id]/page.tsx:292-301` でログイン要求（これは明示的で良い） |
| H4 | **通報・ブロック・利用規約/プライバシーが皆無** | 悩み・感情を扱う匿名SNS。REQUIREMENTS:481-485 / TASKS優先度C扱い。公開判断としては運営リスク [推測] |

### 中
| # | 問題 | 根拠 |
|---|---|---|
| M1 | 認証4画面が未スタイル・検証不足 | `login` `register` `reset-password*` は素のHTML（クラスなし、`<br/>`改行）。暗い背景画像上でホーム/プロフィール/投稿画面と見た目が断絶。`login`: `<form>`でなくEnter送信不可・ローディングなし・二重送信可。`register`: PW長/メール形式検証なし・`alert(error.message)` で内部文言露出（`register/page.tsx:20`）・二重送信可。`reset-password/update`: リカバリセッション確認なし、成功後に遷移せず（`update/page.tsx:46-48`） |
| M2 | 公開プロフィール `/profile/[userId]` が完全未スタイル | `profile/[userId]/page.tsx` 全体が素の div/h1/hr。投稿への遷移はあるが体裁・余白なし |
| M3 | 投稿削除が確認なしで即実行 | `PostCard.tsx:147` → `app/page.tsx:162-174`。誤クリックで消える。失敗は `alert`。削除ボタン類は `type` 未指定 |
| M4 | 投稿編集に文字数上限なし＋エラー文言露出 | `PostCard.tsx:89-95`（maxLength なし）、`:63` `alert(error.message)`。DB CHECK 適用後は501字以上で保存失敗しPostgresの生メッセージが出る（post-create-screen.md:159 も既知として記載） |
| M5 | コメント投稿者が不明 | `post/[id]/page.tsx:360-367` は色アバターのみ。TASKS「コメント投稿者名からプロフィールへの遷移 [x]」と**不一致**（匿名性重視の設計変更なら文書側を更新すべき、設計は変えない） |
| M6 | 全件取得・タグ絞り込みの競合・URL長 | `app/page.tsx:49-58` limit なし `select("*")`。`:151-159` 連打で古い応答が後勝ちし得る（リクエスト識別なし）。`:55` `.in("id", postIds)` は件数増でURL長超過の恐れ。TASKSではCだが公開後すぐ効く [推測] |
| M7 | エラー処理が3系統混在 | `alert`（Header/PostCard/home/login/register）、画面内メッセージ（post/profile/chat）、`console.error` のみ（ホームの取得失敗は画面表示なし）。TASKS優先度A「エラー表示を統一」が未了 |
| M8 | ログイン必須ページに事前ガードなし | `/post` `/profile` はクライアントで `getUser` 後に出し分け（`post/page.tsx:161`, `profile/page.tsx:100`）で実害は小さいが、未認証時のホームは上記H3。middleware 無し構成の特性 |
| M9 | 共感処理の二重クリック/古い state | `post/[id]/page.tsx:168-216` 処理中フラグなし、`setPost({...post,...})` が古い値を掴む可能性。DBのUNIQUEで致命傷にはならないがエラー表示になる |
| M10 | レスポンシブの穴（実機[未確認]） | `≤700px` でヘッダー `min-height:150px`、ログイン時は5要素のナビ＋メールを `absolute; bottom:12px` に押し込む（globals.css:666-691）。長いメールで折返し/ロゴ重なりの可能性 [推測]。`.app-main margin-bottom:49px` はフッター高の決め打ち（:44）。`.post-card` は `height:220px` 固定＋22px固定（:247,343）。チャットは `height:calc(100% - 24px)`（:438）で、親 `height:0; flex:1` に依存 [推測]。スマホのキーボード表示時の入力欄挙動は未確認 |
| M11 | テストなし・CI なし | `package.json` に test スクリプト・テストファイルなし [確認済] |
| M12 | profiles 自動作成なし | 登録時に行が作られず、`/profile` 保存まで「名前未設定」表示（`app/page.tsx:228`）。DB trigger の有無は未確認 |

### 低
| # | 問題 | 根拠 |
|---|---|---|
| L1 | CSS 重複 | `.profile-card*` と `.post-form*` がほぼ同一定義（globals.css:705-813 / 819-937、約100行重複）。`.profile-card__input--readonly` に `!important`（:770-773）。`.home-tag-button` を投稿フォームが上書き流用（:884-894）。`.chat-room__button` を `.post-card__actions button` と相乗り（:385-411）。命名が `home-*` と BEM 混在 |
| L2 | CSS 残存/未使用 | `cloud-card` は現CSSに**存在しない**（TASKSの整理項目は対象なし、確認済）。明確な未使用クラスは今回見つからず（全クラスの使用突合は未実施[推測]）。`tailwindcss` は import しているが実質 `border-t border-gray-200` 等の数個の utility のみ（`layout.tsx:58`）で、preflight が全体に効く |
| L3 | フォント未指定 | `body{font-family:sans-serif}`（:17）のみ。日本語は OS 依存 |
| L4 | 型キャスト | `as unknown as` が `app/page.tsx:101`、`post/[id]/page.tsx:89`。生成型(`supabase gen types`)未使用。`lib/supabase.ts` の `!` 断定は env 未設定に実行時まで気付けない。リアルタイム `payload.new as Comment` は未検証 |
| L5 | 詳細ページの細部 | コメント時刻が時:分のみで日付なし（`:371-374`）。他者の削除（DELETEイベント）を購読していないため他クライアントで消えない（`:117-141`）。`stickToBottom` 等の挙動は実機未確認 |
| L6 | パフォーマンス | `profiles.find` が O(n²)（`app/page.tsx:219`）、各ページで `getUser`＋Headerで `getSession`（二重の認証確認）。件数が増えるまで影響小 |
| L7 | アクセシビリティ/メタ | `:focus-visible` スタイルなし、編集textareaに label なし（`PostCard.tsx:89`）、`error.tsx`/`not-found.tsx`/`loading.tsx` なし、OGP/規約ページなし。ヘッダーに自分のメールを常時表示（スクショ共有時に注意） |
| L8 | `.vscode/launch.json` が `localhost:8080`（Next既定は3000） | 開発のみ、公開に無関係 |

---

## 4. セキュリティ評価

**確認済・良好**
- `.env.local` は `.gitignore` の `.env*` で除外、git履歴にも追加履歴なし。キー名は `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` のみ（値は読んでいない）。
- `service_role` の使用はコード全体で0件。`dangerouslySetInnerHTML`/`innerHTML` も0件（Reactの自動エスケープ、`white-space:pre-wrap` のみ）。
- 書き込み時の `user_id` は `auth.getUser()`（サーバー検証）由来（`post/page.tsx:83-98`）。`profiles` は upsert で `user_id` を認証ユーザーに固定。
- DATABASE.md の RLS 設計は妥当（insert/update の `with check (auth.uid() = user_id)`、`post_tags` の所有者検証など）。

**懸念**
- 本人判定（編集/削除ボタン表示）は UI 側の `post.user_id === userId` のみ。実防御は RLS に完全依存（H1）。
- `PostCard` の update は `.eq("id")` のみでUI側の所有確認を持たない → RLS が無効だと他人の投稿を編集できる。
- 入力検証: 投稿作成・コメントは UI で500字制限だがDB側CHECKは未確認（コメントは文書上も無し）。ユーザー名30字/自己紹介200字も `maxLength` のみで DB 制約の記載は username 30字のみ。
- 通報/ブロック無し、認証レート制限・CAPTCHA は未確認。

**未確認（Supabase側）**: RLS有効化・ポリシー実体、CHECK制約適用有無、profiles/他のtrigger、Realtime publication、メール確認ON/OFF、SMTP、Site URL/Redirect URL、レート制限、DBバックアップ。

---

## 5. 品質まとめ
- エラー処理: 上記M7。ローディング: ホーム/詳細/プロフィール/投稿に「読み込み中」あり、認証系は無し。
- 型: 共通型は整理済み、キャストが残る（L4）。不要処理: Header と各ページの二重認証取得（L6）。
- テスト: 皆無（M11）。lint: 通過。build: 未実行。

---

## 6. ドキュメント整合性 [確認済]
| 文書 | 不一致 |
|---|---|
| README.md:114 / ARCHITECTURE.md:94,690,733 / DESIGN.md:692 | ルートが `/signup`。実装は **`/register`**。README の構成に `reset-password/` と `lib/tags.ts` `types.ts` `userColor.ts` なし（README:119-139） |
| TASKS.md:31 | パスワードリセットが「保留」だが `reset-password` 2画面は**実装済み**（動作未確認）。優先度B（:162-168）と重複 |
| TASKS.md:99 | 「`cloud-card` CSS整理」は対象が既に存在しない |
| TASKS.md:90/102 | 「レスポンシブ対応 [x]」と「スマホ表示確認 [ ]」が矛盾。投稿カードずれ修正（:93,113）は実装済み（直近コミット「投稿カードの位置ずれ修正」）に見えるが未更新 |
| TASKS.md:70 | 「コメント投稿者名からプロフィールへの遷移 [x]」はチャットUI化で実装なし（M5） |
| DATABASE.md:205 | comments に長さCHECKなし（chat-room計画は追加を想定）。comments の UPDATE が「要確認」のまま。Realtime 前提が無記載 |
| ARCHITECTURE.md | `docs/plans` 運用・`lib/` 追加ファイルの反映なし |
| README/REQUIREMENTS | 「匿名SNS」と、ヘッダーでのメール表示/コメント投稿者非表示の整合を要確認 |

---

## 修正を推奨する理由と修正方針（設計は変更しない前提）

| 項目 | 理由 | 方針 |
|---|---|---|
| H1 RLS/DB | 唯一の防御線。未検証のまま公開不可 | DATABASE.md §5 の SQL と Supabase の実ポリシーを突合。2アカウントで編集/削除/改ざん/未ログイン取得テスト。CHECK適用確認、コメントCHECK追加、Realtime publication 確認（**DB変更は承認後**） |
| H2 | 初回ユーザーの離脱 | 登録後に「確認メールを送りました」案内、Site URL/Redirect URL を本番に設定、リセットを実メールで検証 |
| H3 | 空表示は誤解を招く | 未ログイン時はログイン誘導、取得失敗は別メッセージ |
| H4 | 運営リスク | 最低限の利用規約・プライバシー・問い合わせ導線。通報機能は設計（DATABASE §10）に沿って別途 |
| M1/M2 | デザイン断絶 | 既存の `profile-card` 系トークン/クラスを流用して認証画面と公開プロフィールを整備。`<form onSubmit>`・送信中disabled・PW長検証 |
| M3/M4 | 誤操作・DB拒否 | 削除の確認、編集に `maxLength=500` とエラー文言の固定化 |
| M6 | 規模増で劣化 | `limit`＋追加読み込み、リクエストID、タグ絞り込みは `post_tags` 結合クエリ化 |
| M7 | 一貫性 | alert を画面内メッセージに統一 |
| M10 | 実機で崩れる可能性 | PC/タブレット/スマホ（実ブラウザ）で確認し、ヘッダー・チャット高さ・カード高さを調整 |
| L1 | 保守性 | `.profile-card` と `.post-form` の共通部を統合（見た目は維持） |
| 文書 | 信頼性 | `/signup`→`/register`、TASKS・README・DATABASE を現状に更新 |
| M11 | 回帰防止 | まず手動テスト表、余裕があれば Playwright |

---

## 7. 公開までに必要な作業一覧（優先順）
1. Supabase 実体の検証（RLS全テーブル、CHECK、Realtime、メール確認設定）＋ 2アカウント権限テスト
2. コメントのDB側CHECK追加・`posts_content_check` 適用確認（承認後）
3. 認証画面（login/register/reset）の整備とメール確認案内
4. 公開プロフィール画面のスタイル整備
5. 未ログイン/取得失敗/空の表示分離、エラー表示の統一
6. 投稿削除の確認・編集の文字数制限
7. 実機（PC・タブレット・スマホ）でのレイアウト確認（特にヘッダー・チャット画面）
8. `npm run build` の通過確認
9. 手動動作テスト一式（TASKS優先度A）
10. 最低限の利用規約・プライバシー・問い合わせ、通報導線の検討
11. ドキュメント整合（上記6の表）
12. Vercel 環境変数・Supabase Redirect URL 設定、デプロイ、本番URLで再確認

## 公開を妨げる重大な問題
1. **RLS/DB制約/Realtime設定が未検証**（H1・[未確認]。結果次第で最重大）
2. **メール確認・Redirect URL が未整備**（H2・[未確認]）
3. **未ログイン閲覧時の表示が誤解を招く**（H3）
4. **認証画面が未整備で、初回体験が崩れる**（M1）
5. **通報・規約が無い悩み系SNSの運営リスク**（H4・[推測]）

---

## 検証方法（本調査の再現）
- `npx eslint`（実行済み、問題なし）。`next build`・実機・Supabase 管理画面での確認は未実施。
- 本調査ではコード・DBを変更していない。変更したのはこのレポート（`docs/examination/audit-report.md`）のみ。
