import { isAdmin } from "@/server/auth";
import { listClubRegistrations } from "@/server/club-registration-repository";

function csvCell(value: string) {
  const protectedValue = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

export async function GET() {
  if (!await isAdmin()) return new Response("需要管理员登录", { status: 401 });
  const registrations = await listClubRegistrations();
  const rows = [
    ["提交时间", "学号", "网名", "QQ", "目前段位", "除雀魂外其他平台的最高段位", "雀魂游戏昵称", "雀魂ID", "想得到的资源或提高方向"],
    ...registrations.map((item) => [item.createdAt, item.studentId, item.nickname, item.qq, item.currentRank, item.otherPlatformRank, item.majsoulNickname, item.majsoulId, item.goals]),
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
  const date = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="club-registrations-${date}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
