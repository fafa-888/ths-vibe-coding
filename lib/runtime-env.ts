/** Read server-only values from Cloudflare bindings, with Node support for local checks. */
export async function serverEnv(name: string): Promise<string | undefined> {
  const local = process.env[name];
  if (local) return local;
  try {
    const { env } = await import("cloudflare:workers");
    const value = (env as Record<string, unknown>)[name];
    return typeof value === "string" && value ? value : undefined;
  } catch {
    return undefined;
  }
}
