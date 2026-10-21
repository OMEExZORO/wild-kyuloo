import { z } from "zod";
import { generate } from "./gemini";
import { areaName, geocode } from "./tools/geo";
import { callQloo, collectNames, lookupAct, type QlooEnvelope } from "./tools/qloo";
import { cleanSchema } from "./tools/tool";
import type { Receipt } from "./types";

// "Fill the room": for a show with seats left, where does this crowd hang out,
// which local places should get posters, which podcasts to pitch, and what to post.
// Code computes (Qloo picks every place, area and podcast); the model only words
// the captions and the street-team brief.

export const PromoRequestSchema = z.object({
  act: z.string().min(2),
  actId: z.string().optional(),
  venue: z.string().min(2),
  date: z.string(),
  attendance: z.number(),
  center: z.tuple([z.number(), z.number()]).nullable().optional(),
  crowd: z.string().max(1500).optional().describe("The plan's Qloo crowd profile, used to make captions specific"),
});
export type PromoRequest = z.infer<typeof PromoRequestSchema>;

export interface Promo {
  city: string;
  hotspots: { lat: number; lon: number; area: string; affinity: number; lift: number; receipt: string }[];
  partners: { name: string; address?: string; neighbourhood?: string; receipt: string }[];
  podcasts: { name: string; receipt: string }[];
  captions: string[];
  streetTeam: string;
  receipts: Receipt[];
  limitations: string[];
}

// Local places that take posters and flyers.
const PARTNER_TAGS = [
  "urn:tag:category:place:cafe",
  "urn:tag:category:place:bar",
  "urn:tag:category:place:book_store",
  "urn:tag:category:place:record_store",
  "urn:tag:category:place:vintage_clothing_store",
];

const CopySchema = z.object({
  captions: z.array(z.string()).min(1).max(3).describe("Three short social captions, under 200 characters each"),
  streetTeam: z.string().describe("Three or four sentences telling the street team where to go and what to say"),
});

export async function buildPromo(req: PromoRequest): Promise<Promo> {
  const receipts: Receipt[] = [];
  const limitations: string[] = [];
  const call = async (tool: string, args: Record<string, unknown>): Promise<[QlooEnvelope | null, string]> => {
    const env = await callQloo(tool, args);
    const id = `P${receipts.length + 1}`; // "P" so promo receipts never clash with the plan's Q1, Q2...
    receipts.push({ id, tool, input: args, status: env?.status ?? "unavailable", summary: env?.summary ?? "", names: env ? collectNames(env.results).slice(0, 12) : [] });
    return [env, id];
  };

  // Where: the venue's city, as "City, Region" (Qloo resolves neighbourhoods and coordinates badly).
  const g = ((await geocode(req.venue)).data as { lat: number; lon: number; city?: string; region?: string; country?: string }[])[0];
  const cityName = g?.city ?? req.venue.split(",").pop()!.trim();
  const city = [cityName, g?.region ?? g?.country].filter(Boolean).join(", ");

  // Who: the act's Qloo ID (confirmed in the form, or looked up now).
  const actId = req.actId || (await lookupAct(req.act)).match?.id || req.act;

  const [[heat, heatId], [places, placesId], [pods, podsId]] = await Promise.all([
    call("qloo_where_popular", { entity: actId, within: city, limit: 15 }),
    call("qloo_recommend", { target_type: "place", signals: [actId], filter_location: city, include_tags: PARTNER_TAGS, include_tags_operator: "union", limit: 12 }),
    call("qloo_recommend", { target_type: "podcast", signals: [actId], limit: 6 }),
  ]);

  // Hot spots: raw heat mostly follows how busy an area is, so rank by how much this
  // crowd's affinity exceeds the area's general popularity.
  const tiles = (Array.isArray(heat?.results) ? heat.results : []) as { location?: { latitude: number; longitude: number }; query?: { affinity_rank?: number; affinity?: number; popularity?: number } }[];
  const scored = tiles
    .filter((t) => t.location)
    .map((t) => ({ lat: t.location!.latitude, lon: t.location!.longitude, affinity: t.query?.affinity_rank ?? t.query?.affinity ?? 0, lift: (t.query?.affinity_rank ?? 0) - (t.query?.popularity ?? 0) }))
    .sort((a, b) => b.lift - a.lift)
    .slice(0, 5);
  const hotspots: Promo["hotspots"] = [];
  for (const t of scored) {
    // Nominatim asks for at most one request per second.
    const area = (await areaName(t.lat, t.lon).catch(() => null)) ?? `Area near ${t.lat.toFixed(3)}, ${t.lon.toFixed(3)}`;
    if (!hotspots.some((h) => h.area === area)) hotspots.push({ ...t, area, receipt: heatId });
    await new Promise((r) => setTimeout(r, 1100));
  }
  if (!hotspots.length) limitations.push("Qloo had no neighbourhood heat data for this act in this city.");
  limitations.push("Hot spots compare this crowd's affinity with how busy each area is in general; they are a starting point for the street team, not a guarantee of sales.");

  const partners: Promo["partners"] = ((Array.isArray(places?.results) ? places.results : []) as { name?: string; properties?: { address?: string; geocode?: { name?: string } } }[])
    .filter((p) => p.name)
    .map((p) => ({ name: p.name!, address: p.properties?.address, neighbourhood: p.properties?.geocode?.name, receipt: placesId }));
  const podcasts = collectNames(pods?.results ?? []).slice(0, 6).map((name) => ({ name, receipt: podsId }));
  if (!partners.length) limitations.push("Qloo returned no partner places for this city.");

  // Words: one Gemini request, grounded only in what Qloo returned.
  let captions: string[] = [];
  let streetTeam = "";
  try {
    const { res } = await generate(() => ({
      contents: [
        `Show: ${req.act} at ${req.venue} on ${req.date}. Tickets are still available.`,
        `What this crowd over-indexes on (from Qloo, via the plan): ${req.crowd || "unknown"}.`,
        `Neighbourhoods where the crowd stands out: ${hotspots.map((h) => h.area).join(", ") || "unknown"}.`,
        `Local places to drop posters: ${partners.slice(0, 8).map((p) => p.name).join(", ") || "none found"}.`,
        `Podcasts to pitch: ${podcasts.map((p) => p.name).join(", ") || "none found"}.`,
      ].join("\n"),
      config: {
        systemInstruction:
          "You write promotion copy for a live show with seats left. Use only the facts given. Each caption must speak to something this crowd over-indexes on (a taste, a place type, a scene), not just repeat the date and venue. Short, warm, at most two hashtags, no invented quotes, prices or discounts. Never write in the artist's voice.",
        responseMimeType: "application/json",
        responseJsonSchema: cleanSchema(z.toJSONSchema(CopySchema)),
        maxOutputTokens: 2048,
      },
    }));
    const parsed = CopySchema.safeParse(JSON.parse(res.text ?? "{}"));
    if (parsed.success) ({ captions, streetTeam } = parsed.data);
  } catch {
    // fall through to the plain template
  }
  if (!captions.length) {
    captions = [`${req.act} live at ${req.venue}, ${req.date}. A few tickets left.`];
    streetTeam = `Start in ${hotspots[0]?.area ?? cityName}, drop posters at ${partners.slice(0, 3).map((p) => p.name).join(", ") || "local cafés and record stores"}.`;
    limitations.push("Captions are a plain template (the AI writer was unavailable).");
  }

  return { city, hotspots, partners, podcasts, captions, streetTeam, receipts, limitations };
}
