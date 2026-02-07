import { useEffect, useRef, useState } from "react";
import Preview from "./Preview";

type Mode = "home" | "svgToFl" | "flToSvg";

type SvgLoadState = { kind: "empty" } | { kind: "loaded"; path: string; svgText: string };
type FlToSvgState =
  | { kind: "empty" }
  | {
      kind: "loaded";
      items: Array<{ kind: "emf" | "wmf"; svgText: string; pngDataUrl: string }>;
      selected: "emf" | "wmf";
      clipboardImagePngDataUrl: string | null;
      view: "svg" | "metafile_png" | "clipboard_png";
    };

type SettingsState = {
  inkscapePath?: string;
  flToSvgPrefer?: "emf" | "wmf";
  flash8ExePath?: string;
  ffdecJarPath?: string;
};

export default function App() {
  const [mode, setMode] = useState<Mode>("home");

  const [svgState, setSvgState] = useState<SvgLoadState>({ kind: "empty" });
  const [flState, setFlState] = useState<FlToSvgState>({ kind: "empty" });

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string>("");

  const [dragActive, setDragActive] = useState(false);
  const dragCount = useRef(0);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<SettingsState>({});

  const [clipOpen, setClipOpen] = useState(false);
  const [clipBusy, setClipBusy] = useState(false);
  const [clipError, setClipError] = useState<string>("");
  const [clipFormats, setClipFormats] = useState<Array<{ id: number; name: string }>>([]);
  const [bundleOpen, setBundleOpen] = useState(false);
  const [bundleBusy, setBundleBusy] = useState(false);
  const [bundleError, setBundleError] = useState<string>("");
  const [bundleOutDir, setBundleOutDir] = useState<string>("");
  const [bundleItems, setBundleItems] = useState<
    Array<{
      name: string;
      ok: boolean;
      path?: string;
      size?: number;
      id?: number;
      headHex?: string;
      signatures?: Array<{ kind: string; offset: number }>;
      flash8Styles?: Flash8PictureStyles | null;
      message?: string;
    }>
  >([]);

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

  function goHome() {
    setStatus("");
    setMode("home");
  }

  async function onOpenSvg() {
    setStatus("");
    const api = window.app;
    if (!api) return setStatus("preload API not available");

    const res = await api.openSvg();
    if (!res.ok) {
      if (res.reason === "canceled") return;
      return setStatus(res.message ?? "open failed");
    }
    setSvgState({ kind: "loaded", path: res.path, svgText: res.svgText });
  }

  async function onCopyAsShape() {
    setStatus("");
    const api = window.app;
    if (!api) return setStatus("preload API not available");
    if (svgState.kind !== "loaded") return setStatus("SVG を読み込んでください。");

    setBusy(true);
    try {
      const res = await api.copyAsShape(svgState.svgText);
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

  async function onSetPrefer(kind: "emf" | "wmf") {
    setStatus("");
    const api = window.app;
    if (!api?.updateSettings) return setStatus("preload API not available");
    const res = await api.updateSettings({ flToSvgPrefer: kind });
    if (!res.ok) return setStatus(res.message);
    setSettings(res.settings);
  }

  async function onPickFlash8Exe() {
    setStatus("");
    const api = window.app;
    if (!api?.pickFlash8Exe) return setStatus("preload API not available");
    const res = await api.pickFlash8Exe();
    if (!res.ok) {
      if (res.reason === "canceled") return;
      return setStatus(res.message ?? "pick flash exe failed");
    }
    setSettings((cur) => ({ ...cur, flash8ExePath: res.path }));
  }

  async function onPickFfdecJar() {
    setStatus("");
    const api = window.app;
    if (!api?.pickFfdecJar) return setStatus("preload API not available");
    const res = await api.pickFfdecJar();
    if (!res.ok) {
      if (res.reason === "canceled") return;
      return setStatus(res.message ?? "pick ffdec jar failed");
    }
    setSettings((cur) => ({ ...cur, ffdecJarPath: res.path }));
  }

  async function onTrueVectorToSvg() {
    setStatus("");
    const api = window.app;
    if (!api?.trueVectorToSvg) return setStatus("preload API not available");
    setBusy(true);
    try {
      const res = await api.trueVectorToSvg();
      if (!res.ok) return setStatus(res.message);
      if (res.svgDir) {
        setStatus(`SWFを生成してSVGを書き出しました: ${res.svgDir}`);
      } else {
        setStatus(`SWFを生成しました（FFDec未設定）: ${res.swfPath}`);
      }
    } finally {
      setBusy(false);
    }
  }

  function onResetSvgTool() {
    setStatus("");
    setSvgState({ kind: "empty" });
  }

  function onResetFlTool() {
    setStatus("");
    setFlState({ kind: "empty" });
  }

  async function onPasteFlShapeToSvg() {
    setStatus("");
    const api = window.app;
    if (!api?.flShapeInspect) return setStatus("preload API not available");

    setBusy(true);
    try {
      const res = await api.flShapeInspect();
      if (!res.ok) return setStatus(res.message);
      const items = res.items;
      const prefer = settings.flToSvgPrefer ?? "emf";
      const kinds = new Set(items.map((x) => x.kind));
      const selected = (kinds.has(prefer) ? prefer : items[0].kind) as "emf" | "wmf";
      setFlState({
        kind: "loaded",
        items,
        selected,
        clipboardImagePngDataUrl: res.clipboardImagePngDataUrl,
        view: "svg"
      });
      setStatus("クリップボードのメタファイル(EMF/WMF)から SVG/PNG を生成しました。");
    } finally {
      setBusy(false);
    }
  }

  async function onCopySvgText() {
    setStatus("");
    const api = window.app;
    if (!api?.clipboardWriteText) return setStatus("preload API not available");
    if (flState.kind !== "loaded") return setStatus("SVG がありません。");

    setBusy(true);
    try {
      const cur = flState.items.find((x) => x.kind === flState.selected) ?? flState.items[0];
      const res = await api.clipboardWriteText(cur.svgText);
      if (!res.ok) return setStatus(res.message);
      setStatus("SVG テキストをクリップボードへコピーしました。");
    } finally {
      setBusy(false);
    }
  }

  async function onSaveSvg() {
    setStatus("");
    const api = window.app;
    if (!api?.saveSvg) return setStatus("preload API not available");
    if (flState.kind !== "loaded") return setStatus("SVG がありません。");

    setBusy(true);
    try {
      const cur = flState.items.find((x) => x.kind === flState.selected) ?? flState.items[0];
      const res = await api.saveSvg(cur.svgText);
      if (!res.ok) {
        if (res.reason === "canceled") return;
        return setStatus(res.message ?? "save failed");
      }
      setStatus(`保存しました: ${res.path}`);
    } finally {
      setBusy(false);
    }
  }

  async function onShowClipboardFormats() {
    setClipError("");
    setClipFormats([]);
    setClipOpen(true);

    const api = window.app;
    if (!api?.getClipboardFormats) {
      setClipError("preload API not available");
      return;
    }

    setClipBusy(true);
    try {
      const res = await api.getClipboardFormats();
      if (!res.ok) {
        setClipError(res.message);
        return;
      }
      setClipFormats(res.formats);
    } finally {
      setClipBusy(false);
    }
  }

  async function onDumpFlash8Picture() {
    setStatus("");
    const api = window.app;
    if (!api?.dumpFlash8Picture) return setStatus("preload API not available");
    setBusy(true);
    try {
      const res = await api.dumpFlash8Picture();
      if (!res.ok) return setStatus(res.message);
      const dumped = res.dumped;
      const fills =
        res.flash8Styles?.ok && res.flash8Styles.fills.length
          ? ` / fills: ${res.flash8Styles.fills.map((f) => f.hex).join(" ")}`
          : "";
      if (res.swfInfo?.swfPath) {
        setStatus(`Flash 8 Picture をダンプしました: ${dumped.path} / SWF抽出: ${res.swfInfo.swfPath}`);
      } else {
        setStatus(`Flash 8 Picture をダンプしました: ${dumped.path}`);
      }
      // Overwrite legacy status text with an ASCII-only message.
      const msg = res.swfInfo?.swfPath
        ? "Dumped Flash 8 Picture: " + dumped.path + " / Extracted SWF: " + res.swfInfo.swfPath
        : "Dumped Flash 8 Picture: " + dumped.path;
      setStatus(msg + fills);
    } finally {
      setBusy(false);
    }
  }

  async function onDumpClipboardBundle() {
    setStatus("");
    setBundleError("");
    setBundleOutDir("");
    setBundleItems([]);
    setBundleOpen(true);

    const api = window.app;
    if (!api?.dumpClipboardBundle) {
      setBundleError("preload API not available");
      return;
    }

    setBundleBusy(true);
    try {
      const res = await api.dumpClipboardBundle();
      if (!res.ok) {
        setBundleError(res.message);
        return;
      }
      setBundleOutDir(res.outDir);
      setBundleItems(res.items);

      const swfLike = res.items
        .filter((x) => x.ok && (x.signatures ?? []).some((s) => s.kind.startsWith("SWF:")))
        .map((x) => x.name);
      if (swfLike.length) {
        setStatus(`バンドルダンプ完了（SWF候補あり）: ${swfLike.join(", ")}`);
      } else {
        setStatus("バンドルダンプ完了（SWF候補なし）");
      }
      // ASCII status summary (bundle)
      setStatus(swfLike.length ? ("Bundle dumped. SWF-like signatures: " + swfLike.join(", ")) : "Bundle dumped. No SWF signatures found.");
    } finally {
      setBundleBusy(false);
    }
  }

  async function onSampleFlash8Picture() {
    setStatus("");
    const api = window.app;
    if (!api?.sampleFlash8Picture) return setStatus("preload API not available");
    setBusy(true);
    try {
      const res = await api.sampleFlash8Picture(10);
      if (!res.ok) return setStatus(res.message);
      const pct = (res.stablePct * 100).toFixed(2);
      setStatus(`Sampled Flash 8 Picture x${res.n}. Stable: ${res.stableCount}/${res.len} (${pct}%). Output: ${res.outDir}`);
    } finally {
      setBusy(false);
    }
  }

  function onDragEnter(e: React.DragEvent) {
    if (mode !== "svgToFl") return;
    e.preventDefault();
    e.stopPropagation();
    dragCount.current += 1;
    setDragActive(true);
  }

  function onDragOver(e: React.DragEvent) {
    if (mode !== "svgToFl") return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "copy";
    if (!dragActive) setDragActive(true);
  }

  function onDragLeave(e: React.DragEvent) {
    if (mode !== "svgToFl") return;
    e.preventDefault();
    e.stopPropagation();
    dragCount.current = Math.max(0, dragCount.current - 1);
    if (dragCount.current === 0) setDragActive(false);
  }

  async function onDrop(e: React.DragEvent) {
    if (mode !== "svgToFl") return;
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
        setSvgState({ kind: "loaded", path: res.path, svgText: res.svgText });
        return;
      }
      // Fall back to reading from the File object if IPC failed.
      setStatus(res.message ?? "load failed; fallback to File.text()");
    }

    const svgText = await file.text();
    setSvgState({ kind: "loaded", path: p ?? name, svgText });
  }

  const hint =
    mode === "svgToFl" ? (svgState.kind === "loaded" ? svgState.path : "No file loaded") : mode === "flToSvg" ? "Clipboard → SVG" : "";

  return (
    <main className="app">
      {mode === "home" ? (
        <header className="toolbar">
          <div className="toolbarLeft">
            <div className="appTitle">fl_shape_app</div>
          </div>
          <div className="toolbarRight" />
        </header>
      ) : (
        <header className="toolbar">
          <div className="toolbarLeft">
            <button onClick={goHome} disabled={busy}>
              Home
            </button>
            {mode === "svgToFl" ? (
              <>
                <button onClick={onOpenSvg} disabled={busy}>
                  Load SVG
                </button>
                <button onClick={onCopyAsShape} disabled={busy || svgState.kind !== "loaded"}>
                  Copy As Shape
                </button>
                <button onClick={onResetSvgTool} disabled={busy || svgState.kind === "empty"}>
                  Reset
                </button>
              </>
            ) : null}
            {mode === "flToSvg" ? (
              <>
                <button onClick={onPasteFlShapeToSvg} disabled={busy}>
                  Paste FL Shape
                </button>
                <button onClick={onDumpFlash8Picture} disabled={busy}>
                  Dump Flash 8 Picture
                </button>
                <button onClick={onDumpClipboardBundle} disabled={busy}>
                  Dump Bundle
                </button>
                <button onClick={onSampleFlash8Picture} disabled={busy}>
                  Sample Flash 8 Picture x10
                </button>
                <button onClick={onTrueVectorToSvg} disabled={busy}>
                  True Vector To SVG
                </button>
                <button onClick={onCopySvgText} disabled={busy || flState.kind !== "loaded"}>
                  Copy SVG Text
                </button>
                <button onClick={onSaveSvg} disabled={busy || flState.kind !== "loaded"}>
                  Save SVG
                </button>
                <button onClick={onResetFlTool} disabled={busy || flState.kind === "empty"}>
                  Reset
                </button>
              </>
            ) : null}
            <button onClick={() => setSettingsOpen(true)} disabled={busy}>
              Settings
            </button>
          </div>
          <div className="toolbarRight">
            <div className="hint">{hint}</div>
          </div>
        </header>
      )}

      <section
        className={mode === "home" ? "home" : "preview"}
        onDragEnter={onDragEnter}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        {mode === "home" ? (
          <div className="homeWrap">
            <div className="homeTitle">HOME</div>
            <div className="homeGrid">
              <button className="homeCard" onClick={() => setMode("svgToFl")} disabled={busy}>
                <div className="homeCardTitle">SVG To FL Shape</div>
                <div className="homeCardNote">SVG → EMF → Clipboard（Flash Pro 8 に貼り付け）</div>
              </button>
              <button className="homeCard" onClick={() => setMode("flToSvg")} disabled={busy}>
                <div className="homeCardTitle">FL Shape To SVG</div>
                <div className="homeCardNote">Clipboard（EMF/WMF）→ SVG（Inkscape）</div>
              </button>
            </div>
          </div>
        ) : null}

        {mode === "svgToFl" ? (
          <>
            {svgState.kind === "loaded" ? <Preview svgText={svgState.svgText} /> : <div className="empty">Load an SVG to preview</div>}
            {dragActive ? (
              <div className="dropOverlay" aria-hidden="true">
                <div className="dropCard">Drop SVG to load</div>
              </div>
            ) : null}
          </>
        ) : null}

        {mode === "flToSvg" ? (
          <>
            {flState.kind === "loaded" ? (
              <div className="flToSvgWrap">
                <div className="flToSvgTop">
                  <div className="seg">
                    {flState.items.some((x) => x.kind === "emf") ? (
                      <button
                        className={`segBtn ${flState.selected === "emf" ? "isOn" : ""}`}
                        onClick={() => setFlState((cur) => (cur.kind === "loaded" ? { ...cur, selected: "emf" } : cur))}
                        disabled={busy}
                      >
                        EMF
                      </button>
                    ) : null}
                    {flState.items.some((x) => x.kind === "wmf") ? (
                      <button
                        className={`segBtn ${flState.selected === "wmf" ? "isOn" : ""}`}
                        onClick={() => setFlState((cur) => (cur.kind === "loaded" ? { ...cur, selected: "wmf" } : cur))}
                        disabled={busy}
                      >
                        WMF
                      </button>
                    ) : null}
                  </div>
                  <div className="seg">
                    <button
                      className={`segBtn ${flState.view === "svg" ? "isOn" : ""}`}
                      onClick={() => setFlState((cur) => (cur.kind === "loaded" ? { ...cur, view: "svg" } : cur))}
                      disabled={busy}
                    >
                      SVG
                    </button>
                    <button
                      className={`segBtn ${flState.view === "metafile_png" ? "isOn" : ""}`}
                      onClick={() => setFlState((cur) => (cur.kind === "loaded" ? { ...cur, view: "metafile_png" } : cur))}
                      disabled={busy}
                    >
                      Metafile PNG
                    </button>
                    <button
                      className={`segBtn ${flState.view === "clipboard_png" ? "isOn" : ""}`}
                      onClick={() => setFlState((cur) => (cur.kind === "loaded" ? { ...cur, view: "clipboard_png" } : cur))}
                      disabled={busy || !flState.clipboardImagePngDataUrl}
                      title={flState.clipboardImagePngDataUrl ? "" : "Clipboard image not available"}
                    >
                      Clipboard PNG
                    </button>
                  </div>
                </div>

                {(() => {
                  const cur = flState.items.find((x) => x.kind === flState.selected) ?? flState.items[0];
                  if (flState.view === "svg") {
                    return <Preview svgText={cur.svgText} />;
                  }
                  if (flState.view === "metafile_png") {
                    return (
                      <div className="pngWrap">
                        <div className="pngViewport">
                          <img className="pngImg" src={cur.pngDataUrl} alt="" draggable={false} />
                        </div>
                        <div className="pngHelp">Metafile(EMF/WMF) → PNG</div>
                      </div>
                    );
                  }
                  if (flState.view === "clipboard_png") {
                    return (
                      <div className="pngWrap">
                        <div className="pngViewport">
                          {flState.clipboardImagePngDataUrl ? (
                            <img className="pngImg" src={flState.clipboardImagePngDataUrl} alt="" draggable={false} />
                          ) : (
                            <div className="emptyMini">No clipboard image</div>
                          )}
                        </div>
                        <div className="pngHelp">Clipboard(DIB/Bitmap) → PNG</div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            ) : (
              <div className="empty">Copy a shape in Flash, then Paste FL Shape</div>
            )}
          </>
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
              SVG To FL Shape / FL Shape To SVG ともに Inkscape を使用します。
            </div>

            <div className="modalRow" style={{ marginTop: 14 }}>
              <div className="modalLabel">Flash 8</div>
              <div className="modalValue">
                <div className="pathPill">{settings.flash8ExePath ?? "(not set)"}</div>
                <div className="modalButtons">
                  <button onClick={onPickFlash8Exe} disabled={busy}>
                    Select Flash.exe
                  </button>
                </div>
                <div className="modalNote">
                  True Vector To SVG で使用します（Flashがクリップボードの Flash 8 Picture を解釈してSWFを書き出す）。
                </div>
              </div>
            </div>

            <div className="modalRow" style={{ marginTop: 14 }}>
              <div className="modalLabel">FFDec</div>
              <div className="modalValue">
                <div className="pathPill">{settings.ffdecJarPath ?? "(not set)"}</div>
                <div className="modalButtons">
                  <button onClick={onPickFfdecJar} disabled={busy}>
                    Select ffdec.jar
                  </button>
                </div>
                <div className="modalNote">未設定でもSWFまでは生成します。SVG化はFFDecが必要です。</div>
              </div>
            </div>

            <div className="modalRow" style={{ marginTop: 14 }}>
              <div className="modalLabel">FL→SVG</div>
              <div className="modalValue">
                <div className="seg">
                  <button
                    className={`segBtn ${((settings.flToSvgPrefer ?? "emf") === "emf") ? "isOn" : ""}`}
                    onClick={() => onSetPrefer("emf")}
                    disabled={busy}
                  >
                    Prefer EMF
                  </button>
                  <button
                    className={`segBtn ${((settings.flToSvgPrefer ?? "emf") === "wmf") ? "isOn" : ""}`}
                    onClick={() => onSetPrefer("wmf")}
                    disabled={busy}
                  >
                    Prefer WMF
                  </button>
                </div>
                <div className="modalNote">色が落ちる場合、WMF の方が保持できることがあります。</div>
              </div>
            </div>

            <div className="modalRow" style={{ marginTop: 14 }}>
              <div className="modalLabel">Debug</div>
              <div className="modalValue">
                <div className="modalButtons">
                  <button onClick={onShowClipboardFormats} disabled={busy}>
                    Clipboard Formats
                  </button>
                </div>
                <div className="modalNote">Flash のコピー内容が EMF/WMF で出ているか確認できます。</div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {clipOpen ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Clipboard Formats" onMouseDown={() => setClipOpen(false)}>
          <div className="modalCard" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalTitle">Clipboard Formats</div>
            {clipBusy ? <div className="modalNote">Loading...</div> : null}
            {clipError ? <div className="modalNote">Error: {clipError}</div> : null}
            {!clipBusy && !clipError ? (
              <div className="clipList">
                {clipFormats.length ? (
                  <table className="clipTable">
                    <thead>
                      <tr>
                        <th>ID</th>
                        <th>Name</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clipFormats.map((f) => (
                        <tr key={`${f.id}:${f.name}`}>
                          <td className="clipId">{f.id}</td>
                          <td className="clipName">{f.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="modalNote">(no formats)</div>
                )}
              </div>
            ) : null}

            <div className="modalButtons" style={{ marginTop: 12 }}>
              <button onClick={() => setClipOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}

      {bundleOpen ? (
        <div className="modalOverlay" role="dialog" aria-modal="true" aria-label="Dump Bundle" onMouseDown={() => setBundleOpen(false)}>
          <div className="modalCard" onMouseDown={(e) => e.stopPropagation()}>
            <div className="modalTitle">Dump Bundle</div>
            {bundleBusy ? <div className="modalNote">Dumping...</div> : null}
            {bundleError ? <div className="modalNote">Error: {bundleError}</div> : null}
            {!bundleBusy && !bundleError ? (
              <>
                <div className="modalNote">Output: {bundleOutDir || "(n/a)"}</div>
                <div className="clipList">
                  {bundleItems.length ? (
                    <table className="clipTable">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th>OK</th>
                          <th>Bytes</th>
                          <th>Signatures</th>
                          <th>Details</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bundleItems.map((it) => (
                          <tr key={it.name}>
                            <td className="clipName">{it.name}</td>
                            <td className="clipId">{it.ok ? "yes" : "no"}</td>
                            <td className="clipId">{typeof it.size === "number" ? String(it.size) : "-"}</td>
                            <td className="clipName">
                              {it.ok
                                ? (it.signatures ?? [])
                                    .slice(0, 6)
                                    .map((s) => `${s.kind}@${s.offset}`)
                                    .join(" ")
                                : it.message ?? ""}
                            </td>
                            <td className="clipName">
                              {it.ok && it.flash8Styles ? (
                                it.flash8Styles.ok ? (
                                  (() => {
                                    const parts: string[] = [];
                                    if (it.flash8Styles.fills.length) {
                                      parts.push(
                                        `fills(${it.flash8Styles.fillCount}): ${it.flash8Styles.fills.map((f) => f.hex).join(" ")}`
                                      );
                                    } else {
                                      parts.push(`fills(${it.flash8Styles.fillCount})`);
                                    }
                                    if (it.flash8Styles.lines.length) {
                                      const lines = it.flash8Styles.lines
                                        .slice(0, 4)
                                        .map((l) => `${l.hex} w=${(l.widthTwips / 20).toFixed(2)}px`)
                                        .join(" ");
                                      parts.push(`lines(${it.flash8Styles.lineCount}): ${lines}`);
                                    } else {
                                      parts.push(`lines(${it.flash8Styles.lineCount})`);
                                    }
                                    return parts.join(" / ");
                                  })()
                                ) : (
                                  `flash8Styles: ${it.flash8Styles.message}`
                                )
                              ) : (
                                ""
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <div className="modalNote">(no items)</div>
                  )}
                </div>
              </>
            ) : null}

            <div className="modalButtons" style={{ marginTop: 12 }}>
              <button onClick={() => setBundleOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
