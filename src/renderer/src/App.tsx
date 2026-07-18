import { useEffect, useRef, useState } from "react";
import Preview from "./Preview";

type SvgState = { path: string; svgText: string } | null;

export default function App() {
  const [svg, setSvg] = useState<SvgState>(null);
  const [inkscapePath, setInkscapePath] = useState("");
  const [status, setStatus] = useState("SVGファイルを読み込んでください。");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);

  useEffect(() => {
    void window.app?.getSettings().then((result) => setInkscapePath(result.settings.inkscapePath ?? ""));
  }, []);

  async function openSvg() {
    const result = await window.app?.openSvg();
    if (!result || !result.ok) {
      if (result?.reason !== "canceled") setStatus(result?.message ?? "SVGを開けませんでした。");
      return;
    }
    setSvg({ path: result.path, svgText: result.svgText });
    setStatus("プレビューを確認して「Flash用にコピー」を押してください。");
  }

  async function pickInkscape() {
    const result = await window.app?.pickInkscape();
    if (!result || !result.ok) {
      if (result?.reason !== "canceled") setStatus(result?.message ?? "Inkscapeを設定できませんでした。");
      return;
    }
    setInkscapePath(result.path);
    setStatus("Inkscapeを設定しました。");
  }

  async function copyAsShape() {
    if (!svg) return;
    setBusy(true);
    setStatus("EMFへ変換しています…");
    try {
      const result = await window.app?.copyAsShape(svg.svgText);
      setStatus(result?.ok ? "コピーしました。Flash Professional 8でCtrl+Vしてください。" : result?.message ?? "変換に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setSvg(null);
    setStatus("SVGファイルを読み込んでください。");
  }

  async function loadDroppedFile(file: File) {
    if (!file.name.toLowerCase().endsWith(".svg")) {
      setStatus("SVGファイル（.svg）のみ読み込めます。");
      return;
    }

    const filePath = (file as File & { path?: string }).path;
    if (filePath) {
      const result = await window.app?.loadSvgFromPath(filePath);
      if (result?.ok) {
        setSvg({ path: result.path, svgText: result.svgText });
        setStatus("プレビューを確認して「Flash用にコピー」を押してください。");
        return;
      }
    }

    setSvg({ path: file.name, svgText: await file.text() });
    setStatus("プレビューを確認して「Flash用にコピー」を押してください。");
  }

  return (
    <main
      className="app"
      onDragEnter={(event) => {
        event.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={(event) => {
        event.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        const file = event.dataTransfer.files[0];
        if (file) void loadDroppedFile(file);
      }}
    >
      <header className="toolbar">
        <div>
          <div className="title">SVG → Flash Shape</div>
          <div className="fileName">{svg?.path ?? "ファイル未選択"}</div>
        </div>
        <div className="actions">
          <button onClick={() => void openSvg()} disabled={busy}>SVGを開く</button>
          <button className="primary" onClick={() => void copyAsShape()} disabled={!svg || busy}>
            {busy ? "変換中…" : "Flash用にコピー"}
          </button>
          <button onClick={reset} disabled={!svg || busy}>リセット</button>
        </div>
      </header>

      <section className="previewArea">
        {svg ? (
          <Preview svgText={svg.svgText} />
        ) : (
          <button className="empty" onClick={() => void openSvg()}>
            <span>SVGファイルをここへドロップ</span>
            <small>またはクリックして選択</small>
          </button>
        )}
        {dragging && <div className="dropOverlay">ここにSVGをドロップ</div>}
      </section>

      <footer className="footer">
        <div className="status">{status}</div>
        <button className="inkscape" onClick={() => void pickInkscape()} title={inkscapePath || "未設定"}>
          Inkscape: {inkscapePath ? "設定済み" : "選択"}
        </button>
      </footer>
    </main>
  );
}
