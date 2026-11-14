# 不具合対応方針: ホーム以外のページがスクロールできず内容が切れる (audit H1)

## 1. 問題の整理

### 現象
ホーム(`/`)以外のページ(投稿詳細 `/post/[id]`、投稿作成 `/post`、プロフィール `/profile`・`/profile/[userId]`、ログイン・登録・パスワードリセット系)で、コンテンツが画面高を超えるとスクロールできず、下部が見えなくなる。スマホ(ヘッダー高 150px)で特に顕著。

### 期待結果
- ホーム以外のページで、コンテンツが画面高を超えたときに縦スクロールで最後まで閲覧・操作できる
- ホームの現行挙動(タグエリア固定・投稿一覧のみ内部スクロール)は変えない
- 固定フッターにコンテンツが隠れない

### 前提・不明点
- 実機(PC/スマホ)での再現は未確認。CSS上の確認のみ。
- `body{overflow:hidden}` を採用した意図(ホームを画面固定にするため、と推測)は文書から確認できず、**意図は推測**。
- 非ホームページのデザイン(余白・幅・ガラス調)は今回の範囲外。現状は素の `<main>` で余白なし。

## 2. 原因分析

### 原因(コード上で特定済み)
スクロール経路が「ホームだけ内部スクロール」で作られており、他ページには経路がない。

| 箇所 | 内容 |
|---|---|
| `app/globals.css:12-19` | `body { height:100%; overflow:hidden }` — ページ全体スクロールを封鎖 |
| `app/globals.css:42-47` | `.app-main { flex:1 1 0%; height:0; margin-bottom:49px; overflow:hidden }` — メイン領域は「画面高 − ヘッダー − フッター分」に固定され、はみ出しはクリップ |
| `app/layout.tsx:70` | `<main className="app-main ... min-h-0 overflow-hidden">` — Tailwindでも `overflow-hidden` を重ねて指定 |
| `app/globals.css:158-164, 230-238` | ホームのみ `.home-main{height:100%; overflow:hidden}` + `.post-grid-scroll{overflow-y:auto}` で内部スクロールを自前で持つ |
| 非ホーム各 `page.tsx` | `app/post/[id]/page.tsx:277`、`app/post/page.tsx:109`、`app/profile/page.tsx:104`、`app/profile/[userId]/page.tsx:88` 等は素の `<main>`(スクロール容器なし) |

結果: 非ホームページの内容は `.app-main`(高さ固定・overflow hidden)内に描画され、超過分は切り取られ、スクロール手段もない。ヘッダー(PC 105px / スマホ 150px)+ フッター余白 49px 分だけ可視領域も狭いため、スマホで顕著。

## 3. 対応方針

### 比較

| 案 | 内容 | 長所 | 短所 |
|---|---|---|---|
| **A(推奨)** | `.app-main` を縦スクロール容器にする(`overflow-y:auto`)。layout.tsx の重複 `overflow-hidden` を除去 | 変更はCSS1か所+layout 1か所。全非ホームページを一括解決。ホームは `.home-main{height:100%}` により `.app-main` の高さに収まるため構造維持 | ホーム以外のスクロールバーが `.app-main` 全幅の右端に出る(ホームは内部コンテナ内)。ホームの `.home-main` が `.app-main` の高さを正しく継承するかの実機確認が必要 |
| B | 非ホーム各ページに共通ラッパーclass(例 `.page-scroll{height:100%;overflow-y:auto}`)を付与 | ホームに一切影響しない | 対象 8 ページ前後の `page.tsx` を全て編集。新規ページで付け忘れると再発(根本対策でない) |
| C | `body` のスクロールを復活しホームだけ固定化 | 一般的な構造 | ホームのレイアウト基盤を作り替えることになり、直近のカード位置・スクロールバー調整への影響が大きい |

### 推奨: 案A
原因が「共通レイアウト(`.app-main`)がスクロール手段を持たない」点にあるため、共通レイアウト側で解決するのが根本対応。既存の `.home-main`/`.post-grid-scroll` は変更不要で、ページ側の編集も不要。

## 4. 具体的な実装方法

1. `app/globals.css` の `.app-main`(42-47行)
   - `overflow: hidden;` → `overflow-x: hidden; overflow-y: auto;`
   - 横方向は従来どおりクリップを維持(意図しない横スクロール防止)
   - 必要なら `overscroll-behavior: contain;` を追加(`.post-grid-scroll` と同様。任意)
2. `app/layout.tsx:70` の `<main>` から Tailwind の `overflow-hidden` を削除(CSSと二重指定になっており、将来の優先順位の混乱を避ける)。`min-h-0`・`flex-1` は維持。
3. `.home-main`(`height:100%; overflow:hidden`)と `.post-grid-scroll` は変更しない。
   - `.app-main` は `height:0; flex:1 1 0%` の flex 子要素。現状でも `.home-main{height:100%}` が機能している前提(ホームが現在正常に表示されているため)だが、`overflow-y:auto` 化後も同じ高さ解決になることを実機で確認する。
   - もしホームでスクロールバーが二重に出る/ホームの高さが崩れる場合のフォールバック: `.app-main:has(> .home-main){overflow:hidden}` を追加する(まず上記1-2で確認)。
4. 余白・幅・デザイン統一(M9/M10 の領域)は**今回行わない**。

## 5. 変更が想定されるファイル

| ファイル | 変更 |
|---|---|
| `app/globals.css` | `.app-main` の overflow 指定変更(約1-2行) |
| `app/layout.tsx` | `<main>` の `overflow-hidden` クラス削除(1か所) |

(各 `page.tsx` と `.home-main` / `.post-grid-scroll` は変更なし)

## 6. 実装後の確認・テスト項目

PC幅(1200px以上)・タブレット(~900px)・スマホ(~600px以下)で実施。

- ホーム
  - [ ] タグエリアが固定されたまま、投稿一覧だけスクロールする
  - [ ] スクロールバーが二重に出ない / ホーム全体がスクロールしない
  - [ ] 左列カードのずれが再発しない(`post-card-left-column-offset` の修正を損なわない)
- 投稿詳細: コメントを多数(画面高超)用意し、最下部のコメント・フォームまで到達できる
- 投稿作成 `/post`: スマホ高さでも送信ボタンまで到達できる
- プロフィール `/profile` `/profile/[userId]`: 投稿一覧が多い場合に最後まで見える
- ログイン/登録/リセット系: スマホ横向きなど低い画面でもフォームが切れない
- 固定フッター(© 2026 Echo)がコンテンツ最下部を隠さない(`margin-bottom:49px`)
- 横スクロールが発生しない
- `npm run lint` / `npm run build` が通る

## 未確定・要確認事項
- `body{overflow:hidden}` の設計意図(推測: ホーム画面固定のため)
- 実機でのホームの高さ解決(上記フォールバックの要否)
- 非ホームページのデザイン統一は別課題(audit M9/M10)として今回対象外
