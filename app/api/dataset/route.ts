import { DataError, fetchDataset } from "../../../lib/fuyao";
import { serverEnv } from "../../../lib/runtime-env";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const key = await serverEnv("HITHINK_FINANCE_API_KEY");
  if (!key) return Response.json({ error: "服务端尚未配置扶摇 API Key", code: "DATA_KEY_MISSING" }, { status: 503 });
  try {
    const body = await request.json() as { universe?: string };
    const universe = body.universe === "000300.SH" ? "000300.SH" : "885525.TI";
    return Response.json(await fetchDataset(universe, key), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "数据请求失败";
    return Response.json({ error: message, requestId: error instanceof DataError ? error.requestId : null }, { status: 502 });
  }
}
