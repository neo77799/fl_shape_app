# fl_shape_app

Windows 用の小さなデスクトップアプリです。

- 入力: SVG
- 出力: Flash Professional 8 で `Ctrl+V` で貼り付けられる “ベクター(シェイプ)” を目指す

現状の実装は **SVG を EMF に変換して、Windows クリップボードへ EMF としてコピー**します。

## 要件

- Windows
- Node.js / npm（このリポジトリは npm 前提）
- Inkscape（`Copy As Shape` に必須。SVG→EMF 変換に使用）

## セットアップ

```powershell
Set-Location d:\Flash_dev\fl_shape_app
npm install
```

## 起動（開発）

```powershell
Set-Location d:\Flash_dev\fl_shape_app
npm run dev
```

## 起動（ビルド後）

```powershell
Set-Location d:\Flash_dev\fl_shape_app
npm run build
npm run start
```

## 使い方

1. アプリで `Load SVG` からSVGを選択
2. `Copy As Shape` を押してクリップボードへコピー
3. Flash Professional 8 で `Ctrl+V` で貼り付け

## Inkscape の検出

アプリは次の順で Inkscape を探します。

- 環境変数 `INKSCAPE_PATH`（推奨: 確実）
- 典型パス（例: `C:\Program Files\Inkscape\bin\inkscape.com`）
- `where.exe inkscape`

### 例: INKSCAPE_PATH を一時的に設定して起動

```powershell
$env:INKSCAPE_PATH="C:\Program Files\Inkscape\bin\inkscape.com"
npm run dev
```

### 例: INKSCAPE_PATH を恒久的に設定

```powershell
setx INKSCAPE_PATH "C:\Program Files\Inkscape\bin\inkscape.com"
```

設定後はアプリを再起動してください。

## 仕組み（概要）

- Electron main 側で SVG を SVGO で軽く正規化
- Inkscape CLI で EMF を生成
- `scripts/set-clipboard-emf.ps1` が Win32 API で `CF_ENHMETAFILE` としてクリップボードにセット

## トラブルシュート

- `Inkscape が見つかりません`:
  - Inkscape をインストールする
  - もしくは `INKSCAPE_PATH` を設定する
- `where.exe inkscape` が見つからない:
  - Inkscape インストーラで PATH 追加を選ぶ（もしくは `INKSCAPE_PATH` を使う）
- PowerShell 実行制限が気になる:
  - 本アプリは `powershell.exe -ExecutionPolicy Bypass` で `scripts/set-clipboard-emf.ps1` を実行します

## 開発メモ

- 環境によって `ELECTRON_RUN_AS_NODE=1` が設定されていると Electron GUI 起動が壊れるため、`scripts/run-electron.cjs` でその環境変数を外して起動します。

