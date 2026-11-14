# Echo 公開前監査レポート（調査のみ・コード変更なし）

凡例: **[確認済]**=コード/ドキュメントを実際に読んで確認 / **[推測]**=コードからの推論 / **[未確認]**=Supabase側設定・実機動作など確認不能
※ `npm run lint` / `npm run build` / 実機表示は実行していない（[未確認]）。

---

## 1. 現在のプロジェクトの状態

### 構成 [確認済]
- Next.js 16.2.7 + React 19 + Supabase(JS v2) + Tailwind v4。サーバーなし、全ページ `"use client"` でブラウザから直接Supabaseを呼ぶ構成。
- ファイル: `app/layout.tsx`, `app/page.tsx`(ホーム/タグ検索), `app/post/page.tsx`(作成), `app/post/[id]/page.tsx`(詳細・共感・コメント), `app/profile/page.tsx`(自分), `app/profile/[userId]/page.tsx`(公開), `app/login|register|reset-password(/update)/page.tsx`, `components/Header.tsx`, `components/PostCard.tsx`, `lib/supabase.ts`, `app/globals.css`(489行)。
- 空ディレクトリ: `hooks/`, `styles/`, `types/`, `docs/plans/features/`。型定義は各ファイルにローカル重複（`Tag`が4ファイル、`Profile`が4ファイル、`Post`が3ファイル）。
- 未コミット: `app/globals.css`（左列カードずれの修正途中: `left:±20px`除去→`padding-inline`化）、`docs/`（修正方針md）。TASKS.mdでも「カード位置ずれ」は進行中。

### 機能別実装状況 [確認済]
| 機能 | 状態 | 備考 |
|---|---|---|
| 認証 | 動作する実装あり | 登録/ログイン/ログアウト/リセットメール/新PW設定まで存在。入力検証・ローディングは貧弱（後述） |
| 投稿 | 作成・一覧・詳細・編集(PostCardのみ)・削除(ホームのみ) | 詳細画面に編集/削除なし |
| コメント | 投稿・一覧・本人削除 | 文字数制限なし |
| 共感 | 追加/解除/数表示は**詳細画面のみ** | ホームのカードに共感数・コメント数なし |
| プロフィール | 自分の編集・公開表示 | 登録時にprofiles行が作られず、`/profile`で保存するまで「名前未設定」 |
| タグ | 投稿時選択・一覧表示・絞り込み | タグ新規作成UIなし（仕様どおりと推測） |

---

## 2〜3. 問題点一覧と重要度

### 高
| # | 問題 | 根拠 |
|---|---|---|
| H1 | **ホーム以外の全ページがスクロール不能・内容が切れる** | `globals.css` の `body{overflow:hidden}`、`.app-main{height:0; overflow:hidden}`、`layout.tsx:70`。ホームだけ内部に`.post-grid-scroll`を持つ。投稿詳細(コメント多数)、投稿作成、プロフィール(投稿一覧)は画面高を超えると見えなくなる [確認済(CSS)/実機未確認]。スマホでは特に顕著 |
| H2 | **RLSの実設定が未検証** | DATABASE.md §5に方針/SQLはあるが、Supabase実体は確認不能 [未確認]。TASKS.md優先度Aでも未チェック。全データアクセスがクライアント直叩きのため、RLSが唯一の防御線 |
| H3 | **DB側の制約が文書上ほぼ無い** | DATABASE.md の posts/comments の `content text not null` のみ。空白のみ/長さ上限のCHECKなし。クライアント検証はバイパス可能（文字数上限は`profile`のmaxLengthのみ）。投稿・コメントに上限なし→巨大データ投入可 [確認済(文書)/実DBは未確認] |
| H4 | **メール確認フローの扱いが未定義** | `register/page.tsx` は成功時に無言で `/login` へ遷移。Supabase側で確認メール必須なら案内なしでログイン失敗する。本番のRedirect URL設定も未確認 [未確認] |

