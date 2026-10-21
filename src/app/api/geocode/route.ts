import { geocode } from "@/lib/tools/geo";

// GET /api/geocode?q=The%20Fillmore,%20San%20Francisco -> { lat, lon, name } | 404
// Used by the site map when the plan has no venue coordinates.
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) return Response.json({ error: "Enter a venue" }, { status: 400 });
  try {
    const r = await geocode(q);
    const first = (r.data as { lat: number; lon: number; displayName: string }[])[0];
    if (!first) return Response.json({ error: "Venue not found" }, { status: 404 });
    return Response.json({ lat: first.lat, lon: first.lon, name: first.displayName });
  } catch {
    return Response.json({ error: "Lookup failed" }, { status: 502 });
  }
}
