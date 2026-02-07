import { app, BrowserWindow, Menu, dialog, ipcMain, session } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { readSettings, writeSettings, type AppSettings } from "./settings";

const devServerUrl = process.env.VITE_DEV_SERVER_URL;
let settings: AppSettings = {};

async function tryFindInkscape(): Promise<string | null> {
  const candidates: string[] = [];

  if (settings.inkscapePath) candidates.push(settings.inkscapePath);
  if (process.env.INKSCAPE_PATH) candidates.push(process.env.INKSCAPE_PATH);

  // Typical installs.
  candidates.push("C:\\Program Files\\Inkscape\\bin\\inkscape.com");
  candidates.push("C:\\Program Files\\Inkscape\\bin\\inkscape.exe");
  candidates.push("C:\\Program Files\\Inkscape\\inkscape.com");
  candidates.push("C:\\Program Files\\Inkscape\\inkscape.exe");

  for (const c of candidates) {
    try {
      const st = await fs.stat(c);
      if (st.isFile()) return c;
    } catch {
      // ignore
    }
  }

  // Use `where inkscape` last.
  try {
    const found = await new Promise<string>((resolve, reject) => {
      const child = spawn("where.exe", ["inkscape"], { windowsHide: true });
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => (out += String(d)));
      child.stderr.on("data", (d) => (err += String(d)));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) return resolve(out.trim());
        reject(new Error(err || `where.exe exit ${code}`));
      });
    });
    const first = found.split(/\r?\n/).map((s) => s.trim()).find(Boolean);
    return first ?? null;
  } catch {
    return null;
  }
}

async function run(cmd: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve();
      reject(new Error(stderr || `${cmd} exited with ${code}`));
    });
  });
}

async function svgToEmf(svgText: string): Promise<string> {
  const inkscape = await tryFindInkscape();
  if (!inkscape) {
    const msg =
      "Inkscape が見つかりません。設定から inkscape.exe / inkscape.com を選択してください。";
    throw Object.assign(new Error(msg), { code: "INKSCAPE_NOT_FOUND" });
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fl-shape-app-"));
  const inSvg = path.join(tmpDir, "input.svg");
  const outEmf = path.join(tmpDir, "output.emf");

  await fs.writeFile(inSvg, svgText, "utf8");

  // Inkscape CLI: https://inkscape.org/doc/inkscape-man.html
  // Export to EMF; `--export-area-drawing` tightly fits the drawing.
  await run(inkscape, [
    "--export-area-drawing",
    "--export-type=emf",
    `--export-filename=${outEmf}`,
    inSvg
  ]);

  // Verify output exists.
  await fs.stat(outEmf);
  return outEmf;
}

async function optimizeSvg(svgText: string): Promise<string> {
  // svgo is ESM; load lazily from the CJS-bundled Electron main.
  const mod = (await import("svgo")) as unknown as { optimize: (s: string, o?: any) => { data: string } };
  const res = mod.optimize(svgText, {
    multipass: true,
    plugins: ["preset-default", { name: "removeViewBox", active: false }]
  });
  return typeof res?.data === "string" ? res.data : svgText;
}

async function setClipboardEmf(emfPath: string): Promise<void> {
  const ps1 = path.join(app.getAppPath(), "scripts", "set-clipboard-emf.ps1");
  await run("powershell.exe", [
    "-NoProfile",
    "-STA",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    ps1,
    "-EmfPath",
    emfPath
  ]);
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    resizable: false,
    maximizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, "preload.js")
    }
  });

  win.setMenuBarVisibility(false);

  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(path.join(app.getAppPath(), "dist/renderer/index.html"));
  }

  // DevTools can emit noisy console errors (e.g., Autofill.* protocol messages) on some Electron builds.
  // Open it only when explicitly requested.
  if (!app.isPackaged && process.env.OPEN_DEVTOOLS === "1") {
    win.webContents.openDevTools({ mode: "detach" });
  }
}

