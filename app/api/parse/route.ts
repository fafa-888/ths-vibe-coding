import { DEFAULT_RULES, validateRules, type RuleConfig } from "../../../lib/screener";
import { serverEnv } from "../../../lib/runtime-env";

export const dynamic = "force-dynamic";

const fields: (keyof RuleConfig)[] = ["growthMin", "growthImprovementMin", "peMin", "peMax", "drawdownMax"];

export function parseResponse(text: string): { rules: RuleConfig; note: string } {
  const cleaned = text.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const parsed = JSON.parse(cleaned) as { rules?: Partial<RuleConfig>; note?: string };
  const rules = { ...DEFAULT_RULES };
  const defaulted: string[] = [];
  for (const field of fields) {
    const value = parsed.rules?.[field];
    if (typeof value === "number" && Number.isFinite(value)) rules[field] = value;
    else defaulted.push(field);
  }
  const errors = validateRules(rules);
  if (errors.length) throw new Error(`模型给出的条件无效：${errors.join("；")}`);
  const candidate = typeof parsed.note === "string" ? parsed.note.trim().slice(0, 200) : "";
  const note = /建议.{0,8}(买入|卖出|建仓|清仓)|保证.{0,8}(收益|上涨)|稳赚|必涨/.test(candidate)
    ? "AI 的说明包含不适合本筛选工具的交易或收益判断，请仅核对下方条件。"
    : candidate || "AI 已给出初步解释，请逐项确认。";
  return { rules, note: defaulted.length ? `${note} 未返回的条件沿用默认值：${defaulted.join("、")}。` : note };
}

export async function POST(request: Request) {
  const [apiKey, model, baseUrl] = await Promise.all([
    serverEnv("AI_API_KEY"), serverEnv("AI_MODEL"), serverEnv("AI_BASE_URL"),
  ]);
  if (!apiKey || !model || !baseUrl) return Response.json({ error: "模型尚未配置。你可以手动调整下方默认条件；配置后可使用“理解意图”。" }, { status: 503 });
  try {
    const { intent } = await request.json() as { intent?: string };
    if (!intent?.trim() || intent.length > 300) return Response.json({ error: "请输入 1–300 字的选股意图" }, { status: 400 });
    const origin = new URL(baseUrl);
    if (origin.protocol !== "https:") return Response.json({ error: "模型 API 地址必须使用 HTTPS" }, { status: 500 });
    const response = await fetch(new URL("chat/completions", origin.href.endsWith("/") ? origin.href : `${origin.href}/`), {
      method: "POST", headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, temperature: 0, max_tokens: 500, messages: [
        { role: "system", content: `你是选股条件解析器。只输出 JSON 对象，不要 Markdown。格式：{"rules":{"growthMin":数字,"growthImprovementMin":数字,"peMin":数字,"peMax":数字,"drawdownMax":数字},"note":"一句话说明歧义、默认解释及未执行的要求"}。仅支持这五个字段。默认值：${JSON.stringify(DEFAULT_RULES)}。growthMin 是 2026 半年报营业收入同比增长率下限，growthImprovementMin 是它相对 2025 半年报同指标提高的百分点下限，peMin/peMax 是最新 PE TTM 区间，drawdownMax 是前复权近 60 交易日最大回撤百分比上限。用户未明确说的阈值使用默认值，并在 note 里标明。用户提出无法映射到五个字段的要求时，在 note 明确列出未执行项。用户要求收益保证、确定性预测或直接买卖建议时，不承诺，说明只能做数据条件筛选。不要生成其他指标或股票结论。` },
        { role: "user", content: intent },
      ] }), signal: AbortSignal.timeout(15000), cache: "no-store",
    });
    const body = await response.json() as { choices?: { message?: { content?: string } }[]; error?: { message?: string } };
    if (!response.ok) throw new Error(`模型接口失败：${response.status} ${body.error?.message ?? ""}`);
    const content = body.choices?.[0]?.message?.content;
    if (!content) throw new Error("模型未返回可用内容");
    return Response.json(parseResponse(content), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "意图解析失败" }, { status: 502 });
  }
}
