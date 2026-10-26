import { writeFile } from "node:fs/promises";

const pages = await (await fetch("http://127.0.0.1:9235/json")).json();
const target = pages.find((page) => page.type === "page" && page.url.includes("stock-intent-lab-1026"));
if (!target) throw new Error("No browser page");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let nextId = 1;
const pending = new Map();
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (!message.id) return;
  const promise = pending.get(message.id);
  if (promise) { pending.delete(message.id); message.error ? promise.reject(new Error(message.error.message)) : promise.resolve(message.result); }
};
function command(method, params = {}) {
  return new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); });
}
async function evaluate(expression) {
  let result;
  try { result = await command("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }); }
  catch (error) { throw new Error(`${expression}: ${error.message}`); }
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function waitFor(expression, timeout = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out: ${expression}`);
}
try {
  await command("Page.navigate", { url: "https://stock-intent-lab-1026.alivehen130.chatgpt.site/" });
  await waitFor("document.querySelector('textarea') && document.body.innerText.includes('金融数据已配置')");
  await evaluate("[...document.querySelectorAll('button')].find(x => x.textContent.includes('理解意图')).click()");
  await waitFor("document.querySelector('.interpretation') && !document.querySelector('.interpretation').innerText.includes('默认条件是产品')", 25000);
  await evaluate("[...document.querySelectorAll('button')].find(x => x.textContent.includes('运行筛选'))?.click()");
  await waitFor("document.querySelector('.stats') && document.querySelectorAll('.stock').length > 0", 60000);
  const result = await evaluate("({scope:document.querySelector('.scope')?.innerText,stats:document.querySelector('.stats')?.innerText,stocks:document.querySelectorAll('.stock').length,first:document.querySelector('.stock')?.innerText})");
  await evaluate("document.querySelector('.stock').click()");
  await waitFor("Boolean(document.querySelector('.detail-head'))");
  const detail = await evaluate("({name:document.querySelector('.detail-head')?.innerText,checks:document.querySelectorAll('.check-row').length})");
  await evaluate("(() => { const el=document.querySelectorAll('.rule-card')[1].querySelectorAll('input')[1]; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,'20'); el.dispatchEvent(new Event('input',{bubbles:true})); return true; })()");
  await waitFor("[...document.querySelectorAll('.run-bar button')].some(x=>x.innerText.includes('应用调整'))");
  await evaluate("[...document.querySelectorAll('.run-bar button')].find(x=>x.innerText.includes('应用调整')).click()");
  await waitFor("Boolean(document.querySelector('.comparison'))");
  const comparison = await evaluate("document.querySelector('.comparison')?.innerText");
  await evaluate("[...document.querySelectorAll('.run-bar button')].find(x=>x.innerText.includes('保存方案')).click()");
  await waitFor("document.body.innerText.includes('方案已保存在当前浏览器')");
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await evaluate("window.scrollTo(0,0)");
  await new Promise((resolve) => setTimeout(resolve, 700));
  const mobile = await evaluate("({clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth})");
  const capture = await command("Page.captureScreenshot", { format: "png" });
  await writeFile(new URL("../outputs/public-mobile-cdp.png", import.meta.url), Buffer.from(capture.data, "base64"));
  console.log(JSON.stringify({ result, detail, comparison, saved: await evaluate("document.body.innerText.includes('方案已保存在当前浏览器')"), mobile }));
} finally { socket.close(); }

