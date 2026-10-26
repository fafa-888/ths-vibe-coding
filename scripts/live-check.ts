import { POST as parseIntent } from "../app/api/parse/route";
import { fetchDataset } from "../lib/fuyao";
import { DEFAULT_RULES, evaluateAll } from "../lib/screener";

async function main() {
  const response = await parseIntent(new Request("http://localhost/api/parse", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ intent: "营收增长超过 10%，市盈率低于 30 倍，近 60 日回撤不超过 15%" }),
  }));
  const parsed = await response.json();
  console.log(JSON.stringify({ check: "qwen", status: response.status, result: parsed }));

  const key = process.env.HITHINK_FINANCE_API_KEY;
  if (!key) throw new Error("HITHINK_FINANCE_API_KEY missing");
  const data = await fetchDataset("885525.TI", key);
  const results = evaluateAll(data, DEFAULT_RULES);
  const samplePass = results.find((stock) => stock.state === "pass");
  console.log(JSON.stringify({
    check: "fuyao", universe: data.universe, total: data.universeTotal, sampled: data.sampled,
    counts: { pass: results.filter((x) => x.state === "pass").length, fail: results.filter((x) => x.state === "fail").length, unknown: results.filter((x) => x.state === "unknown").length },
    firstStock: data.stocks[0] && {
      code: data.stocks[0].code, growth: data.stocks[0].metrics.growth.value,
      previousGrowth: data.stocks[0].metrics.previousGrowth.value,
      pe: data.stocks[0].metrics.pe.value, drawdown: data.stocks[0].metrics.drawdown.value,
      requestIds: [data.stocks[0].metrics.growth.requestId, data.stocks[0].metrics.previousGrowth.requestId, data.stocks[0].metrics.pe.requestId, data.stocks[0].metrics.drawdown.requestId],
      errors: data.stocks[0].errors,
    },
    samplePass: samplePass && {
      code: samplePass.code, name: samplePass.name,
      metrics: samplePass.metrics, improvement: samplePass.rules.find((rule) => rule.id === "improvement")?.actual,
    },
  }));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
