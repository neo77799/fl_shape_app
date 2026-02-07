/// <reference types="vite/client" />

declare global {
  interface Window {
    app?: {
      openSvg: () => Promise<
        | { ok: true; path: string; svgText: string }
        | { ok: false; reason: "canceled" | "error"; message?: string }
      >;
      loadSvgFromPath: (path: string) => Promise<
        | { ok: true; path: string; svgText: string }
        | { ok: false; reason: "canceled" | "error"; message?: string }
      >;
      copyAsShape: (
        svgText: string
      ) => Promise<
        | { ok: true }
        | {
            ok: false;
            reason:
              | "no_svg"
              | "inkscape_not_found"
              | "convert_failed"
              | "clipboard_failed"
              | "error";
            message: string;
          }
      >;
      getSettings: () => Promise<
        | { ok: true; settings: { inkscapePath?: string } }
        | { ok: false; reason: "error"; message: string }
      >;
      pickInkscape: () => Promise<
        | { ok: true; path: string }
        | { ok: false; reason: "canceled" | "error"; message?: string }
      >;
    };
  }
}

export {};
