import { maxDrawdown, type Dataset, type Metric, type StockFacts } from "./screener";

const BASE = "https://fuyao.aicubes.cn";
const CURRENT_REPORT = "2026-2";
const PREVIOUS_REPORT = "2025-2";
const MAX_STOCKS = 16;

type Envelope<T> = { code: number; message: string; request_id?: string; data: T | null };
type ItemList<T> = { timestamp: number | null; item: T[]; total?: number };
type Constituent = { thscode: string; name: string };
type Valuation = { thscode: string; pe_ttm: number | null };
type Indicator = { index_id: string; value: string | null };
type Financial = { abilities: { indicators: Indicator[] }[] };
type Bar = { date_ms: number; close_price: number };

export class DataError extends Error {
  constructor(message: string, public readonly requestId: string | null = null) { super(message); }
}

async function get<T>(path: string, params: Record<string, string>, key: string): Promise<{ data: T; requestId: string | null }> {
  const url = new URL(path, BASE);
  for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { headers: { "X-api-key": key }, signal: AbortSignal.timeout(12000), cache: "no-store" });
      const body = await response.json() as Envelope<T>;
      if (response.ok && body.code === 0 && body.data !== null) return { data: body.data, requestId: body.request_id ?? null };
      const retryable = response.status === 429 || body.code === 4001 || body.code >= 5000;
      if (!retryable || attempt === 2) throw new DataError(`扶摇接口失败：${body.code ?? response.status} ${body.message ?? "未知错误"}`, body.request_id ?? null);
    } catch (error) {
      if (error instanceof DataError || attempt === 2) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 400 * 2 ** attempt));
  }
  throw new DataError("扶摇接口未返回结果");
}

function metric(value: number | null, unit: Metric["unit"], field: string, period: string, timestamp: number | null, requestId: string | null, note?: string): Metric {
  return { value, unit, source: "同花顺扶摇", field, period, timestamp, requestId, note };
}

function financialMetric(data: Financial, report: string, requestId: string | null): Metric {
  const raw = data.abilities?.flatMap((ability) => ability.indicators ?? []).find((item) => item.index_id === "operating_income_yoy_growth_ratio")?.value;
  const value = raw === null || raw === undefined || raw.trim() === "" ? null : Number(raw);
  return metric(value !== null && Number.isFinite(value) ? value : null, "%", "operating_income_yoy_growth_ratio", report, null, requestId, "接口按百分数值返回；缺失值保留为空");
}

async function stockFacts(stock: Constituent, valuation: Valuation | undefined, valuationTime: number | null, valuationRequest: string | null, key: string, now: number): Promise<StockFacts> {
  const errors: string[] = [];
  const emptyGrowth = metric(null, "%", "operating_income_yoy_growth_ratio", CURRENT_REPORT, null, null);
  const emptyPrevious = metric(null, "%", "operating_income_yoy_growth_ratio", PREVIOUS_REPORT, null, null);
  const facts: StockFacts = {
    code: stock.thscode, name: stock.name,
    metrics: {
      growth: emptyGrowth,
      previousGrowth: emptyPrevious,
      pe: metric(null, "倍", "pe_ttm", "最新估值快照", valuationTime, valuationRequest),
      drawdown: metric(null, "%", "close_price", "近 60 个交易日，前复权", null, null),
    },
    errors,
  };
  const valuationAge = valuationTime === null ? Infinity : now - valuationTime;
  if (valuation && valuationAge <= 14 * 86400000) {
    const pe = valuation.pe_ttm;
    facts.metrics.pe.value = typeof pe === "number" && Number.isFinite(pe) ? pe : null;
  } else {
    errors.push(valuation ? "估值快照时间超过 14 天或时点缺失" : "估值接口未返回该股票");
  }
  const start = now - 150 * 86400000;
  const requests = await Promise.allSettled([
    get<Financial>("/api/a-share/financials/indicators", { thscode: stock.thscode, report: CURRENT_REPORT }, key),
    get<Financial>("/api/a-share/financials/indicators", { thscode: stock.thscode, report: PREVIOUS_REPORT }, key),
    get<ItemList<Bar>>("/api/a-share/prices/historical", { thscode: stock.thscode, interval: "1d", start: String(start), end: String(now), adjust: "forward" }, key),
  ]);
  const [current, previous, history] = requests;
  if (current.status === "fulfilled") facts.metrics.growth = financialMetric(current.value.data, CURRENT_REPORT, current.value.requestId);
  else errors.push(`本期财务数据不可用：${current.reason instanceof Error ? current.reason.message : "未知错误"}`);
  if (previous.status === "fulfilled") facts.metrics.previousGrowth = financialMetric(previous.value.data, PREVIOUS_REPORT, previous.value.requestId);
  else errors.push(`上期财务数据不可用：${previous.reason instanceof Error ? previous.reason.message : "未知错误"}`);
  if (history.status === "fulfilled") {
    const bars = (history.value.data.item ?? []).filter((bar) => Number.isFinite(bar.close_price)).sort((a, b) => a.date_ms - b.date_ms);
    const newest = bars.at(-1)?.date_ms ?? null;
    facts.metrics.drawdown = metric(newest !== null && now - newest <= 14 * 86400000 ? maxDrawdown(bars.map((bar) => bar.close_price)) : null, "%", "close_price", "近 60 个交易日，前复权", newest, history.value.requestId, "逐日取历史峰值，计算最大峰谷跌幅；少于 60 根 K 线时缺失");
    if (newest === null || now - newest > 14 * 86400000) errors.push("历史行情时间超过 14 天或无可用 K 线");
  } else errors.push(`历史行情不可用：${history.reason instanceof Error ? history.reason.message : "未知错误"}`);
  return facts;
}

export async function fetchDataset(universe: string, key: string): Promise<Dataset> {
  const universeName = universe === "000300.SH" ? "沪深 300" : "白酒概念";
  const now = Date.now();
  const constituents = await get<ItemList<Constituent>>("/api/a-share-index/constituents/ths-stock-list", { thscode: universe }, key);
  if (!Array.isArray(constituents.data.item) || constituents.data.item.length === 0) throw new DataError("股票池无可用成分股", constituents.requestId);
  const all = constituents.data.item.filter((item) => /^\d{6}\.(SH|SZ|BJ)$/.test(item.thscode));
  const stocks = all.sort((a, b) => a.thscode.localeCompare(b.thscode)).slice(0, MAX_STOCKS);
  const valuations = await get<ItemList<Valuation>>("/api/a-share/valuations/snapshot", { thscodes: stocks.map((stock) => stock.thscode).join(",") }, key);
  const valuationMap = new Map(valuations.data.item.map((item) => [item.thscode, item]));
  const results: StockFacts[] = [];
  for (let i = 0; i < stocks.length; i += 2) {
    const batch = await Promise.all(stocks.slice(i, i + 2).map((stock) => stockFacts(stock, valuationMap.get(stock.thscode), valuations.data.timestamp, valuations.requestId, key, now)));
    results.push(...batch);
  }
  return {
    universe, universeName, universeTotal: all.length, sampled: stocks.length,
    universeTimestamp: constituents.data.timestamp, fetchedAt: now,
    currentReport: CURRENT_REPORT, previousReport: PREVIOUS_REPORT,
    stocks: results,
    warnings: [
      `当前为 ${universeName} 成分股按股票代码排序的前 ${stocks.length} 只样本，并非全指数筛选。`,
      "估值快照时间为接口批次元数据的最大有效时间，不保证各股票指标完全同步。",
      "财务指标仅采用 2026 半年报和 2025 半年报；未披露或缺失时列为数据不足。",
    ],
  };
}
