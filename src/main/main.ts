import { app, BrowserWindow, Menu, dialog, ipcMain, session } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readSettings, writeSettings, type AppSettings } from "./settings";

const devServerUrl = process.env.VITE_DEV_SERVER_URL;
let settings: AppSettings = {};

async function run(command: string, args: string[]): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stderr = "";
    child.stderr.on("data", (chunk) => (stderr += String(chunk)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr || `${command} exited with ${code}`));
    });
  });
}

async function findInkscape(): Promise<string | null> {
  const candidates = [
    settings.inkscapePath,
    process.env.INKSCAPE_PATH,
    "C:\\Program Files\\Inkscape\\bin\\inkscape.com",
    "C:\\Program Files\\Inkscape\\bin\\inkscape.exe",
    "C:\\Program Files\\Inkscape\\inkscape.com",
    "C:\\Program Files\\Inkscape\\inkscape.exe"
  ].filter((candidate): candidate is string => Boolean(candidate));

  for (const candidate of candidates) {
    try {
      if ((await fs.stat(candidate)).isFile()) return candidate;
    } catch {
      // Try the next candidate.
    }
  }

  try {
    const found = await new Promise<string>((resolve, reject) => {
      const child = spawn("where.exe", ["inkscape"], { windowsHide: true });
      let stdout = "";
      child.stdout.on("data", (chunk) => (stdout += String(chunk)));
      child.on("error", reject);
      child.on("close", (code) => (code === 0 ? resolve(stdout) : reject(new Error(`where.exe exited with ${code}`))));
    });
    return found.split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? null;
  } catch {
    return null;
  }
}

async function optimizeSvg(svgText: string): Promise<string> {
  const { optimize } = (await import("svgo")) as typeof import("svgo");
  return optimize(svgText, {
    multipass: true,
    plugins: ["preset-default"]
  }).data;
}

async function svgToEmf(svgText: string): Promise<{ emfPath: string; tempDir: string }> {
  const inkscape = await findInkscape();
  if (!inkscape) {
    throw Object.assign(
      new Error("Inkscapeが見つかりません。設定からInkscapeを選択してください。"),
      { code: "INKSCAPE_NOT_FOUND" }
    );
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "fl-shape-app-"));
  const inputPath = path.join(tempDir, "input.svg");
  const emfPath = path.join(tempDir, "output.emf");
  await fs.writeFile(inputPath, svgText, "utf8");
  await run(inkscape, [
    "--export-area-drawing",
    "--export-type=emf",
    `--export-filename=${emfPath}`,
    inputPath
  ]);
  await fs.stat(emfPath);
  return { emfPath, tempDir };
}

async function setClipboardEmf(emfPath: string): Promise<void> {
  const scriptPath = path.join(app.getAppPath(), "scripts", "set-clipboard-emf.ps1");
  await run("powershell.exe", [
    "-NoProfile",
    "-STA",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    scriptPath,
    "-EmfPath",
    emfPath
  ]);
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    minWidth: 720,
    minHeight: 560,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, "preload.js")
    }
  });

  if (devServerUrl) void win.loadURL(devServerUrl);
  else void win.loadFile(path.join(app.getAppPath(), "dist/renderer/index.html"));

  if (!app.isPackaged && process.env.OPEN_DEVTOOLS === "1") {
    win.webContents.openDevTools({ mode: "detach" });
  }
}

app.whenReady().then(async () => {
  settings = await readSettings(app.getPath("userData"));
  Menu.setApplicationMenu(null);

  const csp = devServerUrl
    ? "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' ws: http: https:;"
    : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self';";
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({ responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [csp] } });
  });

  ipcMain.handle("app:open-svg", async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: "SVGを開く",
        properties: ["openFile"],
        filters: [{ name: "SVG", extensions: ["svg"] }]
      });
      if (result.canceled || result.filePaths.length === 0) return { ok: false, reason: "canceled" as const };
      const filePath = result.filePaths[0];
      return { ok: true, path: filePath, svgText: await fs.readFile(filePath, "utf8") };
    } catch (error) {
      return { ok: false, reason: "error" as const, message: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("app:load-svg-from-path", async (_event, args: { path?: string }) => {
    try {
      const filePath = args?.path ?? "";
      if (path.extname(filePath).toLowerCase() !== ".svg") {
        return { ok: false, reason: "error" as const, message: "SVGファイル（.svg）のみ読み込めます。" };
      }
      return { ok: true, path: filePath, svgText: await fs.readFile(filePath, "utf8") };
    } catch (error) {
      return { ok: false, reason: "error" as const, message: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("app:get-settings", () => ({ ok: true, settings }));

  ipcMain.handle("app:pick-inkscape", async () => {
    try {
      const result = await dialog.showOpenDialog({
        title: "Inkscapeを選択",
        properties: ["openFile"],
        filters: [{ name: "Inkscape", extensions: ["exe", "com"] }]
      });
      if (result.canceled || result.filePaths.length === 0) return { ok: false, reason: "canceled" as const };
      settings = { inkscapePath: result.filePaths[0] };
      await writeSettings(app.getPath("userData"), settings);
      return { ok: true, path: result.filePaths[0] };
    } catch (error) {
      return { ok: false, reason: "error" as const, message: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("app:copy-as-shape", async (_event, args: { svgText?: string }) => {
    let tempDir: string | undefined;
    try {
      const svgText = args?.svgText?.trim() ?? "";
      if (!svgText) return { ok: false, reason: "no_svg" as const, message: "SVGを読み込んでください。" };

      let normalized = svgText;
      try {
        normalized = await optimizeSvg(svgText);
      } catch {
        // Conversion can continue with the original SVG.
      }

      const converted = await svgToEmf(normalized);
      tempDir = converted.tempDir;
      await setClipboardEmf(converted.emfPath);
      return { ok: true };
    } catch (error) {
      return {
        ok: false,
        reason: (error as { code?: string }).code === "INKSCAPE_NOT_FOUND" ? "inkscape_not_found" as const : "error" as const,
        message: error instanceof Error ? error.message : String(error)
      };
    } finally {
      if (tempDir) await fs.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
