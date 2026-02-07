import fs from "node:fs/promises";
import path from "node:path";

export type AppSettings = {
  inkscapePath?: string;
  flToSvgPrefer?: "emf" | "wmf";
  flash8ExePath?: string;
  ffdecJarPath?: string;
};

export async function readSettings(userDataDir: string): Promise<AppSettings> {
  const p = path.join(userDataDir, "settings.json");
  try {
    const raw = await fs.readFile(p, "utf8");
    const obj = JSON.parse(raw) as AppSettings;
    return typeof obj === "object" && obj ? obj : {};
  } catch {
    return {};
  }
}

export async function writeSettings(userDataDir: string, next: AppSettings): Promise<void> {
  const p = path.join(userDataDir, "settings.json");
  const tmp = p + ".tmp";
  const raw = JSON.stringify(next, null, 2);
  await fs.writeFile(tmp, raw, "utf8");
  await fs.rename(tmp, p);
}
