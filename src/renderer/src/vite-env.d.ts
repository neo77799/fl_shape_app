/// <reference types="vite/client" />

type Flash8PictureStyles =
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
        | {
            ok: true;
            settings: {
              inkscapePath?: string;
              flToSvgPrefer?: "emf" | "wmf";
              flash8ExePath?: string;
              ffdecJarPath?: string;
            };
          }
        | { ok: false; reason: "error"; message: string }
      >;
      updateSettings: (settings: {
        inkscapePath?: string;
        flToSvgPrefer?: "emf" | "wmf";
        flash8ExePath?: string;
        ffdecJarPath?: string;
      }) => Promise<
        | {
            ok: true;
            settings: {
              inkscapePath?: string;
              flToSvgPrefer?: "emf" | "wmf";
              flash8ExePath?: string;
              ffdecJarPath?: string;
            };
          }
        | { ok: false; reason: "error"; message: string }
      >;
      pickInkscape: () => Promise<
        | { ok: true; path: string }
        | { ok: false; reason: "canceled" | "error"; message?: string }
      >;
      getClipboardFormats: () => Promise<
        | { ok: true; formats: Array<{ id: number; name: string }> }
        | { ok: false; reason: "error"; message: string }
      >;
      flShapeToSvg: () => Promise<
        | { ok: true; svgText: string }
        | { ok: false; reason: "inkscape_not_found" | "error"; message: string }
      >;
      flShapeInspect: () => Promise<
        | {
            ok: true;
            items: Array<{
              kind: "emf" | "wmf";
              svgText: string;
              pngDataUrl: string;
            }>;
            clipboardImagePngDataUrl: string | null;
          }
        | { ok: false; reason: "inkscape_not_found" | "error"; message: string }
      >;
      dumpFlash8Picture: () => Promise<
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
        | { ok: false; reason: "error"; message: string }
      >;
      sampleFlash8Picture: (n?: number) => Promise<
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
        | { ok: false; reason: "error"; message: string }
      >;
      dumpClipboardBundle: () => Promise<
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
        | { ok: false; reason: "error"; message: string }
      >;
      trueVectorToSvg: () => Promise<
        | { ok: true; swfPath: string; svgDir: string | null }
        | { ok: false; reason: "flash8_not_found" | "ffdec_not_found" | "error"; message: string }
      >;
      pickFlash8Exe: () => Promise<
        | { ok: true; path: string }
        | { ok: false; reason: "canceled" | "error"; message?: string }
      >;
      pickFfdecJar: () => Promise<
        | { ok: true; path: string }
        | { ok: false; reason: "canceled" | "error"; message?: string }
      >;
      clipboardWriteText: (text: string) => Promise<
        | { ok: true }
        | { ok: false; reason: "error"; message: string }
      >;
      saveSvg: (svgText: string) => Promise<
        | { ok: true; path: string }
        | { ok: false; reason: "no_svg" | "canceled" | "error"; message?: string }
      >;
    };
  }
}

export {};
