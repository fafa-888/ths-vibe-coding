"use client";

import { useEffect, useMemo, useState } from "react";
import { Activity, ArrowRight, Bookmark, Check, ChevronRight, CircleAlert, Clock3, Database, Info, LoaderCircle, Search, ShieldCheck, SlidersHorizontal, Sparkles, X } from "lucide-react";
import { DEFAULT_RULES, evaluateAll, validateRules, type Dataset, type Metric, type RuleConfig } from "../lib/screener";

type Tab = "all" | "pass" | "fail" | "unknown";
type SavedPlan = { id: string; name: string; input: string; universe: string; rules: RuleConfig; savedAt: number };
const examples = ["经营改善、估值合理、走势相对稳定", "营收增速在改善，市盈率不要太高，近三个月回撤小一些", "找估值适中、基本面向好且走势稳健的股票"];
const statusText = { pass: "符合", fail: "未通过", unknown: "数据不足" };
const format = (v: number | null) => v === null || !Number.isFinite(v) ? "—" : v.toFixed(2);
const date = (v: number | null) => v === null ? "时点缺失" : new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(v);

function NumberField({ label, value, unit, change }: { label: string; value: number; unit: string; change: (v: number) => void }) {
  return <label className="number-field"><span>{label}</span><span className="input-shell"><input type="number" value={value} onChange={(e) => change(Number(e.target.value))}/><em>{unit}</em></span></label>;
}

function Source({ metric }: { metric: Metric }) {
  return <div className="source"><p><strong>原始字段</strong> {metric.field}</p><p><strong>数据来源</strong> {metric.source}</p><p><strong>统计口径</strong> {metric.period} · {metric.unit}</p><p><strong>数据时点</strong> {metric.timestamp ? date(metric.timestamp) : "以报告期为准"}</p>{metric.requestId && <p><strong>请求标识</strong> {metric.requestId}</p>}{metric.note && <p>{metric.note}</p>}</div>;
}

