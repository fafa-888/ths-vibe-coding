import { writeFile } from "node:fs/promises";

const pages = await (await fetch("http://127.0.0.1:9235/json")).json();
const target = pages.find((page) => page.type === "page" && page.url.includes("stock-intent-lab-1026"));
if (!target) throw new Error("No site page");
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
let nextId = 1;
const pending = new Map();
socket.onmessage = ({ data }) => {
  const message = JSON.parse(data);
  const task = pending.get(message.id);
  if (task) { pending.delete(message.id); message.error ? task.reject(new Error(message.error.message)) : task.resolve(message.result); }
};
function command(method, params = {}) { return new Promise((resolve, reject) => { const id = nextId++; pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }); }
try {
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await command("Runtime.evaluate", { expression: "window.scrollTo(0,0)" });
  await new Promise((resolve) => setTimeout(resolve, 1200));
  const size = await command("Runtime.evaluate", { expression: "({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth})", returnByValue: true });
  const capture = await command("Page.captureScreenshot", { format: "png" });
  await writeFile(new URL("../outputs/public-mobile-cdp.png", import.meta.url), Buffer.from(capture.data, "base64"));
  console.log(JSON.stringify(size.result.value));
} finally { socket.close(); }
