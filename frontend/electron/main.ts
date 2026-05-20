import { app, BrowserWindow, ipcMain, Notification, session } from "electron";
import { ChildProcess, spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";

let backendProcess: ChildProcess | null = null;

function pingBackend(): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get(
      { host: "127.0.0.1", port: 8765, path: "/health", timeout: 800 },
      (res) => {
        resolve(res.statusCode === 200);
        res.resume();
      }
    );
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

function spawnBackend(): void {
  const projectRoot = path.resolve(__dirname, "..", "..");
  const pythonExecutable =
    process.env.PYTHON_PATH || path.join(projectRoot, ".venv", "Scripts", "python.exe");
  backendProcess = spawn(
    pythonExecutable,
    ["-m", "uvicorn", "backend.app.main:app", "--host", "127.0.0.1", "--port", "8765"],
    {
      cwd: projectRoot,
      stdio: "inherit",
      detached: false
    }
  );
  backendProcess.on("exit", () => {
    backendProcess = null;
  });
}

async function waitForBackend(timeoutMs = 15000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await pingBackend()) return true;
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

async function ensureBackend(): Promise<"running" | "started" | "failed"> {
  if (await pingBackend()) return "running";
  if (!backendProcess) spawnBackend();
  const ok = await waitForBackend();
  return ok ? "started" : "failed";
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: "#0a0a0a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    win.loadURL(devServerUrl);
  } else {
    win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

function allowIframeEmbedding() {
  // Strip headers that block iframe embedding so the "Expand" preview can
  // show sites like gsmarena.com that set X-Frame-Options / CSP frame-ancestors.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const headers: Record<string, string[] | string | undefined> = { ...details.responseHeaders };
    for (const key of Object.keys(headers)) {
      const lower = key.toLowerCase();
      if (lower === "x-frame-options") {
        delete headers[key];
      } else if (lower === "content-security-policy") {
        const stripped = (Array.isArray(headers[key]) ? headers[key] : [headers[key] as string])
          .filter((v): v is string => typeof v === "string")
          .map((v) => v.replace(/frame-ancestors[^;]*;?/gi, "").trim())
          .filter((v) => v.length > 0);
        if (stripped.length) headers[key] = stripped;
        else delete headers[key];
      }
    }
    callback({ responseHeaders: headers as Record<string, string[]> });
  });
}

app.whenReady().then(async () => {
  allowIframeEmbedding();
  await ensureBackend();
  createWindow();

  ipcMain.handle("watchdog:notify", (_event, payload: { title: string; body: string }) => {
    if (Notification.isSupported()) {
      new Notification({ title: payload.title, body: payload.body }).show();
      return true;
    }
    return false;
  });

  ipcMain.handle("watchdog:service-status", async () => pingBackend());

  ipcMain.handle("watchdog:start-service", async () => ensureBackend());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", () => {
  if (backendProcess?.pid) {
    backendProcess.kill();
  }
});
