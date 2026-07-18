# fl_shape_app

SVGをFlash Professional 8へベクターシェイプとして貼り付けるためのWindowsデスクトップアプリです。

## 必要なもの

- Windows
- Node.js / npm
- Inkscape

## セットアップと起動

```powershell
Set-Location D:\dev\fl_shape_app
npm install
npm run dev
```

ビルド後に起動する場合:

```powershell
npm run build
npm run start
```

## 使い方

1. `SVGを開く`、または画面へのドロップでSVGを読み込む
2. プレビューを確認する
3. `Flash用にコピー`を押す
4. Flash Professional 8で`Ctrl+V`する

プレビューはホイールで拡大・縮小、ドラッグで移動、ダブルクリックで全体表示できます。

## 変換の仕組み

SVGをSVGOで最適化し、Inkscape CLIでEMFへ変換します。そのEMFをPowerShellとWin32 APIを使ってWindowsクリップボードへ`CF_ENHMETAFILE`として設定します。

Inkscapeは以下の順で検出します。

1. 画面右下で選択したパス
2. 環境変数`INKSCAPE_PATH`
3. 標準的なインストール先
4. `where.exe inkscape`

設定したパスはElectronのユーザーデータ領域に保存されます。