### 中
| # | 問題 | 根拠 |
|---|---|---|
| M1 | 未ログインでの閲覧挙動が不明瞭 | RLSは `to authenticated`（DATABASE.md）。未ログインのホームは空配列扱いで「該当する投稿はありません。」と表示され、ログイン誘導なし。公開閲覧の仕様がREQUIREMENTSと一致するか要確認 |
| M2 | 投稿＋タグ保存が非トランザクション | `post/page.tsx:69-102`。タグ保存失敗時、投稿だけ残りalertで通知後に遷移 |
| M3 | 投稿作成の二重送信対策なし | `post/page.tsx:142` ボタンは`loading`（タグ取得状態）のみで無効化。連打で重複投稿 |
| M4 | タグ絞り込みのレース条件 | `app/page.tsx:179-186` 連続クリックで古いレスポンスが後から上書きし得る。`.in("id", postIds)`は件数増でURL長超過の恐れ |
| M5 | 全件取得（ページネーションなし） | `app/page.tsx:102-111` `select("*")` 無制限。TASKSでも優先度C扱い。公開後データ増で劣化 |
| M6 | エラー処理が`alert()`と`console.error`中心 | `post/[id]`の`alert(error.message)`は内部エラー文言をそのままユーザーに露出。ホームは取得失敗時に画面表示なし(空表示と区別不能) |
| M7 | 認証画面の検証不足 | `register`: PW長・メール形式チェックなし、二重送信防止なし、ローディングなし。`login`: Enterキー送信不可（`<form>`でない）。`reset-password/update`: リカバリセッションの有無を事前確認せず、失敗時に初めてエラー |
| M8 | 認証依存画面にガードなし | `/post`, `/profile`はログイン確認が送信時のみ。未ログインでもフォーム表示。middleware/Server側チェックなし（クライアント直結構成のため設計上の特性） |
| M9 | 詳細・フォーム画面が未スタイル/インラインstyle | `post/[id]/page.tsx:293-306`にインラインstyle(`#e5e7eb`)、他は素のHTML。ホームのガラス調デザインと不一致。暗背景に素のinput/button |
| M10 | `<main>`の入れ子 | `layout.tsx:70`の`<main>`内に各ページが`<main>`を出力（HTML仕様違反・a11y）。 |
| M11 | テスト皆無 | テストファイル/設定なし、`package.json`に`test`スクリプトなし [確認済] |
| M12 | 登録時にprofile未作成（匿名名なし） | 投稿者が「名前未設定」で並ぶ。DB trigger有無は未確認 [未確認]（DATABASE.mdにtrigger記載なし） |

### 低
| # | 問題 | 根拠 |
|---|---|---|
| L1 | 未使用コード | `app/page.tsx`: `email`状態・`Link`import未使用。`.home-login-info`はCSSのみで未使用。`useState`のemail取得も無駄なAPI呼び出し |
| L2 | CSS重複/残骸 | `globals.css:250-257` 「投稿カード」見出しが重複。`.site-footer-label, .home-tag-area h2`の色指定と`.home-tag-area h2`の再指定が重複(58-62 / 177-182)。`.home-main`等の命名が一貫（BEM/ハイフン混在: `post-card__*`と`home-*`）。TASKSの`cloud-card`は現CSSに**存在せず**残存なし [確認済] |
| L3 | フォント指定が無効 | `layout.tsx`でGeistを読み込むが、`body{font-family:sans-serif}`が上書きし未使用。日本語サイトにlatinサブセットのみ |
| L4 | レスポンシブの穴 | ヘッダー: 700px以下で`min-height:150px`固定の絶対配置ナビ、メール表示が長いと折返し/重なりの可能性 [推測]。`.post-card`は`height:220px`固定、`font-size:22px`固定で長文/英数字は3行クランプで切れる(詳細ページへ誘導のため仕様的には許容)。`.app-main margin-bottom:49px`はフッター高の決め打ち |
| L5 | import流儀の混在 | `@/lib/supabase`と`../../lib/supabase`が混在。インデント(2/4)・クォートも不統一（register/login/reset-passwordが4スペース） |
| L6 | `PostCard`の状態同期 | `displayContent`が初期値のみ保持。親が再取得しても更新されない（編集はローカル反映なので現状は表面化しにくい） |
| L7 | 型の弱さ | `as unknown as PostTag[]`(`page.tsx:160`)、`post/[id]`も同様キャスト。Supabase生成型(`supabase gen types`)未使用。`NEXT_PUBLIC_*`に`!`断定でenv未設定時に実行時まで気付かない |
| L8 | `tsconfig.tsbuildinfo`/`next-env.d.ts`が作業ツリーに存在 | .gitignore済みで追跡はされていない [確認済]。問題なし |
| L9 | 共感/コメント数が一覧に出ない | 機能面の見劣り（UX） |

---

## 4. セキュリティ評価
- **確認済・良好**: `.env.local`は`.gitignore`の`.env*`で除外、gitの追跡対象外。クライアントで使うのは`NEXT_PUBLIC_SUPABASE_URL`/`ANON_KEY`のみ。`service_role`キー使用箇所なし（`grep`相当で`lib/supabase.ts`のみ）。dangerouslySetInnerHTML等なし（Reactの自動エスケープでXSS低リスク）。ユーザー所有操作は常に`.eq(user_id)`/RLS前提。ユーザーIDは`auth.getUser()`(サーバー検証)由来。
- **懸念**: 本人判定がUI側（`post.user_id === userId`）に依存する箇所はあるが、実防御はRLS。**RLS未検証(H2)**。`posts`の`update`は`with check`で`user_id`改ざん防止の記載あり(文書上OK)。`profiles.insert/update`は`upsert`を使用 → insert+update両ポリシー必要（文書上は存在）。`empathies`のUNIQUE(user_id,post_id)はDATABASE.md上あり（実DB未確認）。コメント/投稿に**通報・ブロックなし**で、匿名の悩み系サービスとして公開時のモデレーション欠如はリスク（TASKS優先度C扱い）。メール(`Header`)は本人のみに表示で匿名性は維持。プロフィール公開URLが`user_id`(UUID)で、投稿者名がリンクされる点は仕様どおり。
- **未確認**: Supabaseのメール確認設定、レート制限、Redirect URL、SMTP、DBのCHECK/trigger、実際のポリシー有効状態、Auth Captcha。

