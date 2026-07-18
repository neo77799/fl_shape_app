import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("app", {
  openSvg: () => ipcRenderer.invoke("app:open-svg"),
  loadSvgFromPath: (path: string) => ipcRenderer.invoke("app:load-svg-from-path", { path }),
  getSettings: () => ipcRenderer.invoke("app:get-settings"),
  pickInkscape: () => ipcRenderer.invoke("app:pick-inkscape"),
  copyAsShape: (svgText: string) => ipcRenderer.invoke("app:copy-as-shape", { svgText })
});
