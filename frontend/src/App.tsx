import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, BellRing, ExternalLink, Globe, LineChart as LineChartIcon, Loader2, Play, Plus, RefreshCw, ShoppingCart, Star, Trash2, X } from "lucide-react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { api } from "./api";
import type { PricePoint, Product, Website, WebsiteItem, WebsiteUpdate } from "./types";

type Tab = "website" | "price";

export default function App() {
  const [tab, _setTab] = useState<Tab>("website");
  const setTab = (next: Tab) => {
    _setTab(next);
    setError(null);
    setExpandedProductId(null);
    setExpandedWebsiteId(null);
  };
  const [websites, setWebsites] = useState<Website[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [websiteInput, setWebsiteInput] = useState("");
  const [productInput, setProductInput] = useState("");
  const [targetPriceInput, setTargetPriceInput] = useState("");
  const [expandedProductId, setExpandedProductId] = useState<number | null>(null);
  const [expandedWebsiteId, setExpandedWebsiteId] = useState<number | null>(null);
  const [history, setHistory] = useState<Record<number, PricePoint[]>>({});
  const [websiteUpdates, setWebsiteUpdates] = useState<Record<number, WebsiteUpdate[]>>({});
  const [websiteItems, setWebsiteItems] = useState<Record<number, WebsiteItem[] | "loading" | "error">>({});
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [serviceUp, setServiceUp] = useState<boolean | null>(null);
  const [startingService, setStartingService] = useState(false);
  const pollTimer = useRef<number | null>(null);

  useEffect(() => {
    void checkService().then((up) => {
      if (up) void refreshAll();
    });
    pollTimer.current = window.setInterval(() => void checkService(), 5000);
    return () => {
      if (pollTimer.current) window.clearInterval(pollTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkService(): Promise<boolean> {
    try {
      const res = await fetch("http://127.0.0.1:8765/health", { cache: "no-store" });
      const up = res.ok;
      setServiceUp(up);
      return up;
    } catch {
      setServiceUp(false);
      return false;
    }
  }

  async function onStartService() {
    setStartingService(true);
    try {
      if (window.electronAPI?.startService) {
        const result = await window.electronAPI.startService();
        if (result === "failed") {
          setError("Could not start backend. Check the Electron console for details.");
        } else {
          setError(null);
        }
      } else {
        for (let i = 0; i < 25; i++) {
          if (await checkService()) break;
          await new Promise((r) => setTimeout(r, 500));
        }
        if (!(await checkService())) {
          setError(
            "Backend not reachable. Start it manually: run `npm run backend` from the project root."
          );
          return;
        }
      }
      const up = await checkService();
      if (up) void refreshAll();
    } finally {
      setStartingService(false);
    }
  }

  function showError(prefix: string, err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    setError(`${prefix}: ${msg}`);
    console.error(prefix, err);
  }

  async function refreshAll() {
    try {
      const [web, prod] = await Promise.all([api.listWebsites(), api.listProducts()]);
      setWebsites(web);
      setProducts(prod);
      setError(null);
    } catch (err) {
      showError("Could not reach backend", err);
    }
  }

  async function onAddWebsite() {
    if (!websiteInput.trim()) return;
    setAdding(true);
    try {
      await api.addWebsite(websiteInput.trim());
      setWebsiteInput("");
      setWebsites(await api.listWebsites());
      setError(null);
    } catch (err) {
      showError("Failed to add website", err);
    } finally {
      setAdding(false);
    }
  }

  async function onCheckWebsite(id: number) {
    setBusyId(`w-${id}`);
    try {
      const updated = await api.checkWebsite(id);
      setWebsites((prev) => prev.map((w) => (w.id === id ? updated : w)));
      if (expandedWebsiteId === id) {
        const updates = await api.websiteUpdates(id);
        setWebsiteUpdates((prev) => ({ ...prev, [id]: updates }));
      }
      setError(null);
    } catch (err) {
      showError("Failed to check website", err);
    } finally {
      setBusyId(null);
    }
  }

  async function onRemoveWebsite(id: number) {
    try {
      await api.removeWebsite(id);
      setWebsites((prev) => prev.filter((w) => w.id !== id));
    } catch (err) {
      showError("Failed to remove website", err);
    }
  }

  async function onAddProduct() {
    if (!productInput.trim()) return;
    setAdding(true);
    try {
      const raw = targetPriceInput.trim();
      const parsed = raw ? Number(raw) : null;
      const target = parsed !== null && !Number.isNaN(parsed) ? parsed : null;
      const created = await api.addProduct(productInput.trim(), target);
      setProductInput("");
      setTargetPriceInput("");
      setProducts(await api.listProducts());
      // Auto-open the graph on the newly added product.
      await loadHistory(created.id);
      setExpandedProductId(created.id);
      setError(null);
    } catch (err) {
      showError("Failed to add product", err);
    } finally {
      setAdding(false);
    }
  }

  async function onCheckProduct(id: number) {
    setBusyId(`p-${id}`);
    try {
      const updated = await api.checkProduct(id);
      setProducts((prev) => prev.map((p) => (p.id === id ? updated : p)));
      if (
        updated.current_price !== null &&
        updated.target_price !== null &&
        updated.current_price <= updated.target_price
      ) {
        const symbol = updated.current_currency || "₹";
        await window.electronAPI?.notify(
          "Price Drop Alert",
          `Price Drop Alert: Item is now ${symbol}${updated.current_price.toFixed(2)}!`
        );
      }
      if (expandedProductId === id) {
        await loadHistory(id);
      }
      setError(null);
    } catch (err) {
      showError("Failed to check product", err);
    } finally {
      setBusyId(null);
    }
  }

  async function onRemoveProduct(id: number) {
    try {
      await api.removeProduct(id);
      setProducts((prev) => prev.filter((p) => p.id !== id));
      setExpandedProductId((prev) => (prev === id ? null : prev));
    } catch (err) {
      showError("Failed to remove product", err);
    }
  }

  async function loadHistory(id: number) {
    try {
      const points = await api.productHistory(id);
      setHistory((prev) => ({ ...prev, [id]: points }));
    } catch (err) {
      showError("Failed to load history", err);
    }
  }

  async function loadWebsiteUpdates(id: number) {
    try {
      const updates = await api.websiteUpdates(id);
      setWebsiteUpdates((prev) => ({ ...prev, [id]: updates }));
    } catch (err) {
      showError("Failed to load website updates", err);
    }
  }

  async function loadWebsiteItems(id: number) {
    setWebsiteItems((prev) => ({ ...prev, [id]: "loading" }));
    try {
      const items = await api.websiteItems(id);
      setWebsiteItems((prev) => ({ ...prev, [id]: items }));
    } catch (err) {
      setWebsiteItems((prev) => ({ ...prev, [id]: "error" }));
      showError("Failed to load website items", err);
    }
  }

  const activeTabLabel = useMemo(
    () => (tab === "website" ? "Website Radar" : "Price Monitor"),
    [tab]
  );

  const calculateAnalytics = (points: PricePoint[]) => {
    if (points.length === 0) return { high: null, low: null, avg: null };
    const prices = points.map((p) => p.price);
    return {
      high: Math.max(...prices),
      low: Math.min(...prices),
      avg: prices.reduce((a, b) => a + b, 0) / prices.length
    };
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 antialiased">
      <div className="mx-auto flex max-w-6xl gap-8 px-6 py-8">
        {/* Sidebar */}
        <aside className="w-56 shrink-0">
          <div className="mb-8 flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-emerald-400" />
            <span className="text-sm font-medium tracking-wide text-neutral-300">Watchdog</span>
          </div>
          <nav className="space-y-1">
            <SidebarItem
              icon={<Globe size={16} />}
              label="Website Radar"
              active={tab === "website"}
              onClick={() => setTab("website")}
            />
            <SidebarItem
              icon={<LineChartIcon size={16} />}
              label="Price Monitor"
              active={tab === "price"}
              onClick={() => setTab("price")}
            />
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 min-w-0">
          <header className="mb-8 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight">{activeTabLabel}</h1>
              <p className="mt-1 text-sm text-neutral-500">
                {tab === "website"
                  ? "Track pages and get AI summaries when they change."
                  : "Watch prices and get notified when they drop."}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs ${
                  serviceUp === true
                    ? "border-emerald-900/60 bg-emerald-950/30 text-emerald-300"
                    : serviceUp === false
                    ? "border-red-900/60 bg-red-950/30 text-red-300"
                    : "border-neutral-800 text-neutral-500"
                }`}
                title={
                  serviceUp === true
                    ? "Backend running on :8765"
                    : serviceUp === false
                    ? "Backend not reachable"
                    : "Checking…"
                }
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    serviceUp === true
                      ? "bg-emerald-400"
                      : serviceUp === false
                      ? "bg-red-400"
                      : "bg-neutral-500"
                  }`}
                />
                {serviceUp === true ? "Running" : serviceUp === false ? "Stopped" : "…"}
              </span>
              {serviceUp !== true && (
                <button
                  onClick={onStartService}
                  disabled={startingService}
                  className="flex items-center gap-1.5 rounded-md bg-emerald-500 px-3 py-1.5 text-sm font-medium text-neutral-950 transition hover:bg-emerald-400 disabled:opacity-60"
                >
                  {startingService ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  {startingService ? "Starting…" : "Start Service"}
                </button>
              )}
              <button
                onClick={refreshAll}
                disabled={serviceUp !== true}
                className="flex items-center gap-2 rounded-md border border-neutral-800 px-3 py-1.5 text-sm text-neutral-400 transition hover:border-neutral-700 hover:text-neutral-100 disabled:opacity-50"
              >
                <RefreshCw size={14} />
                Refresh
              </button>
            </div>
          </header>

          {error && (
            <div className="mb-6 flex items-start gap-3 rounded-md border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-200">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              <div className="flex-1 break-words">{error}</div>
              <button onClick={() => setError(null)} className="text-red-400 hover:text-red-200">
                <X size={14} />
              </button>
            </div>
          )}

          {tab === "website" ? (
            <section>
              <div className="mb-6 flex gap-2">
                <input
                  value={websiteInput}
                  onChange={(e) => setWebsiteInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onAddWebsite()}
                  placeholder="https://example.com/news"
                  className="flex-1 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none transition focus:border-neutral-600"
                />
                <button
                  onClick={onAddWebsite}
                  disabled={adding}
                  className="flex items-center gap-1.5 rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-white disabled:opacity-50"
                >
                  {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Add
                </button>
              </div>

              {websites.length === 0 ? (
                <EmptyState label="No websites tracked yet." />
              ) : (
                <div className="space-y-3">
                  {websites.map((site) => {
                    const isExpanded = expandedWebsiteId === site.id;
                    const updates = websiteUpdates[site.id] ?? [];
                    const busy = busyId === `w-${site.id}`;
                    return (
                      <article
                        key={site.id}
                        className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 transition hover:border-neutral-700"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs text-neutral-500">{site.url}</div>
                            <div className="mt-1.5 text-sm text-neutral-200">
                              {site.summary ?? "No summary yet."}
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <IconButton
                              onClick={() => onCheckWebsite(site.id)}
                              title="Check now"
                              busy={busy}
                            >
                              <RefreshCw size={14} />
                            </IconButton>
                            <IconButton
                              onClick={() => {
                                if (isExpanded) {
                                  setExpandedWebsiteId(null);
                                } else {
                                  setExpandedWebsiteId(site.id);
                                  loadWebsiteUpdates(site.id);
                                  loadWebsiteItems(site.id);
                                }
                              }}
                              title={isExpanded ? "Collapse" : "Expand"}
                            >
                              {isExpanded ? <X size={14} /> : <LineChartIcon size={14} />}
                            </IconButton>
                            <IconButton
                              onClick={() => onRemoveWebsite(site.id)}
                              title="Remove"
                              danger
                            >
                              <Trash2 size={14} />
                            </IconButton>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="mt-4 space-y-4 border-t border-neutral-800 pt-4">
                            <WebsiteItemsPanel
                              state={websiteItems[site.id]}
                              onReload={() => loadWebsiteItems(site.id)}
                            />
                            <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4">
                              <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-neutral-500">
                                Change history
                              </h3>
                              {updates.length === 0 ? (
                                <div className="text-sm text-neutral-500">No changes recorded yet.</div>
                              ) : (
                                <div className="flex gap-2 overflow-x-auto pb-1">
                                  {updates.map((u) => (
                                    <div
                                      key={u.id}
                                      className="w-72 shrink-0 rounded-md border border-neutral-800 bg-neutral-900/50 p-3"
                                    >
                                      <div className="mb-1 text-xs text-neutral-500">
                                        {new Date(u.timestamp).toLocaleString()}
                                      </div>
                                      <div className="text-sm text-neutral-200">{u.update_text}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          ) : (
            <section>
              <div className="mb-6 grid gap-2 md:grid-cols-[1fr_180px_auto]">
                <input
                  value={productInput}
                  onChange={(e) => setProductInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onAddProduct()}
                  placeholder="https://shop.example.com/item"
                  className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none transition focus:border-neutral-600"
                />
                <input
                  value={targetPriceInput}
                  onChange={(e) => setTargetPriceInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && onAddProduct()}
                  placeholder="Target price (optional)"
                  className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder:text-neutral-600 outline-none transition focus:border-neutral-600"
                />
                <button
                  onClick={onAddProduct}
                  disabled={adding}
                  className="flex items-center justify-center gap-1.5 rounded-md bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-900 transition hover:bg-white disabled:opacity-50"
                >
                  {adding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Track
                </button>
              </div>

              {products.length === 0 ? (
                <EmptyState label="No products tracked yet." />
              ) : (
                <div className="space-y-3">
                  {products.map((product) => {
                    const isExpanded = expandedProductId === product.id;
                    const points = history[product.id] ?? [];
                    const analytics = calculateAnalytics(points);
                    const symbol = product.current_currency || "₹";
                    const targetSymbol = product.target_currency || symbol;
                    const busy = busyId === `p-${product.id}`;

                    return (
                      <article
                        key={product.id}
                        className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-4 transition hover:border-neutral-700"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <button
                            type="button"
                            onClick={async () => {
                              if (!isExpanded) await loadHistory(product.id);
                              setExpandedProductId(isExpanded ? null : product.id);
                            }}
                            className="flex min-w-0 flex-1 gap-4 rounded-md text-left transition hover:opacity-90"
                            title={isExpanded ? "Hide graph" : "Show graph"}
                          >
                            {product.image_url ? (
                              <img
                                src={product.image_url}
                                alt=""
                                className="h-16 w-16 shrink-0 rounded-md border border-neutral-800 object-cover"
                                onError={(e) => {
                                  e.currentTarget.style.display = "none";
                                }}
                              />
                            ) : (
                              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-md border border-neutral-800 bg-neutral-950 text-neutral-700">
                                <BellRing size={18} />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs text-neutral-500">{product.url}</div>
                              <div className="mt-1 flex flex-wrap items-baseline gap-3">
                                <div className="text-xl font-semibold text-neutral-100">
                                  {product.current_price !== null
                                    ? `${symbol}${product.current_price.toFixed(2)}`
                                    : "—"}
                                </div>
                                {product.rating !== null && (
                                  <RatingBadge rating={product.rating} count={product.rating_count} />
                                )}
                              </div>
                              <div className="text-xs text-neutral-500">
                                Target:{" "}
                                {product.target_price !== null
                                  ? `${targetSymbol}${product.target_price.toFixed(2)}`
                                  : "not set"}
                              </div>
                            </div>
                          </button>
                          <div
                            className="flex shrink-0 items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <IconButton
                              onClick={() => onCheckProduct(product.id)}
                              title="Check now"
                              busy={busy}
                            >
                              <RefreshCw size={14} />
                            </IconButton>
                            <IconButton
                              onClick={async () => {
                                if (!isExpanded) await loadHistory(product.id);
                                setExpandedProductId(isExpanded ? null : product.id);
                              }}
                              title={isExpanded ? "Hide graph" : "Show graph"}
                            >
                              {isExpanded ? <X size={14} /> : <LineChartIcon size={14} />}
                            </IconButton>
                            <IconButton
                              onClick={() => onRemoveProduct(product.id)}
                              title="Remove"
                              danger
                            >
                              <Trash2 size={14} />
                            </IconButton>
                          </div>
                        </div>

                        {isExpanded && (
                          <div className="mt-4 space-y-4 border-t border-neutral-800 pt-4">
                            {points.length > 0 && analytics.high !== null && analytics.low !== null && analytics.avg !== null && (
                              <>
                                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                                  <StatCard
                                    label="Lowest"
                                    value={`${symbol}${analytics.low.toFixed(2)}`}
                                    tone="good"
                                  />
                                  <StatCard
                                    label="Highest"
                                    value={`${symbol}${analytics.high.toFixed(2)}`}
                                    tone="bad"
                                  />
                                  <StatCard
                                    label="Average"
                                    value={`${symbol}${analytics.avg.toFixed(2)}`}
                                  />
                                  <StatCard
                                    label="Checks"
                                    value={String(points.length)}
                                  />
                                </div>
                                <DealIndicator
                                  current={product.current_price}
                                  low={analytics.low}
                                  high={analytics.high}
                                  target={product.target_price}
                                  symbol={symbol}
                                />
                              </>
                            )}
                            <PriceChart points={points} symbol={symbol} chartId={product.id} />
                            <PriceSummaryRow
                              points={points}
                              current={product.current_price}
                              symbol={symbol}
                              productUrl={product.url}
                            />
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function SidebarItem({
  icon,
  label,
  active,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm transition ${
        active
          ? "bg-neutral-800 text-neutral-100"
          : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-200"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function IconButton({
  children,
  onClick,
  title,
  danger,
  busy
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={busy}
      className={`flex h-8 w-8 items-center justify-center rounded-md border transition disabled:opacity-50 ${
        danger
          ? "border-neutral-800 text-neutral-500 hover:border-red-900 hover:text-red-400"
          : "border-neutral-800 text-neutral-400 hover:border-neutral-700 hover:text-neutral-100"
      }`}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : children}
    </button>
  );
}

function StatCard({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone?: "good" | "bad";
}) {
  const toneClasses =
    tone === "good"
      ? "border-emerald-900/60 bg-emerald-950/30"
      : tone === "bad"
      ? "border-red-900/60 bg-red-950/30"
      : "border-neutral-800 bg-neutral-950";
  const valueClass =
    tone === "good"
      ? "text-emerald-300"
      : tone === "bad"
      ? "text-red-300"
      : "text-neutral-100";
  return (
    <div className={`rounded-md border p-3 ${toneClasses}`}>
      <div className="text-xs uppercase tracking-wider text-neutral-500">{label}</div>
      <div className={`mt-1 text-base font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}

function DealIndicator({
  current,
  low,
  high,
  target,
  symbol
}: {
  current: number | null;
  low: number;
  high: number;
  target: number | null;
  symbol: string;
}) {
  if (current === null) {
    return (
      <div className="rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm text-neutral-400">
        No current price yet — click <span className="text-neutral-200">Check now</span> to record one.
      </div>
    );
  }
  const sameLow = current <= low + 0.001;
  const sameHigh = current >= high - 0.001 && high > low;
  const aboveLow = current - low;
  const offHigh = high - current;
  const hitTarget = target !== null && current <= target;

  let tone = "border-neutral-800 bg-neutral-950 text-neutral-300";
  let icon = "•";
  let message: React.ReactNode;

  if (hitTarget) {
    tone = "border-emerald-900/60 bg-emerald-950/30 text-emerald-200";
    icon = "✓";
    message = (
      <>
        Target hit — now at <strong>{symbol}{current.toFixed(2)}</strong> (you set{" "}
        {symbol}{target!.toFixed(2)}).
      </>
    );
  } else if (sameLow) {
    tone = "border-emerald-900/60 bg-emerald-950/30 text-emerald-200";
    icon = "★";
    message = (
      <>
        Best deal — current price <strong>{symbol}{current.toFixed(2)}</strong> is the lowest
        seen{offHigh > 0 && <> ({symbol}{offHigh.toFixed(2)} below the highest)</>}.
      </>
    );
  } else if (sameHigh) {
    tone = "border-red-900/60 bg-red-950/30 text-red-200";
    icon = "▲";
    message = (
      <>
        Worst price so far — {symbol}{aboveLow.toFixed(2)} above the lowest ({symbol}
        {low.toFixed(2)}). Worth waiting.
      </>
    );
  } else {
    message = (
      <>
        {symbol}{aboveLow.toFixed(2)} above the lowest ({symbol}{low.toFixed(2)}).{" "}
        {target !== null
          ? `${symbol}${(current - target).toFixed(2)} above your target.`
          : "Set a target price to get a drop alert."}
      </>
    );
  }

  return (
    <div className={`flex items-start gap-2 rounded-md border px-4 py-2.5 text-sm ${tone}`}>
      <span className="font-semibold">{icon}</span>
      <span className="flex-1">{message}</span>
    </div>
  );
}

function WebsiteItemsPanel({
  state,
  onReload
}: {
  state: WebsiteItem[] | "loading" | "error" | undefined;
  onReload: () => void;
}) {
  return (
    <div className="flex max-h-96 flex-col rounded-md border border-neutral-800 bg-neutral-950 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-medium uppercase tracking-wider text-neutral-500">
          Recent posts on the page
        </h3>
        <button
          onClick={onReload}
          className="text-xs text-neutral-500 hover:text-neutral-200"
        >
          Reload
        </button>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto">
        {state === "loading" || state === undefined ? (
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <Loader2 size={14} className="animate-spin" />
            Scanning the page…
          </div>
        ) : state === "error" ? (
          <div className="text-sm text-red-300">Couldn't read the page.</div>
        ) : state.length === 0 ? (
          <div className="text-sm text-neutral-500">
            Nothing post-like found on this page.
          </div>
        ) : (
          state.map((item) => (
            <a
              key={item.url}
              href={item.url}
              target="_blank"
              rel="noreferrer"
              className="group flex items-start gap-2 rounded-md border border-neutral-800 p-3 transition hover:border-neutral-700 hover:bg-neutral-900"
            >
              <ExternalLink
                size={12}
                className="mt-1 shrink-0 text-neutral-600 group-hover:text-neutral-300"
              />
              <div className="min-w-0 flex-1">
                <div className="text-sm text-neutral-200 group-hover:text-neutral-50">
                  {item.title}
                </div>
                <div className="truncate text-xs text-neutral-600">{item.url}</div>
              </div>
            </a>
          ))
        )}
      </div>
    </div>
  );
}

function RatingBadge({ rating, count }: { rating: number; count: number | null }) {
  return (
    <div
      className="mt-1 inline-flex items-center gap-1.5 rounded-md border border-amber-900/50 bg-amber-950/30 px-2 py-0.5 text-xs text-amber-200"
      title={count !== null ? `${count.toLocaleString()} ratings` : undefined}
    >
      <Star size={11} className="fill-amber-400 text-amber-400" />
      <span className="font-medium">{rating.toFixed(1)}</span>
      {count !== null && <span className="text-amber-300/60">({count.toLocaleString()})</span>}
    </div>
  );
}

function PriceChart({
  points,
  symbol,
  chartId
}: {
  points: PricePoint[];
  symbol: string;
  chartId: number;
}) {
  const enriched = useMemo(() => {
    let runningMin = Infinity;
    return points.map((p) => {
      runningMin = Math.min(runningMin, p.price);
      return { ...p, minPrice: runningMin };
    });
  }, [points]);

  const fillId = `priceFill-${chartId}`;

  if (points.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center rounded-md border border-neutral-800 bg-neutral-950 p-3 text-sm text-neutral-500">
        No history data yet — click Check now to record a point.
      </div>
    );
  }

  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
      <div className="mb-1 px-1 text-xs font-medium uppercase tracking-wider text-neutral-500">
        Price Graph
      </div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={enriched} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
            <defs>
              <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#262626" strokeDasharray="3 3" />
            <XAxis
              dataKey="timestamp"
              tick={{ fill: "#737373", fontSize: 11 }}
              tickFormatter={(v) =>
                new Date(v).toLocaleString(undefined, {
                  month: "short",
                  day: "numeric"
                })
              }
            />
            <YAxis
              tick={{ fill: "#737373", fontSize: 11 }}
              domain={
                points.length === 1
                  ? [points[0].price * 0.9, points[0].price * 1.1]
                  : ["auto", "auto"]
              }
              tickFormatter={(v) => `${symbol}${Number(v).toLocaleString()}`}
              width={70}
            />
            <Tooltip
              contentStyle={{
                background: "#0a0a0a",
                border: "1px solid #262626",
                borderRadius: 6,
                fontSize: 12
              }}
              labelStyle={{ color: "#a3a3a3" }}
              labelFormatter={(v) =>
                new Date(v).toLocaleString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit"
                })
              }
              formatter={(v: number, name: string) => [`${symbol}${v.toLocaleString()}`, name]}
            />
            <Legend
              iconType="circle"
              wrapperStyle={{ fontSize: 12, color: "#a3a3a3", paddingTop: 8 }}
            />
            <Area
              type="monotone"
              dataKey="price"
              name="Current Price"
              stroke="#3b82f6"
              strokeWidth={2}
              fill={`url(#${fillId})`}
              activeDot={{ r: 5, fill: "#3b82f6" }}
              isAnimationActive={false}
            />
            <Line
              type="stepAfter"
              dataKey="minPrice"
              name="Min Price"
              stroke="#10b981"
              strokeWidth={2}
              strokeDasharray="4 2"
              dot={false}
              activeDot={{ r: 4, fill: "#10b981" }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function PriceSummaryRow({
  points,
  current,
  symbol,
  productUrl
}: {
  points: PricePoint[];
  current: number | null;
  symbol: string;
  productUrl: string;
}) {
  if (points.length === 0) return null;

  const prices = points.map((p) => p.price);
  const lowest = Math.min(...prices);
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const lowestTimestamp = points.find((p) => p.price === lowest)?.timestamp;

  let deltaNote: React.ReactNode = null;
  if (current !== null) {
    const delta = current - lowest;
    if (delta > 0.001) {
      deltaNote = (
        <span className="text-emerald-400">
          (lower than current price by {symbol}
          {delta.toLocaleString(undefined, { maximumFractionDigits: 2 })})
        </span>
      );
    } else {
      deltaNote = <span className="text-emerald-400">(you're at the lowest seen)</span>;
    }
  }

  // Cheap heuristic: how often did the price actually drop between consecutive
  // checks? If never, low chance; if often, high chance.
  let dropChance = 0;
  if (points.length >= 2) {
    let drops = 0;
    for (let i = 1; i < points.length; i++) {
      if (points[i].price < points[i - 1].price) drops++;
    }
    dropChance = Math.round((drops / (points.length - 1)) * 100);
  }
  const verdict =
    dropChance >= 40
      ? { label: "High chance of price drop", tone: "text-amber-300", advice: "Worth waiting a bit." }
      : dropChance >= 15
      ? { label: "Moderate chance", tone: "text-neutral-200", advice: "Could go either way." }
      : { label: "Low chance of price drop", tone: "text-emerald-300", advice: "You can buy now." };

  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-950 p-4">
      <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
        <div>
          <div className="text-xs uppercase tracking-wider text-neutral-500">
            Lowest Price Till Date
          </div>
          <div className="mt-1 text-xl font-semibold text-emerald-300">
            {symbol}
            {lowest.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
          <div className="mt-0.5 text-xs text-neutral-500">
            {lowestTimestamp && new Date(lowestTimestamp).toLocaleDateString()} {deltaNote}
          </div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-neutral-500">Average Price</div>
          <div className="mt-1 text-xl font-semibold text-neutral-100">
            {symbol}
            {avg.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
          <div className="mt-0.5 text-xs text-neutral-500">across {points.length} checks</div>
        </div>
        <div className="flex flex-col items-stretch justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-wider text-neutral-500">
              Price drop chance
            </div>
            <div className={`mt-1 text-sm font-medium ${verdict.tone}`}>
              {dropChance}% — {verdict.label}
            </div>
            <div className="text-xs text-neutral-500">{verdict.advice}</div>
          </div>
          <a
            href={productUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-md bg-orange-500 px-4 py-2 text-sm font-semibold text-neutral-950 transition hover:bg-orange-400"
          >
            <ShoppingCart size={14} />
            Buy It Now
          </a>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center rounded-lg border border-dashed border-neutral-800 py-16 text-sm text-neutral-500">
      {label}
    </div>
  );
}
