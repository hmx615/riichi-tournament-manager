import { listCompetitions } from "@/server/competition-repository";

export async function GET() {
  try {
    await listCompetitions();
    return Response.json({ status: "ok" });
  } catch {
    return Response.json({ status: "error" }, { status: 503 });
  }
}
