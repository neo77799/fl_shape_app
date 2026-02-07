import { app, BrowserWindow } from "electron";
import path from "node:path";

const devServerUrl = process.env.VITE_DEV_SERVER_URL;

function createWindow(): void {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, "preload.js")
    }
  });

  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    void win.loadFile(path.join(app.getAppPath(), "dist/renderer/index.html"));
  }

  if (!app.isPackaged) {
    win.webContents.openDevTools({ mode: "detach" });
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  // Windows/Linux: quit; macOS: typical behavior is to keep app open.
  if (process.platform !== "darwin") app.quit();
});
