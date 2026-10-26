export type RuleConfig = {
  growthMin: number;
  growthImprovementMin: number;
  peMin: number;
  peMax: number;
  drawdownMax: number;
};

export type Metric = {
  value: number | null;
  unit: "%" | "倍";
  source: string;
  field: string;
  period: string;
  timestamp: number | null;
  requestId: string | null;
  note?: string;
};

export type StockFacts = {
  code: string;
  name: string;
  metrics: {
    growth: Metric;
    previousGrowth: Metric;
    pe: Metric;
    drawdown: Metric;
  };
  errors: string[];
};

export type Dataset = {
  universe: string;
  universeName: string;
  universeTotal: number;
  sampled: number;
  universeTimestamp: number | null;
  fetchedAt: number;
  currentReport: string;
  previousReport: string;
  stocks: StockFacts[];
  warnings: string[];
};

export type RuleResult = {
  id: "growth" | "improvement" | "pe" | "drawdown";
  label: string;
  state: "pass" | "fail" | "unknown";
  actual: number | null;
  threshold: string;
  metric: Metric;
};

export type StockResult = StockFacts & {
  state: "pass" | "fail" | "unknown";
  rules: RuleResult[];
};

export const DEFAULT_RULES: RuleConfig = {
  growthMin: 0,
  growthImprovementMin: 0,
  peMin: 0,
  peMax: 35,
  drawdownMax: 18,
};

export function validateRules(rules: RuleConfig): string[] {
  const errors: string[] = [];
  for (const [key, value] of Object.entries(rules)) {
    if (!Number.isFinite(value)) errors.push(`${key} 必须是有限数字`);
  }
  if (rules.peMin >= rules.peMax) errors.push("市盈率下限必须小于上限");
  if (rules.drawdownMax < 0 || rules.drawdownMax > 100) errors.push("最大回撤阈值必须在 0–100% 之间");
  if (rules.peMin < 0) errors.push("市盈率下限不得小于 0；负市盈率不纳入本口径");
  return errors;
}

function judge(id: RuleResult["id"], label: string, metric: Metric, pass: (value: number) => boolean, threshold: string): RuleResult {
  return { id, label, metric, actual: metric.value, threshold, state: metric.value === null ? "unknown" : pass(metric.value) ? "pass" : "fail" };
}

export function evaluate(stock: StockFacts, config: RuleConfig): StockResult {
  const growth = stock.metrics.growth;
  const previous = stock.metrics.previousGrowth;
  const improvement: Metric = {
    value: growth.value === null || previous.value === null ? null : growth.value - previous.value,
    unit: "%",
    source: "由两期扶摇财务指标计算",
    field: "calculate_operating_income_yoy_growth_ratio 差值",
    period: `${growth.period} 对比 ${previous.period}`,
    timestamp: growth.timestamp,
    requestId: growth.requestId,
    note: "单位为百分点；仅比较相同半年报告期的同比增速",
  };
  const rules: RuleResult[] = [
    judge("growth", "营收同比增长", growth, (v) => v >= config.growthMin, `≥ ${config.growthMin}%`),
    judge("improvement", "营收增速改善", improvement, (v) => v >= config.growthImprovementMin, `≥ ${config.growthImprovementMin} 个百分点`),
    judge("pe", "市盈率 TTM", stock.metrics.pe, (v) => v > config.peMin && v <= config.peMax, `> ${config.peMin} 且 ≤ ${config.peMax} 倍`),
    judge("drawdown", "近 60 个交易日最大回撤", stock.metrics.drawdown, (v) => v <= config.drawdownMax, `≤ ${config.drawdownMax}%`),
  ];
  const state = rules.some((rule) => rule.state === "fail") ? "fail" : rules.some((rule) => rule.state === "unknown") ? "unknown" : "pass";
  return { ...stock, rules, state };
}

export function evaluateAll(dataset: Dataset, config: RuleConfig): StockResult[] {
  return dataset.stocks.map((stock) => evaluate(stock, config));
}

export function maxDrawdown(closes: number[]): number | null {
  if (closes.length < 60 || closes.some((price) => !Number.isFinite(price) || price <= 0)) return null;
  let peak = closes[closes.length - 60];
  let worst = 0;
  for (const close of closes.slice(-60)) {
    peak = Math.max(peak, close);
    worst = Math.max(worst, (peak - close) / peak);
  }
  return worst * 100;
}