export default function Home() {
  const [intent, setIntent] = useState(examples[0]);
  const [universe, setUniverse] = useState("885525.TI");
  const [rules, setRules] = useState<RuleConfig>(DEFAULT_RULES);
  const [applied, setApplied] = useState<RuleConfig>(DEFAULT_RULES);
  const [previous, setPrevious] = useState<RuleConfig | null>(null);
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [message, setMessage] = useState("");
  const [parseNote, setParseNote] = useState("默认条件是产品对模糊词的初步解释，请在运行前确认。");
  const [plans, setPlans] = useState<SavedPlan[]>([]);
  const [plansOpen, setPlansOpen] = useState(false);
  const [status, setStatus] = useState<{ dataConfigured: boolean; aiConfigured: boolean } | null>(null);
  useEffect(() => {
    try { setPlans(JSON.parse(localStorage.getItem("stock-intent-plans") || "[]")); } catch { /* ignore damaged local storage */ }
    fetch("/api/status").then(async (r) => await r.json() as { dataConfigured: boolean; aiConfigured: boolean }).then(setStatus).catch(() => {});
  }, []);
  const validation = useMemo(() => validateRules(rules), [rules]);
  const results = useMemo(() => dataset ? evaluateAll(dataset, applied) : [], [dataset, applied]);
  const before = useMemo(() => dataset && previous ? new Map(evaluateAll(dataset, previous).map((item) => [item.code, item.state])) : null, [dataset, previous]);
  const counts = useMemo(() => ({ pass: results.filter((item) => item.state === "pass").length, fail: results.filter((item) => item.state === "fail").length, unknown: results.filter((item) => item.state === "unknown").length }), [results]);
  const visible = results.filter((item) => (tab === "all" || item.state === tab) && `${item.name} ${item.code}`.toLowerCase().includes(search.toLowerCase()));
  const detail = results.find((item) => item.code === selected);
  const dirty = JSON.stringify(rules) !== JSON.stringify(applied);
  const change = (field: keyof RuleConfig, value: number) => setRules((old) => ({ ...old, [field]: value }));

  async function parse() {
    setParsing(true); setMessage("");
    try {
      const r = await fetch("/api/parse", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ intent }) });
      const body = await r.json() as { error?: string; rules: RuleConfig; note?: string }; if (!r.ok) throw new Error(body.error || "意图解析失败");
      setRules(body.rules); setParseNote(body.note || "AI 已生成初步条件，请逐项确认。"); setDataset(null); setPrevious(null);
    } catch (e) { setMessage(e instanceof Error ? e.message : "意图解析失败"); }
    finally { setParsing(false); }
  }
  async function run(refresh = false) {
    if (validation.length) { setMessage(validation.join("；")); return; }
    if (!refresh && dataset && dataset.universe === universe) {
      setPrevious(applied); setApplied({ ...rules }); setMessage("已在同一份数据快照上重新计算，请查看结果变化。"); return;
    }
    setLoading(true); setMessage(""); setSelected(null); setPrevious(null);
    try {
      const r = await fetch("/api/dataset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ universe }) });
      const body = await r.json() as Dataset & { error?: string }; if (!r.ok) throw new Error(body.error || "获取数据失败");
      setDataset(body); setApplied({ ...rules }); setTab("all"); setMessage("筛选完成。当前仅覆盖页面标明的指数成分样本。");
    } catch (e) { setMessage(e instanceof Error ? e.message : "筛选失败"); }
    finally { setLoading(false); }
  }
  function save() {
    const plan = { id: crypto.randomUUID(), name: `${universe === "000300.SH" ? "沪深 300" : "白酒概念"} · ${new Date().toLocaleDateString("zh-CN")}`, input: intent, universe, rules: { ...rules }, savedAt: Date.now() };
    const next = [plan, ...plans].slice(0, 10); setPlans(next); localStorage.setItem("stock-intent-plans", JSON.stringify(next)); setMessage("方案已保存在当前浏览器。");
  }
  function load(plan: SavedPlan) { setIntent(plan.input); setUniverse(plan.universe); setRules(plan.rules); setDataset(null); setPrevious(null); setPlansOpen(false); setParseNote("已载入方案。运行时将重新获取金融数据。"); }

  return <div className="app-shell"><aside className="sidebar"><div className="brand"><span><Activity size={21}/></span><div><strong>条件工作台</strong><small>STOCK INTENT LAB</small></div></div><p className="nav-caption">工作空间</p><a href="#workspace" className="nav-link active"><SlidersHorizontal size={17}/>智能选股<ChevronRight size={15}/></a><button className="nav-link" onClick={() => setPlansOpen(true)}><Bookmark size={17}/>已存方案<b>{plans.length}</b></button><div className="sidebar-bottom"><ShieldCheck size={18}/><div>数据驱动的筛选与解释<small>结果仅供研究参考</small></div></div></aside>
    <main id="workspace" className="main"><header className="topbar"><div>工作空间 <ChevronRight size={14}/> <strong>智能选股</strong></div><span className={`connection ${status?.dataConfigured ? "on" : ""}`}><i/>{status === null ? "检查数据连接" : status.dataConfigured ? "金融数据已配置" : "金融数据待配置"}</span></header>
      <div className="content"><section className="hero"><div className="hero-copy"><span className="eyebrow"><Sparkles size={14}/> NATURAL LANGUAGE TO SCREENING RULES</span><h1>把模糊想法，变成<br/><em>可验证的选股条件。</em></h1><p>从一句话出发，检查 AI 的理解，修改指标阈值，再用真实数据验证入选与排除依据。</p></div><div className="hero-art"><div className="orb"/><div className="art-card a">经营改善 <strong>营收同比 ↑</strong></div><div className="art-card b">估值合理 <strong>PE TTM ≤ 35</strong></div><div className="art-card c">走势稳定 <strong>60D 回撤 ≤ 18%</strong></div></div></section>
        <div className="work-grid"><div className="left-column"><div className="heading"><div><span>01</span><h2>描述你的选股意图</h2></div><small>自然语言输入</small></div><div className="intent-box"><textarea aria-label="选股意图" value={intent} maxLength={300} onChange={(e) => setIntent(e.target.value)} placeholder="例如：找经营改善、估值合理、走势相对稳定的股票"/><div><small>{intent.length}/300 字</small><button className="button primary" disabled={!intent.trim() || parsing} onClick={parse}>{parsing ? <LoaderCircle className="spin" size={17}/> : <Sparkles size={17}/>}理解意图<ArrowRight size={16}/></button></div></div><div className="examples"><span>试试这样说</span>{examples.map((item) => <button key={item} onClick={() => setIntent(item)}>{item}</button>)}</div>
          <div className="heading second"><div><span>02</span><h2>确认并调整筛选条件</h2></div><small>可检查 · 可编辑</small></div><div className="interpretation"><Info size={18}/><p>{parseNote}{status?.aiConfigured === false && " 模型尚未配置，当前可手动调整默认条件。"}</p></div><div className="universe"><div><small>筛选范围</small><strong>从明确的股票池开始</strong><p>只评估指数成分股中按代码排序的前 16 只样本。</p></div><select aria-label="股票池" value={universe} onChange={(e) => { setUniverse(e.target.value); setDataset(null); setPrevious(null); }}><option value="885525.TI">白酒概念</option><option value="000300.SH">沪深 300</option></select></div>
          <div className="rule-grid"><article className="rule-card"><div className="rule-icon blue"><Activity size={19}/></div><small>条件 A</small><h3>经营改善</h3><p>比较相同半年报告期的营业收入同比增速。</p><NumberField label="2026 半年报营收同比 ≥" value={rules.growthMin} unit="%" change={(v) => change("growthMin", v)}/><NumberField label="较 2025 半年报增速提高 ≥" value={rules.growthImprovementMin} unit="百分点" change={(v) => change("growthImprovementMin", v)}/><div className="field-note">字段：calculate_operating_income_yoy_growth_ratio</div></article><article className="rule-card"><div className="rule-icon amber"><Database size={19}/></div><small>条件 B</small><h3>估值合理</h3><p>以最新有效市盈率 TTM 为代理指标。</p><NumberField label="市盈率下限 ＞" value={rules.peMin} unit="倍" change={(v) => change("peMin", v)}/><NumberField label="市盈率上限 ≤" value={rules.peMax} unit="倍" change={(v) => change("peMax", v)}/><div className="field-note">负值或缺失值不视作“便宜”</div></article><article className="rule-card"><div className="rule-icon violet"><Activity size={19}/></div><small>条件 C</small><h3>走势相对稳定</h3><p>基于前复权日 K 计算近 60 个交易日最大回撤。</p><NumberField label="最大回撤 ≤" value={rules.drawdownMax} unit="%" change={(v) => change("drawdownMax", v)}/><div className="field-note">历史数据少于 60 根 K 线则标记不足</div></article></div>
          {validation.length > 0 && <div className="validation"><CircleAlert size={17}/>{validation.join("；")}</div>}<div className="run-bar"><div><strong>{dataset && dirty ? "条件已修改" : "条件已准备好"}</strong><small>{dataset && dirty ? "可在同一份数据上比较修改前后结果" : "筛选判断由确定性规则执行"}</small></div><div><button className="button outline" onClick={save}><Bookmark size={16}/>保存方案</button>{dataset && <button className="button outline" disabled={loading} onClick={() => run(true)}>刷新数据</button>}<button className="button dark" disabled={loading || validation.length > 0} onClick={() => run(false)}>{loading ? <LoaderCircle className="spin" size={17}/> : <Search size={17}/>} {loading ? "正在获取真实数据…" : dataset ? dirty ? "应用调整" : "按当前快照计算" : "运行筛选"}<ArrowRight size={16}/></button></div></div>{message && <div className="message" role="status"><Info size={16}/>{message}<button onClick={() => setMessage("")} aria-label="关闭"><X size={15}/></button></div>}
        </div><aside className="right-column"><div className="help-card"><span className="card-kicker"><Database size={17}/> 方法说明</span><h3>一条能被复核的链路</h3>{[["理解意图", "将模糊词映射为指标与阈值，等待你确认。"],["获取事实", "从扶摇接口读取成分、财务、估值与日 K 数据。"],["执行判断", "程序逐项判断，AI 不决定股票是否入选。"],["解释差异", "呈现通过、未通过、数据不足及调整影响。"]].map(([title, body], i) => <div className="help-step" key={title}><span>{i + 1}</span><div><strong>{title}</strong><p>{body}</p></div></div>)}</div><div className="help-card compact"><span className="card-kicker"><ShieldCheck size={17}/> 数据原则</span><p>每个判断保留来源、报告期或行情日期、单位与原始字段。失败和缺失会明确标记。</p><a href="https://fuyao.aicubes.cn/docs/" target="_blank" rel="noreferrer">查看扶摇数据文档 →</a></div></aside></div>
        <section className="results"><div className="heading"><div><span>03</span><h2>查看筛选结果与依据</h2></div>{dataset && <small><Clock3 size={14}/>抓取于 {date(dataset.fetchedAt)}</small>}</div>{!dataset ? <div className="empty"><span><Search size={27}/></span><h3>真实数据结果将在这里出现</h3><p>确认条件并运行筛选后，可核对逐条判断依据、数据时点及缺失情况。</p></div> : <><div className="scope"><Info size={18}/><div><strong>本次范围：{dataset.universeName} · {dataset.sampled}/{dataset.universeTotal} 只成分样本</strong><p>成分数据时间：{date(dataset.universeTimestamp)}。按代码排序取前 {dataset.sampled} 只，名单不代表全指数。</p></div></div><div className="stats"><div><span>符合全部条件</span><strong>{counts.pass}<small>只</small></strong><p>数据完整且逐项通过</p></div><div><span>至少一项未通过</span><strong>{counts.fail}<small>只</small></strong><p>可查看具体排除条件</p></div><div><span>数据不足</span><strong>{counts.unknown}<small>只</small></strong><p>不能据此判断符合</p></div></div>{before && <div className="comparison"><strong>条件变化影响</strong><span>新增符合 {results.filter((r) => r.state === "pass" && before.get(r.code) !== "pass").length} 只 · 移出符合 {results.filter((r) => r.state !== "pass" && before.get(r.code) === "pass").length} 只 · 保持符合 {results.filter((r) => r.state === "pass" && before.get(r.code) === "pass").length} 只</span></div>}
          <div className="result-grid"><div className="result-list"><div className="list-tools"><div className="tabs">{(["all","pass","fail","unknown"] as Tab[]).map((t) => <button className={tab === t ? "selected" : ""} key={t} onClick={() => setTab(t)}>{t === "all" ? "全部" : statusText[t]} <span>{t === "all" ? results.length : counts[t]}</span></button>)}</div><label className="list-search"><Search size={15}/><input aria-label="搜索股票" placeholder="名称 / 代码" value={search} onChange={(e) => setSearch(e.target.value)}/></label></div>{visible.length ? visible.map((stock) => <button className={`stock ${selected === stock.code ? "selected" : ""}`} onClick={() => setSelected(stock.code)} key={stock.code}><div className="stock-name"><strong>{stock.name}</strong><small>{stock.code}</small></div><div className="stock-metrics"><span>营收同比 <b>{format(stock.metrics.growth.value)}%</b></span><span>PE <b>{format(stock.metrics.pe.value)}</b></span><span>回撤 <b>{format(stock.metrics.drawdown.value)}%</b></span></div><span className={`pill ${stock.state}`}>{statusText[stock.state]}</span><ChevronRight size={16}/></button>) : <div className="no-match">当前条件下没有匹配的股票</div>}</div><div className="detail">{detail ? <><div className="detail-head"><div><small>个股判断详情</small><h3>{detail.name} <span>{detail.code}</span></h3></div><span className={`pill ${detail.state}`}>{statusText[detail.state]}</span></div><p className="detail-desc">{detail.state === "pass" ? "当前全部条件均通过。" : detail.state === "fail" ? `未通过：${detail.rules.filter((r) => r.state === "fail").map((r) => r.label).join("、")}。` : "尚有缺失数据，无法确认是否符合全部条件。"}</p>{detail.rules.map((rule) => <div className="check-row" key={rule.id}><div><span className={`check-icon ${rule.state}`}>{rule.state === "pass" ? <Check size={13}/> : rule.state === "fail" ? <X size={13}/> : <Info size={13}/>}</span><strong>{rule.label}</strong><em>{statusText[rule.state]}</em></div><p>实际 {format(rule.actual)}{rule.actual === null ? "" : rule.id === "pe" ? " 倍" : rule.id === "improvement" ? " 个百分点" : "%"} · 条件 {rule.threshold}</p><details><summary>查看原始字段与口径</summary><Source metric={rule.metric}/></details></div>)}{detail.errors.length > 0 && <div className="detail-errors"><CircleAlert size={16}/><div>{detail.errors.map((error) => <p key={error}>{error}</p>)}</div></div>}</> : <div className="detail-empty"><Database size={25}/><h3>选择一只股票</h3><p>查看逐项判断、原始字段、单位和数据时点。</p></div>}</div></div><div className="footnotes"><strong>数据口径与限制</strong>{dataset.warnings.map((w) => <p key={w}>· {w}</p>)}<p>· “符合”仅表示满足设定的数据条件，不构成收益预测或投资建议。</p></div></>}</section><footer>选股条件工作台 · 数据事实与筛选推断分离 · 非投资建议</footer></div></main>
    {plansOpen && <div className="overlay" onClick={() => setPlansOpen(false)}><div className="modal" role="dialog" aria-modal="true" aria-label="已保存方案" onClick={(e) => e.stopPropagation()}><div className="modal-title"><div><small>本地工作空间</small><h2>已保存的方案</h2></div><button onClick={() => setPlansOpen(false)} aria-label="关闭"><X size={20}/></button></div><p>仅保存在当前浏览器。载入后会重新获取金融数据。</p>{plans.length ? plans.map((plan) => <button className="plan" key={plan.id} onClick={() => load(plan)}><span><strong>{plan.name}</strong><small>{plan.input}</small></span><ArrowRight size={17}/></button>) : <div className="no-plans"><Bookmark size={24}/>还没有保存的方案</div>}</div></div>}
  </div>;
}