## 5. 品質まとめ
- ローディング: ホーム/詳細/プロフィールに「読み込み中...」あり。送信系のローディングは`profile`/`reset`系のみ。
- エラー: 3系統混在（alert / message state / console）。統一なし。
- パフォーマンス: 全件取得、`profiles.find`のO(n²)（件数少なければ許容）、`getUser`と`getSession`の二重呼び出し。
- テスト: なし。lint/buildは未実行。

## 6. ドキュメント整合性 [確認済]
- README.md/ARCHITECTURE.md/DESIGN.md: ルートを **`/signup`** と記載、実装は **`/register`**（README:114, ARCHITECTURE:94,690,730, DESIGN:683）。
- TASKS.md: パスワードリセットが「保留」だが、`reset-password/*`は**実装済み**（動作は[未確認]）。「CSS cloud-card整理」は対象が既に無い。「レスポンシブ対応[x]」と「スマホ表示確認[ ]」が矛盾。`docs/plans`は未記載。
- ARCHITECTURE/DESIGNは`hooks/`/`types/`構成を示唆している可能性があるが現状は空ディレクトリ（個別grep上は明確な記載なし→[推測]）。
- DATABASE.mdはSQLの正だが、実DBと一致するかは[未確認]。profiles自動作成のtrigger記載なし。

---

## 修正を推奨する理由と方針（設計は変えない前提）
| 対象 | 理由 | 方針 |
|---|---|---|
| H1 スクロール | 公開後に詳細・フォームが使えなくなる | 非ホームページで内部スクロールする共通ラッパーclass、または`.app-main`の`overflow-y:auto`化。ホームの現行構造は維持 |
| H2 RLS | 唯一の防御線 | DATABASE.md §5のSQLと実Supabaseのポリシー一覧を突合。別アカウント2つで編集/削除/改ざんテスト（TASKS既存項目） |
| H3 DB制約 | クライアント検証迂回対策 | `content`に長さ/空白CHECKを追加（DB変更は別途ご承認のうえ）。クライアントにも`maxLength`と文字数表示 |
| H4/M7 認証UX | 初回ユーザー離脱 | 登録後に「確認メールを送信」案内、PW長検証、`<form onSubmit>`化、送信中disabled |
| M1 | 仕様確認 | 未ログイン時の挙動を仕様決定（ログイン誘導表示 or 閲覧公開） |
| M2/M3 | データ不整合・重複 | 送信中state追加。タグ保存はRPC等を検討（要設計承認） |
| M4/M5 | 安定性・将来性 | 最新リクエストのみ反映(requestId)、`limit`+追加読み込み |
| M9/M10/L2/L3 | 一貫性 | 詳細/フォーム画面に既存のガラス調トークンを適用、`<main>`重複除去、CSS整理 |
| L1/L5/L7 | 保守性 | 未使用削除、型を`types/`へ集約、import統一 |
| 文書 | 信頼性 | `/signup`→`/register`、TASKS更新 |
| M11 | 回帰防止 | 最低限の手動テスト表→余裕があればPlaywright |

---

## 7. 公開までに必要な作業一覧（優先順）
1. H1 非ホーム画面のスクロール/レイアウト修正（実機でPC/スマホ確認）
2. 左列カードずれの修正を完了しコミット（未コミットの`globals.css`、docs/plan）
3. RLS全テーブル検証＋2アカウントでの権限テスト（H2）
4. DB側制約/trigger有無の確認と、必要なら追加（承認後）（H3, M12）
5. Supabase Auth設定: メール確認ON/OFF、Site URL・Redirect URL、SMTP、リセットメール動作確認（H4）
6. 認証画面のバリデーション・案内整備（M7）
7. 詳細/投稿/プロフィール画面のデザイン統一（M9, M10）
8. エラー/空/未ログイン表示の統一（M1, M6）
9. `npm run lint` / `npm run build` の通過確認（未実行）
10. 手動動作テスト（TASKS 動作テスト項目一式）
11. ドキュメント整合（signup→register 等）、TASKS更新
12. Vercel環境変数設定・デプロイ・公開URLで再確認
13. 利用規約/プライバシー/通報導線の最低限の検討（悩み相談系のため）

## 7'. 現時点で公開を妨げる重大な問題
1. **H1**: ホーム以外のページがスクロール不能（[確認済(CSS)]、実機は[未確認]）
2. **H2**: RLS実設定が未検証（[未確認]。結果次第で最重大）
3. **H4**: 認証メール確認/Redirect URL未設定の可能性（[未確認]）
4. **H3**: DB側の入力制約不足（投稿・コメントの長さ上限なし）
5. 悩み系SNSとして通報・ブロック・利用規約が無い点は公開判断として要検討（法的/運用リスク。[推測]）

---
本調査ではコード・ファイル・DBの変更は一切行っていない（このレポート用の計画ファイルのみ作成）。
