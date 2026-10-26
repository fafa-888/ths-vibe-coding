export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    dataConfigured: Boolean(process.env.HITHINK_FINANCE_API_KEY),
    aiConfigured: Boolean(process.env.AI_API_KEY && process.env.AI_MODEL && process.env.AI_BASE_URL),
  }, { headers: { "Cache-Control": "no-store" } });
}
