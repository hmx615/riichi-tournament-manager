import "server-only";

export function usesD1Storage() {
  return process.env.STORAGE_BACKEND === "d1";
}

export async function tournamentDatabase() {
  if (!usesD1Storage()) throw new Error("D1 存储未启用");
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const { env } = await getCloudflareContext({ async: true });
  if (!env.TOURNAMENT_DB) throw new Error("Cloudflare D1 绑定 TOURNAMENT_DB 未配置");
  return env.TOURNAMENT_DB;
}
