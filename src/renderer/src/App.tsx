import { useEffect, useRef, useState } from "react";
import Preview from "./Preview";

type LoadState = { kind: "empty" } | { kind: "loaded"; path: string; svgText: string };
type SettingsState = { inkscapePath?: string };

export default function App() {
  const [state, setState] = useState<LoadState>({ kind: "empty" });
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [dragActive, setDragActive] = useState(false);
  const dragCount = useRef(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<SettingsState>({});

  // Prevent Electron's default "drop a file to navigate" behavior.
  useEffect(() => {
    const prevent = (e: DragEvent) => e.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  useEffect(() => {
    const api = window.app;
    if (!api?.getSettings) return;
    api.getSettings().then((res) => {
      if (res.ok) setSettings(res.settings);
    });
  }, []);

  async function onOpen() {
    setStatus("");
    const api = window.app;
    if (!api) return setStatus("preload API not available");

    const res = await api.openSvg();
    if (!res.ok) {
      if (res.reason === "canceled") return;
      return setStatus(res.message ?? "open failed");
    }
    setState({ kind: "loaded", path: res.path, svgText: res.svgText });
  }

  async function onCopyAsShape() {
    setStatus("");
    const api = window.app;
    if (!api) return setStatus("preload API not available");
    if (state.kind !== "loaded") return setStatus("SVG を読み込んでください。");

    setBusy(true);
    try {
      const res = await api.copyAsShape(state.svgText);
      if (!res.ok) return setStatus(res.message);
      setStatus("クリップボードにシェイプ(EMF)としてコピーしました。Flash Pro 8 で Ctrl+V してください。");
    } finally {
      setBusy(false);
    }
  }

  async function onPickInkscape() {
    setStatus("");
    const api = window.app;
    if (!api?.pickInkscape) return setStatus("preload API not available");
    const res = await api.pickInkscape();
    if (!res.ok) {
      if (res.reason === "canceled") return;
      return setStatus(res.message ?? "pick inkscape failed");
    }
    setSettings((cur) => ({ ...cur, inkscapePath: res.path }));
  }

  function onReset() {
    setStatus("");
    setState({ kind: "empty" });
  }

  function onDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCount.current += 1;
    setDragActive(true);
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    if (!dragActive) setDragActive(true);
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCount.current = Math.max(0, dragCount.current - 1);
    if (dragCount.current === 0) setDragActive(false);
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    dragCount.current = 0;
    setDragActive(false);

    const api = window.app;
    if (!api) return setStatus("preload API not available");

    const file = e.dataTransfer.files?.[0] as File | undefined;
    if (!file) return;
    const name = file.name ?? "";
    if (!name.toLowerCase().endsWith(".svg")) {
      return setStatus("SVG ファイル(.svg)のみ対応です。");
    }

    // Electron provides File.path on dropped files, but it may be missing in some environments.
    const p = (file as any).path as string | undefined;

    setStatus("");
    if (p) {
      const res = await api.loadSvgFromPath(p);
      if (res.ok) {
        setState({ kind: "loaded", path: res.path, svgText: res.svgText });
        return;
      }
      // Fall back to reading from the File object if IPC failed.
      setStatus(res.message ?? "load failed; fallback to File.text()");
    }

    const svgText = await file.text();
    setState({ kind: "loaded", path: p ?? name, svgText });
  }

  return (
    <main className="app">
      <header className="toolbar">
        <div className="toolbarLeft">
          <button onClick={onOpen} disabled={busy}>
            Load SVG
          </button>
          <button onClick={onCopyAsShape} disabled={busy || state.kind !== "loaded"}>
            Copy As Shape
          </button>
          <button onClick={onReset} disabled={busy || state.kind === "empty"}>
            Reset
          </button>
          <button onClick={() => setSettingsOpen(true)} disabled={busy}>
            Settings
          </button>
        </div>
        <div className="toolbarRight">
          <div className="hint">{state.kind === "loaded" ? state.path : "No file loaded"}</div>
        </div>
      </header>

      <section
        className="preview"
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {state.kind === "loaded" ? <Preview svgText={state.svgText} /> : <div className="empty">Load an SVG to preview</div>}
        {dragActive ? (
          <div className="dropOverlay" aria-hidden="true">
            <div className="dropCard">Drop SVG to load</div>
          </div>
        ) : null}
      </section>

      {status ? <footer className="status">{status}</footer> : null}

      {settingsOpen ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Settings" onMouseDown={() => setSettingsOpen(false)}>
          <div className="modalCard" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalTitle">Settings</div>
            <div className="modalRow">
              <div className="modalLabel">Inkscape</div>
              <div className="modalValue">
                <div className="pathPill">{settings.inkscapePath ?? "(not set)"}</div>
                <div className="modalButtons">
                  <button onClick={onPickInkscape} disabled={busy}>
                    Select inkscape.exe
                  </button>
                  <button onClick={() => setSettingsOpen(false)}>Close</button>
                </div>
              </div>
            </div>
            <div className="modalNote">
              Copy As Shape は Inkscape で SVG→EMF 変換してからクリップボードへコピーします。
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
