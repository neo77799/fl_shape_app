import fs from "node:fs/promises";
import path from "node:path";

export type AppSettings = { inkscapePath?: string };

export async function readSettings(userDataDir: string): Promise<AppSettings> {
  try {
    const value = JSON.parse(await fs.readFile(path.join(userDataDir, "settings.json"), "utf8"));
    return typeof value?.inkscapePath === "string" ? { inkscapePath: value.inkscapePath } : {};
  } catch {
    return {};
  }
}

export async function writeSettings(userDataDir: string, settings: AppSettings): Promise<void> {
  const target = path.join(userDataDir, "settings.json");
  const temporary = `${target}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(settings, null, 2), "utf8");
  await fs.rename(temporary, target);
}
