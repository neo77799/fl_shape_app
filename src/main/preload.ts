import { contextBridge, ipcRenderer } from "electron";

export type OpenSvgResult =
  | { ok: true; path: string; svgText: string }
  | { ok: false; reason: "canceled" | "error"; message?: string };

export type CopyAsShapeResult =
  | { ok: true }
  | { ok: false; reason: "no_svg" | "inkscape_not_found" | "convert_failed" | "clipboard_failed" | "error"; message: string };

export type SettingsResult =
  | {
      ok: true;
      settings: {
        inkscapePath?: string;
        flToSvgPrefer?: "emf" | "wmf";
        flash8ExePath?: string;
        ffdecJarPath?: string;
      };
    }
  | { ok: false; reason: "error"; message: string };

export type UpdateSettingsResult =
  | {
      ok: true;
      settings: {
        inkscapePath?: string;
        flToSvgPrefer?: "emf" | "wmf";
        flash8ExePath?: string;
        ffdecJarPath?: string;
      };
    }
  | { ok: false; reason: "error"; message: string };

export type PickInkscapeResult =
  | { ok: true; path: string }
  | { ok: false; reason: "canceled" | "error"; message?: string };

export type ClipboardFormatsResult =
  | { ok: true; formats: Array<{ id: number; name: string }> }
  | { ok: false; reason: "error"; message: string };

export type FlShapeToSvgResult =
  | { ok: true; svgText: string }
  | { ok: false; reason: "inkscape_not_found" | "error"; message: string };

export type FlShapeInspectResult =
  | {
      ok: true;
      items: Array<{
        kind: "emf" | "wmf";
        svgText: string;
        pngDataUrl: string;
      }>;
      clipboardImagePngDataUrl: string | null;
    }
  | { ok: false; reason: "inkscape_not_found" | "error"; message: string };

export type ClipboardWriteTextResult =
  | { ok: true }
  | { ok: false; reason: "error"; message: string };

export type SaveSvgResult =
  | { ok: true; path: string }
  | { ok: false; reason: "no_svg" | "canceled" | "error"; message?: string };

export type Flash8PictureStyles =
  | {
      ok: true;
      styleOffset: number;
      fillCount: number;
      fills: Array<{ type: number; rgba: { r: number; g: number; b: number; a: number }; hex: string }>;
      lineCount: number;
      lines: Array<{ widthTwips: number; rgba: { r: number; g: number; b: number; a: number }; hex: string }>;
      bytesConsumed: number;
      warnings: string[];
    }
  | { ok: false; styleOffset: number; message: string };

export type DumpFlash8PictureResult =
  | {
      ok: true;
      dumped: { path: string; size: number; id: number; name: string; headHex: string };
      swfInfo: null | {
        sig: string;
        sigOffset: number;
        swfPath?: string;
        headHex?: string;
        totalTags?: number;
         tagCounts?: Record<string, number>;
         note?: string;
       };
      flash8Styles: Flash8PictureStyles;
    }
  | { ok: false; reason: "error"; message: string };

export type TrueVectorToSvgResult =
  | { ok: true; swfPath: string; svgDir: string | null }
  | { ok: false; reason: "flash8_not_found" | "ffdec_not_found" | "error"; message: string };

export type PickPathResult =
  | { ok: true; path: string }
  | { ok: false; reason: "canceled" | "error"; message?: string };

export type DumpClipboardBundleResult =
  | {
      ok: true;
      outDir: string;
      items: Array<{
        name: string;
        ok: boolean;
        path?: string;
        size?: number;
        id?: number;
        headHex?: string;
        signatures?: Array<{ kind: string; offset: number }>;
        flash8Styles?: Flash8PictureStyles | null;
        message?: string;
      }>;
    }
  | { ok: false; reason: "error"; message: string };

export type SampleFlash8PictureResult =
  | {
      ok: true;
      outDir: string;
      n: number;
      len: number;
      stableCount: number;
      stablePct: number;
      stablePath: string;
      maskPath: string;
      summaryPath: string;
      topRuns: Array<{ start: number; end: number; len: number }>;
    }
  | { ok: false; reason: "error"; message: string };

contextBridge.exposeInMainWorld("app", {
  openSvg: (): Promise<OpenSvgResult> => ipcRenderer.invoke("app:open-svg"),
  loadSvgFromPath: (path: string): Promise<OpenSvgResult> =>
    ipcRenderer.invoke("app:load-svg-from-path", { path }),
  getSettings: (): Promise<SettingsResult> => ipcRenderer.invoke("app:get-settings"),
  updateSettings: (settings: { inkscapePath?: string; flToSvgPrefer?: "emf" | "wmf" }): Promise<UpdateSettingsResult> =>
    ipcRenderer.invoke("app:update-settings", { settings }),
  pickInkscape: (): Promise<PickInkscapeResult> => ipcRenderer.invoke("app:pick-inkscape"),
  copyAsShape: (svgText: string): Promise<CopyAsShapeResult> =>
    ipcRenderer.invoke("app:copy-as-shape", { svgText }),
  getClipboardFormats: (): Promise<ClipboardFormatsResult> => ipcRenderer.invoke("app:get-clipboard-formats"),
  flShapeToSvg: (): Promise<FlShapeToSvgResult> => ipcRenderer.invoke("app:fl-shape-to-svg"),
  flShapeInspect: (): Promise<FlShapeInspectResult> => ipcRenderer.invoke("app:fl-shape-inspect"),
  dumpFlash8Picture: (): Promise<DumpFlash8PictureResult> => ipcRenderer.invoke("app:dump-flash8-picture"),
  dumpClipboardBundle: (): Promise<DumpClipboardBundleResult> => ipcRenderer.invoke("app:dump-clipboard-bundle"),
  sampleFlash8Picture: (n = 10): Promise<SampleFlash8PictureResult> => ipcRenderer.invoke("app:sample-flash8-picture", { n }),
  trueVectorToSvg: (): Promise<TrueVectorToSvgResult> => ipcRenderer.invoke("app:true-vector-to-svg"),
  pickFlash8Exe: (): Promise<PickPathResult> => ipcRenderer.invoke("app:pick-flash8-exe"),
  pickFfdecJar: (): Promise<PickPathResult> => ipcRenderer.invoke("app:pick-ffdec-jar"),
  clipboardWriteText: (text: string): Promise<ClipboardWriteTextResult> =>
    ipcRenderer.invoke("app:clipboard-write-text", { text }),
  saveSvg: (svgText: string): Promise<SaveSvgResult> => ipcRenderer.invoke("app:save-svg", { svgText })
});
