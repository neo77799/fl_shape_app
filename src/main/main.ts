import { app, BrowserWindow, Menu, dialog, ipcMain, session } from "electron";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import zlib from "node:zlib";
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

async function tryFindFlash8Exe(): Promise<string | null> {
  const candidates: string[] = [];

  if (settings.flash8ExePath) candidates.push(settings.flash8ExePath);

  // Typical installs.
  candidates.push("C:\\Program Files\\Macromedia\\Flash 8\\Flash.exe");
  candidates.push("C:\\Program Files (x86)\\Macromedia\\Flash 8\\Flash.exe");

  for (const c of candidates) {
    try {
      const st = await fs.stat(c);
      if (st.isFile()) return c;
    } catch {
      // ignore
    }
  }

  return null;
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

async function runCapture(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(stderr || `${cmd} exited with ${code}`));
    });
  });
}

function stableRuns(mask: Uint8Array, minLen = 64): Array<{ start: number; end: number; len: number }> {
  const out: Array<{ start: number; end: number; len: number }> = [];
  let i = 0;
  while (i < mask.length) {
    if (mask[i] === 0) {
      i++;
      continue;
    }
    const start = i;
    while (i < mask.length && mask[i] !== 0) i++;
    const end = i; // exclusive
    const len = end - start;
    if (len >= minLen) out.push({ start, end, len });
  }
  out.sort((a, b) => b.len - a.len);
  return out;
}

function hexPreview(buf: Buffer, n = 32): string {
  const head = buf.subarray(0, Math.min(n, buf.length));
  return head.toString("hex").toUpperCase();
}

function findSwfSignatureOffset(buf: Buffer): number | null {
  const sigs = [Buffer.from("FWS", "ascii"), Buffer.from("CWS", "ascii"), Buffer.from("ZWS", "ascii")];
  for (let i = 0; i <= buf.length - 3; i++) {
    for (const s of sigs) {
      if (buf[i] === s[0] && buf[i + 1] === s[1] && buf[i + 2] === s[2]) return i;
    }
  }
  return null;
}

function tryInflateCwsToFws(buf: Buffer): Buffer | null {
  if (buf.length < 8) return null;
  const sig = buf.subarray(0, 3).toString("ascii");
  if (sig !== "CWS") return null;
  const version = buf[3];
  const fileLength = buf.readUInt32LE(4);
  const compressed = buf.subarray(8);
  const body = zlib.inflateSync(compressed);
  const out = Buffer.allocUnsafe(8 + body.length);
  out.write("FWS", 0, "ascii");
  out[3] = version;
  out.writeUInt32LE(fileLength, 4);
  body.copy(out, 8);
  return out;
}

function scanSwfTagCodes(bufFws: Buffer): { tagCounts: Record<number, number>; totalTags: number } {
  // Minimal SWF header skip:
  // 8 bytes header already present. Next: FrameSize RECT (bit-packed), then FrameRate UI16, FrameCount UI16, then tags.
  let bytePos = 8;
  let bitPos = 0;
  const readBits = (n: number): number => {
    let v = 0;
    for (let i = 0; i < n; i++) {
      if (bytePos >= bufFws.length) throw new Error("EOF in bit reader");
      const b = bufFws[bytePos];
      const bit = (b >> (7 - bitPos)) & 1;
      v = (v << 1) | bit;
      bitPos++;
      if (bitPos === 8) {
        bitPos = 0;
        bytePos++;
      }
    }
    return v;
  };
  const align = () => {
    if (bitPos !== 0) {
      bitPos = 0;
      bytePos++;
    }
  };

  // RECT: Nbits (UB[5]) then 4x SB[Nbits]
  const nbits = readBits(5);
  // read 4 signed values (we don't need them)
  for (let i = 0; i < 4; i++) {
    // signed read
    const raw = readBits(nbits);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _signed = raw & (1 << (nbits - 1)) ? raw - (1 << nbits) : raw;
  }
  align();

  // FrameRate UI16, FrameCount UI16
  if (bytePos + 4 > bufFws.length) throw new Error("EOF in SWF header");
  bytePos += 4;

  const tagCounts: Record<number, number> = {};
  let totalTags = 0;
  while (bytePos + 2 <= bufFws.length) {
    const tagCodeAndLen = bufFws.readUInt16LE(bytePos);
    bytePos += 2;
    const tagCode = tagCodeAndLen >> 6;
    let len = tagCodeAndLen & 0x3f;
    if (len === 0x3f) {
      if (bytePos + 4 > bufFws.length) break;
      len = bufFws.readUInt32LE(bytePos);
      bytePos += 4;
    }
    totalTags++;
    tagCounts[tagCode] = (tagCounts[tagCode] ?? 0) + 1;
    bytePos += len;
    if (tagCode === 0) break; // End
    if (bytePos > bufFws.length) break;
  }
  return { tagCounts, totalTags };
}

