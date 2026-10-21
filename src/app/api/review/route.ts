import { cached } from "@/lib/cache";
import type { Layout } from "@/lib/layout";
import { ReviewRequestSchema, reviewLayout, rulesOnlyReview } from "@/lib/review";

export const maxDuration = 120;

// POST /api/review  body: ReviewRequest -> { review, source: "ai" | "rules" }
// One Gemini request per new layout; identical layouts are served from the cache.
export async function POST(request: Request) {
  const parsed = ReviewRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid layout" }, { status: 400 });
  const req = parsed.data;

  if (process.env.CROWDKIT_DEMO === "1" || !process.env.GEMINI_API_KEY) {
    return Response.json({ review: rulesOnlyReview(req.layout as Layout, req.event.attendance), source: "rules" });
  }
  try {
    const { value } = await cached("layout-review", req, () => reviewLayout(req));
    return Response.json({ review: value, source: "ai" });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : String(err);
    // Still useful without the AI: fall back to the fixed checks.
    return Response.json({ review: rulesOnlyReview(req.layout as Layout, req.event.attendance), source: "rules", warning: `AI review unavailable: ${message.slice(0, 200)}` });
  }
}