app.whenReady().then(async () => {
  settings = await readSettings(app.getPath("userData"));

  // Hide app menu (File/Edit/View/...) on Windows/Linux.
  Menu.setApplicationMenu(null);

  // CSP: dev allows eval for Vite/HMR; prod is stricter (no unsafe-eval).
  // Even though this is a "standalone" app, dev mode uses a local Vite server.
  const cspDev =
    "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: http: https:; font-src 'self';";
  const cspProd =
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self';";
  const csp = devServerUrl ? cspDev : cspProd;

  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers = details.responseHeaders ?? {};
    // Normalize keys across platforms (Electron uses lower/upper arbitrarily).
    headers["Content-Security-Policy"] = [csp];
    callback({ responseHeaders: headers });
  });

  ipcMain.handle("app:open-svg", async () => {
    try {
      const res = await dialog.showOpenDialog({
        title: "Open SVG",
        properties: ["openFile"],
        filters: [{ name: "SVG", extensions: ["svg"] }]
      });
      if (res.canceled || res.filePaths.length === 0) {
        return { ok: false, reason: "canceled" as const };
      }
      const p = res.filePaths[0];
      const svgText = await fs.readFile(p, "utf8");
      return { ok: true, path: p, svgText };
    } catch (e) {
      return {
        ok: false,
        reason: "error" as const,
        message: e instanceof Error ? e.message : String(e)
      };
    }
  });

  ipcMain.handle("app:get-settings", async () => {
    return { ok: true, settings };
  });

  ipcMain.handle("app:pick-inkscape", async () => {
    try {
      const res = await dialog.showOpenDialog({
        title: "Select Inkscape (inkscape.exe / inkscape.com)",
        properties: ["openFile"],
        filters: [{ name: "Inkscape", extensions: ["exe", "com"] }]
      });
      if (res.canceled || res.filePaths.length === 0) {
        return { ok: false, reason: "canceled" as const };
      }
      const p = res.filePaths[0];
      settings = { ...settings, inkscapePath: p };
      await writeSettings(app.getPath("userData"), settings);
      return { ok: true, path: p };
    } catch (e) {
      return { ok: false, reason: "error" as const, message: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle("app:load-svg-from-path", async (_evt, args: { path?: string }) => {
    try {
      const p = args?.path ?? "";
      if (!p) return { ok: false, reason: "error" as const, message: "path is empty" };
      if (path.extname(p).toLowerCase() !== ".svg") {
        return { ok: false, reason: "error" as const, message: "SVG file only (.svg)" };
      }
      const svgText = await fs.readFile(p, "utf8");
      return { ok: true, path: p, svgText };
    } catch (e) {
      return {
        ok: false,
        reason: "error" as const,
        message: e instanceof Error ? e.message : String(e)
      };
    }
  });

  ipcMain.handle("app:copy-as-shape", async (_evt, args: { svgText?: string }) => {
    try {
      const svgText = args?.svgText ?? "";
      if (!svgText.trim()) {
        return { ok: false, reason: "no_svg" as const, message: "SVG が読み込まれていません。" };
      }

      let normalized: string;
      try {
        normalized = await optimizeSvg(svgText);
      } catch {
        normalized = svgText;
      }

      let emfPath: string;
      try {
        emfPath = await svgToEmf(normalized);
      } catch (e) {
        const code = (e as any)?.code;
        if (code === "INKSCAPE_NOT_FOUND") {
          return {
            ok: false,
            reason: "inkscape_not_found" as const,
            message: e instanceof Error ? e.message : String(e)
          };
        }
        return {
          ok: false,
          reason: "convert_failed" as const,
          message: e instanceof Error ? e.message : String(e)
        };
      }

      try {
        await setClipboardEmf(emfPath);
      } catch (e) {
        return {
          ok: false,
          reason: "clipboard_failed" as const,
          message: e instanceof Error ? e.message : String(e)
        };
      }

      return { ok: true };
    } catch (e) {
      return { ok: false, reason: "error" as const, message: e instanceof Error ? e.message : String(e) };
    }
  });

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  // Windows/Linux: quit; macOS: typical behavior is to keep app open.
  if (process.platform !== "darwin") app.quit();
});
