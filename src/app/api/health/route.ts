import { connection } from "next/server";
import { qlooBackend } from "@/lib/tools/qloo";

// GET /api/health: liveness probe for the host, and it warms the `qloo mcp`
// process so the first real request isn't cold. Never returns secrets.
export async function GET() {
  await connection(); // request-time only: never prerendered at build
  const demo = process.env.CROWDKIT_DEMO === "1";
  if (demo) return Response.json({ ok: true, demo, qloo: "mock" });
  const b = await qlooBackend();
  return Response.json(
    b.mode === "live" ? { ok: true, demo, qloo: "live" } : { ok: true, demo, qloo: "mock", reason: b.reason },
  );
}
