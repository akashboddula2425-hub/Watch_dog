import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  notify: (title: string, body: string) => ipcRenderer.invoke("watchdog:notify", { title, body }),
  serviceStatus: (): Promise<boolean> => ipcRenderer.invoke("watchdog:service-status"),
  startService: (): Promise<"running" | "started" | "failed"> =>
    ipcRenderer.invoke("watchdog:start-service")
});
