import { contextBridge, ipcRenderer } from "electron";

export type OpenSvgResult =
  | { ok: true; path: string; svgText: string }
  | { ok: false; reason: "canceled" | "error"; message?: string };

export type CopyAsShapeResult =
  | { ok: true }
  | { ok: false; reason: "no_svg" | "inkscape_not_found" | "convert_failed" | "clipboard_failed" | "error"; message: string };

export type SettingsResult =
  | { ok: true; settings: { inkscapePath?: string } }
  | { ok: false; reason: "error"; message: string };

export type PickInkscapeResult =
  | { ok: true; path: string }
  | { ok: false; reason: "canceled" | "error"; message?: string };

contextBridge.exposeInMainWorld("app", {
  openSvg: (): Promise<OpenSvgResult> => ipcRenderer.invoke("app:open-svg"),
  loadSvgFromPath: (path: string): Promise<OpenSvgResult> =>
    ipcRenderer.invoke("app:load-svg-from-path", { path }),
  getSettings: (): Promise<SettingsResult> => ipcRenderer.invoke("app:get-settings"),
  pickInkscape: (): Promise<PickInkscapeResult> => ipcRenderer.invoke("app:pick-inkscape"),
  copyAsShape: (svgText: string): Promise<CopyAsShapeResult> =>
    ipcRenderer.invoke("app:copy-as-shape", { svgText })
});
