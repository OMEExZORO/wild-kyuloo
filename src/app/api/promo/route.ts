import { cached } from "@/lib/cache";
import { buildPromo, PromoRequestSchema } from "@/lib/promo";

export const maxDuration = 120;

// POST /api/promo  body: PromoRequest -> Promo
// A handful of Qloo calls plus one Gemini request; repeated requests come from the cache.
export async function POST(request: Request) {
  const parsed = PromoRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid request" }, { status: 400 });
  if (process.env.CROWDKIT_DEMO === "1") {
    return Response.json({ error: "Fill the room needs live Qloo data (demo mode is on)." }, { status: 503 });
  }
  try {
    const { value } = await cached("promo-v3", parsed.data, () => buildPromo(parsed.data));
    return Response.json(value);
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Couldn't build the promo plan right now. Try again in a moment." }, { status: 502 });
  }
}
