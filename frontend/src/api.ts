import type { PricePoint, Product, Website, WebsiteItem, WebsiteUpdate } from "./types";

const API_BASE = "http://127.0.0.1:8765";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "Content-Type": "application/json" },
    ...init
  });
  if (!response.ok) {
    const raw = await response.text();
    let message = raw;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed.detail === "string") message = parsed.detail;
      else if (parsed && parsed.detail) message = JSON.stringify(parsed.detail);
    } catch {
      // raw text already assigned
    }
    throw new Error(message || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  listWebsites: () => request<Website[]>("/websites"),
  addWebsite: (url: string) =>
    request<Website>("/websites", {
      method: "POST",
      body: JSON.stringify({ url })
    }),
  removeWebsite: (id: number) =>
    request<{ deleted: boolean }>(`/websites/${id}`, {
      method: "DELETE"
    }),
  checkWebsite: (id: number) =>
    request<Website>(`/websites/${id}/check`, {
      method: "POST"
    }),
  websiteUpdates: (id: number) => request<WebsiteUpdate[]>(`/websites/${id}/updates`),
  websiteItems: (id: number) => request<WebsiteItem[]>(`/websites/${id}/items`),
  listProducts: () => request<Product[]>("/products"),
  addProduct: (url: string, targetPrice?: number | null) =>
    request<Product>("/products", {
      method: "POST",
      body: JSON.stringify({ url, target_price: targetPrice ?? null })
    }),
  removeProduct: (id: number) =>
    request<{ deleted: boolean }>(`/products/${id}`, {
      method: "DELETE"
    }),
  checkProduct: (id: number) =>
    request<Product>(`/products/${id}/check`, {
      method: "POST"
    }),
  productHistory: (id: number) => request<PricePoint[]>(`/products/${id}/history`)
};
