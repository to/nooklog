# Project File List

| Path | Type | Description |
| :--- | :--- | :--- |
| electron | ーーー | デスクトップアプリ版（Electron） |
| electron/icon_256.png |  |  |
| electron/icon_32.png |  |  |
| electron/main.cjs |  | Electronのメインプロセス。サーバー起動とトレイ管理。UIなし。 |
| public | ーーー | フロントエンド資産（HTML/JS/CSS） |
| public/home.html |  | アプリケーションのメイン検索と閲覧ページ。 |
| public/openapi.html |  | oRPCから生成されたAPI仕様を閲覧するためのドキュメント（Scalar）。 |
| public/update.html |  | ブックマーク登録・編集ページ。 |
| public/component | ーーー | UIコンポーネント群。このディレクトリ以下に含まれるhtmlファイルは、ウェブサーバーによりリアルタイムにJavaScriptの文字列のHTMLテンプレートとして変換配信される。 |
| public/component/OptionalField.js |  |  |
| public/component/TagInput.js |  | Tagifyを用いたタグ入力コンポーネント。 |
| public/component/ConfigDialog | ーーー | 設定ダイアログ |
| public/component/ConfigDialog/ConfigDialog.css |  |  |
| public/component/ConfigDialog/ConfigDialog.html |  |  |
| public/component/ConfigDialog/ConfigDialog.js |  | 設定ダイアログ(Server/Database/Client)の入力と制御。 |
| public/component/PreviewPanel | ーーー | 検索結果の詳細表示・編集を行うサイドパネル。 |
| public/component/PreviewPanel/PreviewPanel.html |  | プレビューパネルの基本構造。 |
| public/component/PreviewPanel/PreviewPanel.js |  | 検索結果の詳細表示・編集を行うサイドパネル。Markdown描画とUpdateFormを含む。 |
| public/component/ProgressBar | ーーー | 進捗表示用プログレスバー。 |
| public/component/ProgressBar/ProgressBar.css |  |  |
| public/component/ProgressBar/ProgressBar.js |  |  |
| public/component/RatingInput | ーーー | 5段階評価（星）の入力用コンポーネント。 |
| public/component/RatingInput/RatingInput.css |  |  |
| public/component/RatingInput/RatingInput.js |  | ★★★★★評価（Rating）の入力制御。 |
| public/component/ResizeHandle | ーーー | パネル等の境界線をドラッグしてサイズ変更するためのハンドル。 |
| public/component/ResizeHandle/ResizeHandle.css |  |  |
| public/component/ResizeHandle/ResizeHandle.js |  | テキストエリアやパネルのリサイズ。 |
| public/component/ResultTable | ーーー | 検索結果テーブル |
| public/component/ResultTable/ResultTable.css |  |  |
| public/component/ResultTable/ResultTable.js |  | 検索結果の一覧表示、選択、レート変更などのインタラクション。 |
| public/component/SearchForm | ーーー | 検索キーワードや条件を入力するフォーム。 |
| public/component/SearchForm/SearchForm.html |  |  |
| public/component/SearchForm/SearchForm.js |  | 検索ワード入力と検索のトリガー。 |
| public/component/Toast | ーーー | 画面上部に表示される通知メッセージ（トースト）。 |
| public/component/Toast/Toast.css |  |  |
| public/component/Toast/Toast.js |  | トースト、通知、エラー表示。 |
| public/component/UpdateForm | ーーー | ブックマーク編集フォーム |
| public/component/UpdateForm/UpdateForm.css |  |  |
| public/component/UpdateForm/UpdateForm.html |  |  |
| public/component/UpdateForm/UpdateForm.js |  | ブックマーク編集フォームのコア。拡張機能側とシンボリックリンク(tools/browser-extension/public)経由でコードを共有する。 |
| public/css | ーーー | スタイルシート群（@layer構成） |
| public/css/home.css |  | 検索/ホームページ用スタイル。home.htmlとペア。 |
| public/css/update.css |  | ブックマーク更新・登録フォームページ用スタイル。update.htmlとペア。 |
| public/css/application | ーーー | アプリ内で共通で使われるスタイル群。 |
| public/css/application/application.css |  | アプリ全体の共通ベーススタイル。 |
| public/css/application/markdown.css |  | Markdown表示用のスタイル。 |
| public/css/application/tagify.css |  | Tagifyのカスタマイズスタイル。 |
| public/css/base | ーーー |  |
| public/css/base/color.css |  | Radix Colors由来のカラーパレット定義。 |
| public/css/base/gray.css |  | Radix Colors由来のグレースケール定義。 |
| public/css/base/layout.css |  | **重要**Tailwindライクなアトミックルール。flex, grid, margin, padding等のレイアウト用ユーティリティ。 |
| public/css/base/reset.css |  | ブラウザ既定スタイルのリセット。アプリとドキュメント、共用できるものを記述。 |
| public/css/base/theme.css |  | **重要**テーマ・ダークモードのCSS変数定義。デザイントークン。 |
| public/image | ーーー | 画像アセット |
| public/image/icon_32.png |  |  |
| public/js | ーーー | クライアント側ロジック |
| public/js/app.js |  | UIの状態を保存するlocalStorageの窓口（app.set/app.get）。notify/errorなどトースト表示を行う。アプリケーションの中心的ユーティリティー。 |
| public/js/Component.js |  | HTMLElementを継承するWeb Component基底クラス。thi.$(), thi.$$(), show(), hide() などの共通DOM操作を提供する。 |
| public/js/init.js |  | 言語／環境判定やテーマ設定の初期化。チラつきを抑えるため最短に保つ。 |
| public/js/Network.js |  | ネットワーク接続の低レイヤークラス。fetchラッパー。 |
| public/js/Nooklog.js |  | バックエンドAPIとの通信担当クラス。 |
| public/js/util.js |  | EventEmitter (hub), DOMユーティリティ ($/$$), sanitize, renderMarkdown 等を含む共通ユーティリティ群。「他アプリでも使える関数」が集合地点の目安となる。 |
| public/lib | ーーー | 外部ライブラリ |
| public/lib/EventEmitter.min.js |  |  |
| public/lib/marked.min.js |  | Markdownのレンダリング。 |
| public/lib/purify.min.js |  | DOMPurify。Markdownのサニタイズ。 |
| public/lib/material-symbols | ーーー | Google Material Symbols（アイコンフォント） |
| public/lib/material-symbols/material-symbols-filled.woff2 |  |  |
| public/lib/material-symbols/material-symbols-outlined.woff2 |  |  |
| public/lib/material-symbols/material-symbols.css |  |  |
| public/lib/tagify | ーーー | Tagify（タグ入力用ライブラリ） |
| public/lib/tagify/tagify.css |  |  |
| public/lib/tagify/tagify.js |  | タグ補完コンポーネント。 |
| server | ーーー | サーバーサイド |
| server/router.js |  | oRPCを用いたAPIエンドポイント（検索・保存・削除・入出力等）の定義。 |
| server/server.js |  | Webサーバーのエントリポイント（Express）。APIエンドポイントの定義。 |
| server/core | ーーー | 共通ライブラリ群 |
| server/core/config.js |  | 設定ファイル (nooklog.config.json) の管理。デフォルト設定とI/Oを担当。 |
| server/core/database.js |  | libsqlの接続管理、テーブル・インデックス作成、メタデータ保存を担当する低レベル層。 |
| server/core/hub.js |  | サーバー内グローバルイベントバス（EventEmitter）。全イベントをワイルドカードで購読可能。 |
| server/core/log.js |  | Pinoによる構造化ロギングの定義。 |
| server/core/nooklog.js |  | アプリケーションのサービス層。タグキャッシュ同期や登録ロジックの調整を担当。 |
| server/core/queue.js |  | 並列実行制御（PQueue）を用いたタスクキュー。一括処理（バッチ）を管理。 |
| server/core/store.js |  | データアクセス層 (DAO)。FTSや複雑なクエリ構築、基本的なCRUD操作を担当。 |
| server/core/util.js |  | 配列操作、文字列処理、環境判定などのサーバー側共通ユーティリティ。 |
| server/core/ingest | ーーー | 外部データ（HTMLやJSON）から必要な情報を抽出・変換するモジュール群。 |
| server/core/ingest/bookmark.js |  | 各種フォーマット（Pinboard, Session Buddy, Netscape HTML等）からブックマーク情報をパース・抽出する。 |
| server/core/ingest/browser.js |  | Playwright (Chromium) を用いて、URLから動的に生成されたHTMLを取得する。 |
| server/core/ingest/html.js |  | ReadabilityとTurndownを用いて、HTMLの本文をクリーンなMarkdown形式に変換・抽出する。 |
| server/core/ingest/index.js |  | 入力コンポーネント(html.js/bookmark.js)をまとめるエントリーポイント。 |
| server/core/sentence | ーーー | テキストのチャンク分割とベクトル化（埋め込み）を担当するコアモジュール。 |
| server/core/sentence/chunk.js |  | Markdownの構造（見出し、リスト、コードブロック等）を解析し、意味を保ちつつ適切なサイズに分割する。 |
| server/core/sentence/index.js |  | チャンク化・ベクトル化機能の統合。日本語正規化や、FTS検索用のUni-gramセグメント化も提供。 |
| server/core/sentence/vector.js |  | OpenAI互換APIを使い、テキストを分散表現（ベクトル）に変換する。 |
| tool | ーーー | ツール群 |
| tool/browser-extension | ーーー | Chrome拡張機能のソースコード |
| tool/browser-extension/background.js |  | Service Worker。ブックマーク判定や初期化を担当。 |
| tool/browser-extension/manifest.json |  | 拡張機能の設定ファイル（V3）。 |
| tool/browser-extension/content | ーーー | ターゲットページに注入されるスクリプト |
| tool/browser-extension/content/bridge.js |  | 拡張内の各コンテキスト間（content/frame/UpdateForm）の通信中継。一時セッションデータの保存など。役割の詳細はextension-communication-flow_bridge.mdを参照。 |
| tool/browser-extension/content/content.js |  | 閲覧ページのHTML取得、IFRAME制御、選択テキスト送信を担当。 |
| tool/browser-extension/content/frame.html |  | クロスサイト制約を突破するためのIFRAME。2重のIFRAME構成。 |
| tool/browser-extension/content/frame.js |  | フレーム側の制御ロジック。 |
| tool/browser-extension/image | ーーー | 拡張機能用アイコン画像群 |
| tool/browser-extension/image/icon_128.png |  |  |
| tool/browser-extension/image/icon_32.png |  |  |
| tool/browser-extension/image/icon_48.png |  |  |
| tool/browser-extension/page | ーーー | 拡張独自のページ定義 |
| tool/browser-extension/page/setting.html |  | 拡張機能のオプション画面。 |
| tool/browser-extension/page/SettingForm.js |  | 拡張機能のオプション画面(ロジック)。 |
| tool/docker | ーーー |  |
| tool/docker/docker-compose.yml |  |  |
| tool/docker/Dockerfile |  |  |
| tool/userjs | ーーー |  |
| tool/userjs/Auto_Save.user.js |  |  |
| tool/userjs/Auto_Summary.user.js |  |  |
| tool/userjs/Auto_Tagging.user.js |  |  |
| tool/userjs/Save_to_Nooklog.user.js |  |  |