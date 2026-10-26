import { it } from "node:test";
import assert from "node:assert/strict";
import { DataError, fetchDataset } from "../lib/fuyao";

it("将真实接口形状映射为可追溯字段，并保留部分缺失", async () => {
  const original = globalThis.fetch;
  const now = Date.now();
  const items = Array.from({ length: 16 }, (_, i) => ({ thscode: `${String(i + 1).padStart(6, "0")}.SZ`, name: `样本${i + 1}` }));
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    let data: unknown;
    if (url.pathname.includes("constituents")) data = { timestamp: now, item: items };
    else if (url.pathname.includes("valuations")) data = { timestamp: now, item: items.map((item, i) => ({ thscode: item.thscode, pe_ttm: i === 0 ? null : 20 })) };
    else if (url.pathname.includes("indicators")) data = { abilities: [{ indicators: [{ index_id: "calculate_operating_income_yoy_growth_ratio", value: url.searchParams.get("report") === "2026-2" ? "12.5" : "7.5" }] }] };
    else if (url.pathname.includes("historical")) data = { timestamp: now, item: Array.from({ length: 60 }, (_, i) => ({ date_ms: now - (60 - i) * 86400000, close_price: 10 })) };
    else throw new Error(`Unexpected path ${url.pathname}`);
    return new Response(JSON.stringify({ code: 0, message: "success", request_id: "test-request", data }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  try {
    const dataset = await fetchDataset("885525.TI", "test-secret");
    assert.equal(dataset.sampled, 16);
    assert.equal(dataset.stocks[1].metrics.growth.value, 12.5);
    assert.equal(dataset.stocks[1].metrics.previousGrowth.value, 7.5);
    assert.equal(dataset.stocks[1].metrics.drawdown.value, 0);
    assert.equal(dataset.stocks[1].metrics.pe.requestId, "test-request");
    assert.equal(dataset.stocks[0].metrics.pe.value, null);
  } finally { globalThis.fetch = original; }
});

it("成分股接口报错时保留请求标识并停止生成结果", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ code: 4003, message: "无权限", request_id: "denied-request", data: null }), {
    status: 403, headers: { "Content-Type": "application/json" },
  });
  try {
    await assert.rejects(fetchDataset("885525.TI", "test-secret"), (error: unknown) => {
      assert.ok(error instanceof DataError);
      assert.equal(error.requestId, "denied-request");
      return true;
    });
  } finally { globalThis.fetch = original; }
});
