/// <reference types="vite/client" />

type SvgResult =
  | { ok: true; path: string; svgText: string }
  | { ok: false; reason: "canceled" | "error"; message?: string };

type PickResult =
  | { ok: true; path: string }
  | { ok: false; reason: "canceled" | "error"; message?: string };

type CopyResult =
  | { ok: true }
  | { ok: false; reason: "no_svg" | "inkscape_not_found" | "error"; message: string };

interface Window {
  app?: {
    openSvg(): Promise<SvgResult>;
    loadSvgFromPath(path: string): Promise<SvgResult>;
    getSettings(): Promise<{ ok: true; settings: { inkscapePath?: string } }>;
    pickInkscape(): Promise<PickResult>;
    copyAsShape(svgText: string): Promise<CopyResult>;
  };
}