function rgbaToHex(r: number, g: number, b: number, a: number): string {
  const to2 = (x: number) => x.toString(16).padStart(2, "0").toUpperCase();
  return `#${to2(r)}${to2(g)}${to2(b)}${to2(a)}`;
}

function parseFlash8PictureStyleArrays(
  buf: Buffer,
  styleOffset = 0x50
):
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
  | { ok: false; styleOffset: number; message: string } {
  if (buf.length < styleOffset + 2) return { ok: false, styleOffset, message: "too short" };
  const tryParse = (
    kind: "cpicshape-v1" | "swf-like"
  ):
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
    | { ok: false; styleOffset: number; message: string } => {
    let p = styleOffset;
    const warnings: string[] = [];
    const readU8 = (): number => {
      if (p + 1 > buf.length) throw new Error("EOF");
      return buf[p++];
    };
    const readU16LE = (): number => {
      if (p + 2 > buf.length) throw new Error("EOF");
      const v = buf.readUInt16LE(p);
      p += 2;
      return v;
    };
    const readU32LE = (): number => {
      if (p + 4 > buf.length) throw new Error("EOF");
      const v = buf.readUInt32LE(p);
      p += 4;
      return v;
    };
    const readRgba = (): { r: number; g: number; b: number; a: number; hex: string } => {
      const r = readU8();
      const g = readU8();
      const b = readU8();
      const a = readU8();
      return { r, g, b, a, hex: rgbaToHex(r, g, b, a) };
    };

    try {
      if (kind === "cpicshape-v1") {
        // Observed in stable dumps from Flash 8 clipboard private format "Flash 8 Picture":
        // u16 fillCount, then fillCount * RGBA (solid only)
        // u16 lineCount, then lineCount * (RGBA + u32 widthTwips)
        const fillCount = readU16LE();
        if (fillCount > 256) return { ok: false, styleOffset, message: `fillCount too large(v1): ${fillCount}` };
        const fills: Array<{ type: number; rgba: { r: number; g: number; b: number; a: number }; hex: string }> = [];
        for (let i = 0; i < fillCount; i++) {
          const rgba = readRgba();
          fills.push({ type: 0x00, rgba: { r: rgba.r, g: rgba.g, b: rgba.b, a: rgba.a }, hex: rgba.hex });
        }

        const lineCount = readU16LE();
        if (lineCount > 256) return { ok: false, styleOffset, message: `lineCount too large(v1): ${lineCount}` };
        const lines: Array<{ widthTwips: number; rgba: { r: number; g: number; b: number; a: number }; hex: string }> = [];
        for (let i = 0; i < lineCount; i++) {
          const rgba = readRgba();
          const widthTwips = readU32LE();
          // Heuristic sanity: Flash uses twips (1/20 px); widths above ~10k are suspicious.
          if (widthTwips > 20000) warnings.push(`suspicious line widthTwips=${widthTwips} at index ${i}`);
          lines.push({ widthTwips, rgba: { r: rgba.r, g: rgba.g, b: rgba.b, a: rgba.a }, hex: rgba.hex });
        }

        return { ok: true, styleOffset, fillCount, fills, lineCount, lines, bytesConsumed: p - styleOffset, warnings };
      }

      // Fallback: SWF-ish (older heuristic). Keep for compatibility with older dumps.
      const readCount = (): number => {
        const c = readU8();
        if (c !== 0xff) return c;
        return readU16LE();
      };

      const fillCount = readCount();
      if (fillCount > 512) return { ok: false, styleOffset, message: `fillCount too large: ${fillCount}` };

      const fills: Array<{ type: number; rgba: { r: number; g: number; b: number; a: number }; hex: string }> = [];
      for (let i = 0; i < fillCount; i++) {
        const type = readU8();
        if (type !== 0x00) {
          warnings.push(`unsupported fill type 0x${type.toString(16)} at index ${i}`);
          break;
        }
        const rgba = readRgba();
        fills.push({ type, rgba: { r: rgba.r, g: rgba.g, b: rgba.b, a: rgba.a }, hex: rgba.hex });
      }

      const lineCount = readCount();
      if (lineCount > 512) return { ok: false, styleOffset, message: `lineCount too large: ${lineCount}` };

      const lines: Array<{ widthTwips: number; rgba: { r: number; g: number; b: number; a: number }; hex: string }> = [];
      for (let i = 0; i < lineCount; i++) {
        const widthTwips = readU16LE();
        const rgba = readRgba();
        lines.push({ widthTwips, rgba: { r: rgba.r, g: rgba.g, b: rgba.b, a: rgba.a }, hex: rgba.hex });
      }

      return { ok: true, styleOffset, fillCount, fills, lineCount, lines, bytesConsumed: p - styleOffset, warnings };
    } catch (e) {
      return { ok: false, styleOffset, message: e instanceof Error ? e.message : String(e) };
    }
  };

  // Prefer the v1 layout when it yields plausible small counts.
  const v1 = tryParse("cpicshape-v1");
  if (v1.ok && v1.fillCount <= 64 && v1.lineCount <= 64) return v1;
  const swf = tryParse("swf-like");
  if (swf.ok) return swf;
  return v1.ok ? v1 : swf;
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

async function extractClipboardMetafile(tmpDir: string): Promise<{ kind: "emf" | "wmf"; path: string }> {
  const ps1 = path.join(app.getAppPath(), "scripts", "get-clipboard-metafile.ps1");
  const { stdout } = await runCapture("powershell.exe", [
    "-NoProfile",
    "-STA",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    ps1,
    "-OutDir",
    tmpDir
  ]);

  const raw = stdout.trim();
  const obj = JSON.parse(raw) as any;
  if (!obj || typeof obj !== "object") throw new Error("Invalid clipboard metafile JSON");
  if (obj.ok !== true) {
    throw new Error(typeof obj.message === "string" ? obj.message : "Clipboard metafile extract failed");
  }
  const items = obj.items as Array<{ kind: "emf" | "wmf"; path: string }>;
  if (!Array.isArray(items) || items.length === 0) throw new Error("No metafile items");
  for (const it of items) {
    if (!it || (it.kind !== "emf" && it.kind !== "wmf") || typeof it.path !== "string" || !it.path) {
      throw new Error("Invalid clipboard metafile item");
    }
  }

  const prefer = settings.flToSvgPrefer ?? "emf";
  const ordered = [...items].sort((a, b) => {
    const score = (k: "emf" | "wmf") => (k === prefer ? 0 : 1);
    return score(a.kind) - score(b.kind);
  });
  return ordered[0];
}

async function metafileToSvg(metafilePath: string): Promise<string> {
  const inkscape = await tryFindInkscape();
  if (!inkscape) {
    const msg =
      "Inkscape が見つかりません。設定から inkscape.exe / inkscape.com を選択してください。";
    throw Object.assign(new Error(msg), { code: "INKSCAPE_NOT_FOUND" });
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fl-shape-app-"));
  const outSvg = path.join(tmpDir, "output.svg");

  await run(inkscape, ["--export-area-drawing", "--export-type=svg", `--export-filename=${outSvg}`, metafilePath]);
  await fs.stat(outSvg);
  return await fs.readFile(outSvg, "utf8");
}

async function metafileToPngDataUrl(metafilePath: string): Promise<string> {
  const inkscape = await tryFindInkscape();
  if (!inkscape) {
    const msg =
      "Inkscape が見つかりません。設定から inkscape.exe / inkscape.com を選択してください。";
    throw Object.assign(new Error(msg), { code: "INKSCAPE_NOT_FOUND" });
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fl-shape-app-"));
  const outPng = path.join(tmpDir, "output.png");

  await run(inkscape, ["--export-area-drawing", "--export-type=png", `--export-filename=${outPng}`, metafilePath]);
  const bytes = await fs.readFile(outPng);
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

async function extractClipboardImagePngDataUrl(tmpDir: string): Promise<string | null> {
  const ps1 = path.join(app.getAppPath(), "scripts", "get-clipboard-image.ps1");
  const { stdout } = await runCapture("powershell.exe", [
    "-NoProfile",
    "-STA",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    ps1,
    "-OutDir",
    tmpDir
  ]);

  const raw = stdout.trim();
  const obj = JSON.parse(raw) as any;
  if (!obj || typeof obj !== "object") throw new Error("Invalid clipboard image JSON");
  if (obj.ok !== true) return null;
  const p = obj.path as string;
  if (typeof p !== "string" || !p) throw new Error("Invalid clipboard image payload");

  const bytes = await fs.readFile(p);
  return `data:image/png;base64,${bytes.toString("base64")}`;
}

async function dumpClipboardFormatByName(formatName: string, outDir?: string): Promise<{
  path: string;
  size: number;
  id: number;
  name: string;
  headHex: string;
}> {
  const dumpsDir = path.join(app.getPath("userData"), "dumps");
  await fs.mkdir(dumpsDir, { recursive: true });
  const dir = outDir ?? path.join(dumpsDir, new Date().toISOString().replace(/[:.]/g, "-"));
  await fs.mkdir(dir, { recursive: true });

  const ps1 = path.join(app.getAppPath(), "scripts", "dump-clipboard-format.ps1");
  const { stdout } = await runCapture("powershell.exe", [
    "-NoProfile",
    "-STA",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    ps1,
    "-OutDir",
    dir,
    "-FormatName",
    formatName
  ]);
  const raw = stdout.trim();
  const obj = JSON.parse(raw) as any;
  if (!obj || typeof obj !== "object") throw new Error("Invalid dump JSON");
  if (obj.ok !== true) throw new Error(typeof obj.message === "string" ? obj.message : "Dump failed");
  return { path: obj.path, size: obj.size, id: obj.id, name: obj.name, headHex: obj.headHex };
}

function detectSignature(buf: Buffer): { kind: string; offset: number }[] {
  const sigs: Array<{ kind: string; bytes: Buffer }> = [
    { kind: "SWF:FWS", bytes: Buffer.from("FWS", "ascii") },
    { kind: "SWF:CWS", bytes: Buffer.from("CWS", "ascii") },
    { kind: "SWF:ZWS", bytes: Buffer.from("ZWS", "ascii") },
    { kind: "OLE:D0CF", bytes: Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]) },
    { kind: "ZIP:PK", bytes: Buffer.from("PK", "ascii") },
    { kind: "Flash:CPicShape", bytes: Buffer.from("CPicShape", "ascii") }
  ];
  const out: { kind: string; offset: number }[] = [];
  for (const s of sigs) {
    let i = -1;
    while (true) {
      i = buf.indexOf(s.bytes, i + 1);
      if (i < 0) break;
      out.push({ kind: s.kind, offset: i });
      if (out.length > 50) return out;
    }
  }
  return out.sort((a, b) => a.offset - b.offset);
}

function jsflQuote(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

async function flashClipboardToSwf(): Promise<{ swfPath: string; outDir: string; jsflPath: string }> {
  const flashExe = await tryFindFlash8Exe();
  if (!flashExe) {
    const msg = "Flash Professional 8 (Flash.exe) が見つかりません。Settings で Flash.exe を指定してください。";
    throw Object.assign(new Error(msg), { code: "FLASH8_NOT_FOUND" });
  }

  const outRoot = path.join(app.getPath("userData"), "exports");
  await fs.mkdir(outRoot, { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(outRoot, ts);
  await fs.mkdir(outDir, { recursive: true });

  const flaPath = path.join(outDir, "clipboard.fla");
  const swfPath = path.join(outDir, "clipboard.swf");
  const jsflPath = path.join(outDir, "export_clipboard_to_swf.jsfl");
  const logPath = path.join(outDir, "flash_jsfl.log");

  const jsfl = `// Auto-generated by fl-shape-app
var flaPath = "${jsflQuote(flaPath)}";
var swfPath = "${jsflQuote(swfPath)}";
var logPath = "${jsflQuote(logPath)}";

function log(msg) {
  try { FLfile.write(FLfile.platformPathToURI(logPath), msg + "\\n", "append"); } catch (e) {}
}

try {
  var dom = fl.createDocument();
  if (!dom) throw new Error("createDocument failed");
  log("created doc");

  dom.clipPaste();
  log("clipPaste ok");

  fl.saveDocument(dom, FLfile.platformPathToURI(flaPath));
  log("saved fla");

  dom.publish();
  log("publish called");

  try { dom.close(false); } catch (e) {}
  try { fl.quit(false); } catch (e) { try { fl.quit(); } catch (e2) {} }
  log("done");
} catch (e) {
  log("ERROR: " + e);
  try { fl.quit(false); } catch (e2) { try { fl.quit(); } catch (e3) {} }
}
`;

  await fs.writeFile(jsflPath, jsfl, "utf8");

  await run(flashExe, [jsflPath, "-AlwaysRunJSFL"]);

  await fs.stat(swfPath);
  return { swfPath, outDir, jsflPath };
}

async function ffdecExportShapesToSvg(swfPath: string): Promise<{ svgDir: string }> {
  const jar = settings.ffdecJarPath;
  if (!jar) {
    const msg = "FFDec (ffdec.jar) が未設定です。Settings で jar を指定してください。";
    throw Object.assign(new Error(msg), { code: "FFDEC_NOT_FOUND" });
  }

  const svgDir = path.join(path.dirname(swfPath), "ffdec-svg");
  await fs.mkdir(svgDir, { recursive: true });

  // FFDec CLI syntax varies by version; this is a common one.
  await run("java.exe", ["-jar", jar, "-export", `shapes:${svgDir}`, "-format", "svg", swfPath]);
  return { svgDir };
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

  ipcMain.handle("app:update-settings", async (_evt, args: { settings?: Partial<AppSettings> }) => {
    try {
      const next = args?.settings ?? {};
      const merged: AppSettings = { ...settings };

      if (typeof next.inkscapePath === "string" || typeof next.inkscapePath === "undefined") {
        merged.inkscapePath = next.inkscapePath;
      }
      if (next.flToSvgPrefer === "emf" || next.flToSvgPrefer === "wmf" || typeof next.flToSvgPrefer === "undefined") {
        merged.flToSvgPrefer = next.flToSvgPrefer;
      }
      if (typeof next.flash8ExePath === "string" || typeof next.flash8ExePath === "undefined") {
        merged.flash8ExePath = next.flash8ExePath;
      }
      if (typeof next.ffdecJarPath === "string" || typeof next.ffdecJarPath === "undefined") {
        merged.ffdecJarPath = next.ffdecJarPath;
      }

      settings = merged;
      await writeSettings(app.getPath("userData"), settings);
      return { ok: true, settings };
    } catch (e) {
      return { ok: false, reason: "error" as const, message: e instanceof Error ? e.message : String(e) };
    }
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

  ipcMain.handle("app:pick-flash8-exe", async () => {
    try {
      const res = await dialog.showOpenDialog({
        title: "Select Flash.exe (Flash Professional 8)",
        properties: ["openFile"],
        filters: [{ name: "Flash.exe", extensions: ["exe"] }]
      });
      if (res.canceled || res.filePaths.length === 0) {
        return { ok: false, reason: "canceled" as const };
      }
      const p = res.filePaths[0];
      settings = { ...settings, flash8ExePath: p };
      await writeSettings(app.getPath("userData"), settings);
      return { ok: true, path: p };
    } catch (e) {
      return { ok: false, reason: "error" as const, message: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle("app:pick-ffdec-jar", async () => {
    try {
      const res = await dialog.showOpenDialog({
        title: "Select FFDec jar (ffdec.jar)",
        properties: ["openFile"],
        filters: [{ name: "ffdec.jar", extensions: ["jar"] }]
      });
      if (res.canceled || res.filePaths.length === 0) {
        return { ok: false, reason: "canceled" as const };
      }
      const p = res.filePaths[0];
      settings = { ...settings, ffdecJarPath: p };
      await writeSettings(app.getPath("userData"), settings);
      return { ok: true, path: p };
    } catch (e) {
      return { ok: false, reason: "error" as const, message: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle("app:true-vector-to-svg", async () => {
    try {
      const { swfPath } = await flashClipboardToSwf();
      try {
        const { svgDir } = await ffdecExportShapesToSvg(swfPath);
        return { ok: true, swfPath, svgDir };
      } catch (e) {
        const code = (e as any)?.code;
        if (code === "FFDEC_NOT_FOUND") return { ok: true, swfPath, svgDir: null as const };
        throw e;
      }
    } catch (e) {
      const code = (e as any)?.code;
      if (code === "FLASH8_NOT_FOUND") {
        return { ok: false, reason: "flash8_not_found" as const, message: e instanceof Error ? e.message : String(e) };
      }
      if (code === "FFDEC_NOT_FOUND") {
        return { ok: false, reason: "ffdec_not_found" as const, message: e instanceof Error ? e.message : String(e) };
      }
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

  ipcMain.handle("app:get-clipboard-formats", async () => {
    try {
      const ps1 = path.join(app.getAppPath(), "scripts", "get-clipboard-formats.ps1");
      const { stdout } = await runCapture("powershell.exe", [
        "-NoProfile",
        "-STA",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        ps1
      ]);

      const raw = stdout.trim();
      const formats = JSON.parse(raw) as Array<{ id: number; name: string }>;
      if (!Array.isArray(formats)) throw new Error("Invalid clipboard formats JSON");
      return { ok: true, formats };
    } catch (e) {
      return { ok: false, reason: "error" as const, message: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle("app:fl-shape-to-svg", async () => {
    try {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fl-shape-app-clip-"));
      const { path: metafilePath } = await extractClipboardMetafile(tmpDir);
      const svgText = await metafileToSvg(metafilePath);
      return { ok: true, svgText };
    } catch (e) {
      const code = (e as any)?.code;
      if (code === "INKSCAPE_NOT_FOUND") {
        return {
          ok: false,
          reason: "inkscape_not_found" as const,
          message: e instanceof Error ? e.message : String(e)
        };
      }
      return { ok: false, reason: "error" as const, message: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle("app:fl-shape-inspect", async () => {
    try {
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "fl-shape-app-clip-"));
      const clipboardImagePngDataUrl = await extractClipboardImagePngDataUrl(tmpDir);

      // Call the PS1 directly so we can inspect all items, not only preferred.
      const ps1 = path.join(app.getAppPath(), "scripts", "get-clipboard-metafile.ps1");
      const { stdout } = await runCapture("powershell.exe", [
        "-NoProfile",
        "-STA",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        ps1,
        "-OutDir",
        tmpDir
      ]);

      const raw = stdout.trim();
      const obj = JSON.parse(raw) as any;
      if (!obj || typeof obj !== "object") throw new Error("Invalid clipboard metafile JSON");
      if (obj.ok !== true) throw new Error(typeof obj.message === "string" ? obj.message : "Clipboard metafile extract failed");

      const items = obj.items as Array<{ kind: "emf" | "wmf"; path: string }>;
      if (!Array.isArray(items) || items.length === 0) throw new Error("No metafile items");

      const out: Array<{ kind: "emf" | "wmf"; svgText: string; pngDataUrl: string }> = [];
      for (const it of items) {
        if (!it || (it.kind !== "emf" && it.kind !== "wmf") || typeof it.path !== "string" || !it.path) continue;
        const svgText = await metafileToSvg(it.path);
        const pngDataUrl = await metafileToPngDataUrl(it.path);
        out.push({ kind: it.kind, svgText, pngDataUrl });
      }
      if (out.length === 0) throw new Error("No convertible metafile items");

      // Stable ordering in UI: EMF then WMF.
      out.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === "emf" ? -1 : 1));
      return { ok: true, items: out, clipboardImagePngDataUrl };
    } catch (e) {
      const code = (e as any)?.code;
      if (code === "INKSCAPE_NOT_FOUND") {
        return {
          ok: false,
          reason: "inkscape_not_found" as const,
          message: e instanceof Error ? e.message : String(e)
        };
      }
      return { ok: false, reason: "error" as const, message: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle("app:clipboard-write-text", async (_evt, args: { text?: string }) => {
    try {
      const text = args?.text ?? "";
      const { clipboard } = await import("electron");
      clipboard.writeText(text);
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: "error" as const, message: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle("app:save-svg", async (_evt, args: { svgText?: string }) => {
    try {
      const svgText = args?.svgText ?? "";
      if (!svgText.trim()) return { ok: false, reason: "no_svg" as const, message: "SVG が空です。" };

      const res = await dialog.showSaveDialog({
        title: "Save SVG",
        filters: [{ name: "SVG", extensions: ["svg"] }],
        defaultPath: "shape.svg"
      });
      if (res.canceled || !res.filePath) return { ok: false, reason: "canceled" as const };
      await fs.writeFile(res.filePath, svgText, "utf8");
      return { ok: true, path: res.filePath };
    } catch (e) {
      return { ok: false, reason: "error" as const, message: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle("app:dump-flash8-picture", async () => {
    try {
      const dumped = await dumpClipboardFormatByName("Flash 8 Picture");
      const bytes = await fs.readFile(dumped.path);
      const buf = Buffer.from(bytes);
      const flash8Styles = parseFlash8PictureStyleArrays(buf);

      const sigOffset = findSwfSignatureOffset(buf);
      let swfInfo: any = null;
      if (sigOffset !== null) {
        const sliced = buf.subarray(sigOffset);
        const sig = sliced.subarray(0, 3).toString("ascii");
        let fws = sliced;
        if (sig === "CWS") {
          const inflated = tryInflateCwsToFws(sliced);
          if (inflated) fws = inflated;
        }
        if (fws.subarray(0, 3).toString("ascii") === "FWS") {
          const scan = scanSwfTagCodes(fws);
          const outSwf = dumped.path.replace(/\.bin$/i, ".swf");
          await fs.writeFile(outSwf, fws);
          swfInfo = {
            sig,
            sigOffset,
            swfPath: outSwf,
            headHex: hexPreview(fws, 32),
            totalTags: scan.totalTags,
            tagCounts: scan.tagCounts
          };
        } else {
          swfInfo = { sig, sigOffset, note: "SWF signature found but could not parse/inflate", headHex: hexPreview(sliced, 32) };
        }
      }

      return { ok: true, dumped, swfInfo, flash8Styles };
    } catch (e) {
      return { ok: false, reason: "error" as const, message: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle("app:sample-flash8-picture", async (_evt, args: { n?: number }) => {
    try {
      const n = Math.max(2, Math.min(50, Math.floor(args?.n ?? 10)));

      const dumpsDir = path.join(app.getPath("userData"), "dumps");
      await fs.mkdir(dumpsDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const outDir = path.join(dumpsDir, `sample-${ts}`);
      await fs.mkdir(outDir, { recursive: true });

      const samples: Buffer[] = [];
      for (let i = 0; i < n; i++) {
        const dumped = await dumpClipboardFormatByName("Flash 8 Picture", outDir);
        const samplePath = path.join(outDir, `Flash 8 Picture.${String(i + 1).padStart(2, "0")}.bin`);
        try {
          await fs.rename(dumped.path, samplePath);
        } catch {
          // If rename fails (e.g. overwritten by antivirus), continue with whatever exists.
        }
        const bytes = await fs.readFile(samplePath);
        samples.push(Buffer.from(bytes));
      }

      const len = Math.min(...samples.map((b) => b.length));
      const mask = new Uint8Array(len);
      const stable = Buffer.alloc(len);

      let stableCount = 0;
      for (let i = 0; i < len; i++) {
        const v0 = samples[0][i];
        let same = true;
        for (let k = 1; k < samples.length; k++) {
          if (samples[k][i] !== v0) {
            same = false;
            break;
          }
        }
        if (same) {
          mask[i] = 1;
          stable[i] = v0;
          stableCount++;
        }
      }

      const stablePct = len ? stableCount / len : 0;
      const runs = stableRuns(mask, 64).slice(0, 50);

      const stablePath = path.join(outDir, "stable.bin");
      const maskPath = path.join(outDir, "stable.mask.bin");
      const summaryPath = path.join(outDir, "stability.json");
      await fs.writeFile(stablePath, stable);
      await fs.writeFile(maskPath, Buffer.from(mask));
      await fs.writeFile(
        summaryPath,
        JSON.stringify({ n, len, stableCount, stablePct, topRuns: runs }, null, 2),
        "utf8"
      );

      return { ok: true, outDir, n, len, stableCount, stablePct, stablePath, maskPath, summaryPath, topRuns: runs };
    } catch (e) {
      return { ok: false, reason: "error" as const, message: e instanceof Error ? e.message : String(e) };
    }
  });

  ipcMain.handle("app:dump-clipboard-bundle", async () => {
    try {
      const dumpsDir = path.join(app.getPath("userData"), "dumps");
      await fs.mkdir(dumpsDir, { recursive: true });
      const ts = new Date().toISOString().replace(/[:.]/g, "-");
      const outDir = path.join(dumpsDir, ts);
      await fs.mkdir(outDir, { recursive: true });

      const names = [
        "Flash 8 Picture",
        "Native",
        "Embed Source",
        "OwnerLink",
        "Object Descriptor",
        "Ole Private Data",
        "DataObject"
      ];

      const items: Array<{
        name: string;
        ok: boolean;
        path?: string;
        size?: number;
        id?: number;
        headHex?: string;
        signatures?: { kind: string; offset: number }[];
        flash8Styles?: ReturnType<typeof parseFlash8PictureStyleArrays> | null;
        message?: string;
      }> = [];

      for (const n of names) {
        try {
          const dumped = await dumpClipboardFormatByName(n, outDir);
          const bytes = await fs.readFile(dumped.path);
          const buf = Buffer.from(bytes);
          const flash8Styles = dumped.name === "Flash 8 Picture" ? parseFlash8PictureStyleArrays(buf) : null;
          items.push({
            name: dumped.name,
            ok: true,
            path: dumped.path,
            size: dumped.size,
            id: dumped.id,
            headHex: dumped.headHex,
            signatures: detectSignature(buf),
            flash8Styles
          });
        } catch (e) {
          items.push({ name: n, ok: false, message: e instanceof Error ? e.message : String(e) });
        }
      }

      // Always write a manifest for debugging (even if individual dumps failed).
      try {
        const manifestPath = path.join(outDir, "bundle.json");
        await fs.writeFile(manifestPath, JSON.stringify({ outDir, items }, null, 2), "utf8");
      } catch {
        // ignore
      }

      return { ok: true, outDir, items };
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
