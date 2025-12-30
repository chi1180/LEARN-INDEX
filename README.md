# LEARN INDEX

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

無料で学べるプログラミング学習リソースのキュレーションリポジトリです。

コミュニティからのコントリビューションを歓迎しています！あなたのおすすめの学習サイトを追加してください。

## 概要

このプロジェクトは、無料または低コストで利用できるプログラミング学習リソースを収集し、Notion データベースに同期することで、誰もがアクセスしやすい形で情報を提供することを目的としています。

## コントリビューション方法

### 1. リポジトリをフォーク

このリポジトリをフォークして、ローカルにクローンしてください。

### 2. 新しいリソースを追加

以下のコマンドで新しいリソースファイルを作成できます：

```bash
bun run new-site <name-of-jsonfile>
```

例：

```bash
bun run new-site my-awesome-resource
bun run new-site "My Awesome Resource"  # 自動的に kebab-case に変換されます
```

これにより `sites/<name-of-jsonfile>.json` にテンプレートファイルが作成されます。

または、手動で `sites/` ディレクトリに新しい JSON ファイルを作成することもできます。

#### ファイル名のルール

- **kebab-case** を使用してください（例: `my-resource.json`）
- 小文字の英数字とハイフンのみ使用可能

#### JSON スキーマ

以下のスキーマに従って JSON ファイルを作成してください：

```json
{
  "$schema": "../src/schema.json",
  "name": "リソース名",
  "url": "https://example.com/",
  "type": "learning",
  "description": "リソースの説明（300文字以内）",
  "topics": ["JavaScript", "Web Development"],
  "style": "interactive",
  "pricing": "free",
  "links": {
    "github": "https://github.com/example/repo",
    "documentation": "https://example.com/docs"
  },
  "introducer": {
    "github": "@your-username"
  }
}
```

#### 必須フィールド

| フィールド    | 型           | 説明                                                                      |
| ------------- | ------------ | ------------------------------------------------------------------------- |
| `name`        | string       | リソースの名前                                                            |
| `url`         | string (URI) | リソースの公式URL                                                         |
| `type`        | enum         | `learning`, `reference`, `tutorial`, `course`, `documentation` のいずれか |
| `description` | string       | 簡潔な説明（最大300文字）                                                 |
| `topics`      | array        | カバーするトピックのリスト                                                |
| `style`       | enum         | `interactive`, `video`, `reading`, `project-based`, `mixed` のいずれか    |
| `pricing`     | enum         | `free`, `freemium`, `paid`, `subscription` のいずれか                     |

#### オプションフィールド

| フィールド   | 型     | 説明                                              |
| ------------ | ------ | ------------------------------------------------- |
| `links`      | object | 関連リンク（github, documentation, article など） |
| `introducer` | object | 紹介者の情報（github, x）※ `@` で始めること       |

### 3. テストを実行

Pull Request を作成する前に、ローカルでテストを実行してください：

```bash
bun install
bun run test
```

### 4. Pull Request を作成

変更をコミットし、Pull Request を作成してください。

## セットアップ

### 必要要件

- [Bun](https://bun.sh) v1.2.0 以上

### インストール

```bash
bun install
```

### テスト

```bash
bun run test
```

URL のアクセスチェックをスキップする場合：

```bash
SKIP_URL_CHECK=true bun run test
```

### Notion への同期（管理者用）

環境変数を設定してから実行：

```bash
export NOTION_API_KEY="your-api-key"
export NOTION_DATABASE_ID="your-database-id"
bun run sync
```

## ライセンス

MIT License

## 謝辞

このプロジェクトに貢献してくださったすべての方に感謝します！
