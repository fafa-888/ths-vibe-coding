import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_RULES, evaluate, maxDrawdown, validateRules, type Metric, type StockFacts } from "../lib/screener";

const metric = (value: number | null, unit: Metric["unit"]): Metric => ({ value, unit, source: "fixture", field: "fixture", period: "2026-2", timestamp: null, requestId: null });
const stock = (values: [number | null, number | null, number | null, number | null]): StockFacts => ({
  code: "000001.SZ", name: "测试标的", errors: [],
  metrics: { growth: metric(values[0], "%"), previousGrowth: metric(values[1], "%"), pe: metric(values[2], "倍"), drawdown: metric(values[3], "%") },
});

describe("确定性筛选引擎", () => {
  it("全部条件满足时通过", () => assert.equal(evaluate(stock([12, 5, 20, 10]), DEFAULT_RULES).state, "pass"));
  it("任何可验证条件失败时排除，并保留失败原因", () => {
    const result = evaluate(stock([12, 5, 45, 10]), DEFAULT_RULES);
    assert.equal(result.state, "fail");
    assert.equal(result.rules.find((r) => r.id === "pe")?.state, "fail");
  });
  it("关键值缺失时标为数据不足，不补零", () => {
    const result = evaluate(stock([null, 5, 20, 10]), DEFAULT_RULES);
    assert.equal(result.state, "unknown");
    assert.equal(result.rules.find((r) => r.id === "improvement")?.actual, null);
  });
  it("上限低于下限时阻止筛选", () => assert.ok(validateRules({ ...DEFAULT_RULES, peMin: 40, peMax: 10 }).length));
  it("最大回撤使用 60 个收盘价和区间内峰值", () => {
    assert.equal(maxDrawdown(Array(59).fill(10)), null);
    assert.ok(Math.abs((maxDrawdown([...Array(58).fill(10), 12, 9]) ?? 0) - 25) < 1e-9);
  });
});
