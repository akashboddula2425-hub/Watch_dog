/// <reference types="vite/client" />

interface Window {
  electronAPI?: {
    notify: (title: string, body: string) => Promise<boolean>;
    serviceStatus?: () => Promise<boolean>;
    startService?: () => Promise<"running" | "started" | "failed">;
  };
}
