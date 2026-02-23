GithubCopilotの学割で気づいたらClaudeCode（？）が使えるようになってたのでそれで作りました。
バイブコーディング１００％なので変な部分あったらすみません。
# Twitter Bookmarks to Notion

Twitter(X)のツイートをフォルダ分けしてNotionデータベースに保存するChrome拡張機能です。

## 機能

- タイムライン上の各ツイートにNotion保存ボタンを追加
- Notionデータベースのページをフォルダとして一覧表示・選択
- ポップアップから新規フォルダを作成して即座に保存
- ツイートをNotionページ内にリッチ埋め込み（embed）で保存（非対応時はbookmarkにフォールバック）
- Twitterのライト/ダークテーマに自動対応
- レートリミット時の自動リトライ（指数バックオフ）

## セットアップ

### 1. Notion側の準備

1. [Notion Integrations](https://www.notion.so/my-integrations) で新しいインテグレーションを作成
2. 「Internal Integration Secret」(`ntn_` または `secret_` で始まるトークン) をコピー
3. Notionにブックマーク用のデータベースを作成（既存のものでもOK）
4. インテグレーションにデータベースへのアクセス権を付与
   - 推奨: インテグレーション詳細の「コンテンツへのアクセス」から対象のデータベースを追加
5. データベースをフルページで開き、URLから32文字のDatabase IDを取得

### 2. 拡張機能のインストール

1. このリポジトリをクローンまたはダウンロード
2. Chromeで `chrome://extensions` を開く
3. 右上の「デベロッパーモード」を有効にする
4. 「パッケージ化されていない拡張機能を読み込む」をクリックし、このプロジェクトのフォルダを選択

### 3. 拡張機能の設定

1. Chromeの拡張機能一覧からオプションページを開く
2. Notion Integration Tokenを入力
3. Database IDを入力
4. 「設定を保存」をクリックして接続テストを確認

## 使い方

1. [Twitter(X)](https://x.com) を開く
2. 各ツイートのアクションバー（いいね・RT等の横）に追加されたブックマークボタン（+付きしおりアイコン）をクリック
3. 保存先フォルダを選択、または新規フォルダを作成して保存
4. 保存が完了するとトースト通知が表示され、ボタンが青色に変化

## プロジェクト構成

```
├── manifest.json              # Chrome拡張マニフェスト (Manifest V3)
├── background/
│   └── service-worker.js      # Notion APIとの通信を担当するService Worker
├── content/
│   ├── content.js             # Twitterページへのボタン注入・ポップアップUI
│   └── content.css            # ボタン・ポップアップ・トーストのスタイル
├── options/
│   ├── options.html           # 設定ページのHTML
│   ├── options.js             # 設定の保存・接続テスト
│   └── options.css            # 設定ページのスタイル
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## 必要な権限

| 権限 | 用途 |
|------|------|
| `storage` | Notionトークン・Database IDの保存 |
| `host_permissions: https://api.notion.com/*` | Notion APIへのリクエスト |
| Content Script: `x.com`, `twitter.com` | ツイートへのボタン注入 |

## 技術仕様

- **Manifest Version**: V3
- **Notion API Version**: 2022-06-28
- **依存ライブラリ**: なし（Vanilla JS）
- **対応ブラウザ**: Chrome / Chromium系ブラウザ
