import { serverEnv } from "../../../lib/runtime-env";

export const dynamic = "force-dynamic";

export async function GET() {
  const [fuyao, apiKey, model, baseUrl] = await Promise.all([
    serverEnv("HITHINK_FINANCE_API_KEY"), serverEnv("AI_API_KEY"), serverEnv("AI_MODEL"), serverEnv("AI_BASE_URL"),
  ]);
  return Response.json({
    dataConfigured: Boolean(fuyao),
    aiConfigured: Boolean(apiKey && model && baseUrl),
  }, { headers: { "Cache-Control": "no-store" } });
}
