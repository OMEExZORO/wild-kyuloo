/* eslint-disable @typescript-eslint/no-explicit-any -- parses untyped third-party JSON */
import { cached } from "../cache";
import type { ToolResult } from "../types";

// Free, keyless data sources: Nominatim (geocoding), Overpass (OpenStreetMap
// features around the venue) and Open-Meteo (weather). Be polite: Nominatim
// asks for a real User-Agent and at most 1 request per second.

const UA = "CrowdKit/0.1 (Qloo Agentic Hackathon; github.com/inslot2525-ctrl/wild-kyuloo)";

export async function geocode(query: string): Promise<ToolResult> {
  const { value, hit } = await cached("geocode-v2", query, async () => {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("limit", "3");
    url.searchParams.set("addressdetails", "1");
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`Nominatim ${res.status}`);
    const rows = (await res.json()) as any[];
    return rows.map((r) => ({
      name: r.name,
      displayName: r.display_name,
      lat: Number(r.lat),
      lon: Number(r.lon),
      kind: `${r.category}/${r.type}`,
      countryCode: r.address?.country_code,
      city: r.address?.city ?? r.address?.town ?? r.address?.village,
      region: r.address?.state ?? r.address?.county,
      country: r.address?.country,
    }));
  });
  return { data: value, source: "osm", cached: hit };
}

const OVERPASS_GROUPS: Record<string, { selectors: string[]; match: (t: Record<string, string>) => boolean }> = {
  food: {
    selectors: [`nwr["amenity"~"^(restaurant|cafe|fast_food|bar|pub|food_court|ice_cream)$"]`],
    match: (t) => /^(restaurant|cafe|fast_food|bar|pub|food_court|ice_cream)$/.test(t.amenity ?? ""),
  },
  transit: {
    selectors: [`nwr["public_transport"="station"]`, `nwr["railway"~"^(station|subway_entrance|tram_stop)$"]`, `nwr["highway"="bus_stop"]`],
    match: (t) => t.public_transport === "station" || /^(station|subway_entrance|tram_stop)$/.test(t.railway ?? "") || t.highway === "bus_stop",
  },
  parking: {
    selectors: [`nwr["amenity"~"^(parking|bicycle_parking)$"]`],
    match: (t) => /^(parking|bicycle_parking)$/.test(t.amenity ?? ""),
  },
  safety: {
    selectors: [`nwr["amenity"~"^(hospital|clinic|police|fire_station|pharmacy|toilets)$"]`],
    match: (t) => /^(hospital|clinic|police|fire_station|pharmacy|toilets)$/.test(t.amenity ?? ""),
  },
};

// Public Overpass instances are often overloaded (429/502/504, or 20s+ to answer).
// Ask every mirror at once and take the first good answer: trying them in turn
// once kept a plan waiting a full minute.
const OVERPASS_MIRRORS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const OVERPASS_TIMEOUT_MS = 20_000;

async function overpass(query: string): Promise<{ elements: any[] }> {
  const done = new AbortController();
  const signal = AbortSignal.any([done.signal, AbortSignal.timeout(OVERPASS_TIMEOUT_MS)]);
  const errors: string[] = [];
  try {
    return await Promise.any(
      OVERPASS_MIRRORS.map(async (url) => {
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({ data: query }),
            signal,
          });
          if (!res.ok) throw new Error(String(res.status));
          return (await res.json()) as { elements: any[] };
        } catch (err) {
          errors.push(`${new URL(url).host} ${err instanceof Error ? err.message : err}`);
          throw err;
        }
      }),
    );
  } catch {
    throw new Error(`OpenStreetMap lookup unavailable right now (${errors.join("; ")})`);
  } finally {
    done.abort(); // cancel the slower mirrors
  }
}

export async function nearby(lat: number, lon: number, radiusM: number, groups: string[]): Promise<ToolResult> {
  const wanted = groups.filter((g) => g in OVERPASS_GROUPS);
  const { value, hit } = await cached("overpass", { lat: lat.toFixed(4), lon: lon.toFixed(4), radiusM, wanted }, async () => {
    // One combined query (fewer round-trips to overloaded servers), split afterwards.
    const parts = wanted.flatMap((g) => OVERPASS_GROUPS[g].selectors).map((sel) => `${sel}(around:${radiusM},${lat},${lon});`).join("");
    const json = await overpass(`[out:json][timeout:25];(${parts});out center 300;`);
    const out: Record<string, unknown> = {};
    for (const g of wanted) {
      const els = json.elements.filter((e) => e.tags && OVERPASS_GROUPS[g].match(e.tags));
      const byKind: Record<string, number> = {};
      for (const e of els) {
        const k = e.tags.cuisine ?? e.tags.amenity ?? e.tags.railway ?? e.tags.highway ?? e.tags.public_transport ?? "other";
        byKind[k] = (byKind[k] ?? 0) + 1;
      }
      out[g] = {
        total: els.length,
        byKind,
        examples: els.filter((e) => e.tags.name).slice(0, 15).map((e) => ({ name: e.tags.name, kind: e.tags.cuisine ?? e.tags.amenity ?? e.tags.railway ?? e.tags.highway })),
      };
    }
    return out;
  });
  return { data: value, source: "osm", cached: hit };
}

export async function weather(lat: number, lon: number, date: string): Promise<ToolResult> {
  const daysAhead = (new Date(date).getTime() - Date.now()) / 86_400_000;
  const { value, hit } = await cached("weather", { lat: lat.toFixed(2), lon: lon.toFixed(2), date }, async () => {
    if (daysAhead > 15 || daysAhead < -1) {
      // Beyond forecast range: use the same date last year as a climate hint.
      const d = new Date(date);
      d.setFullYear(d.getFullYear() - 1);
      const last = d.toISOString().slice(0, 10);
      const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lon}&start_date=${last}&end_date=${last}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=auto`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Open-Meteo archive ${res.status}`);
      return { kind: "same-day-last-year (date is beyond the 16-day forecast)", ...(await res.json()).daily };
    }
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&start_date=${date}&end_date=${date}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max&timezone=auto`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    return { kind: "forecast", ...(await res.json()).daily };
  });
  return { data: value, source: "weather", cached: hit };
}

// Name the area around a point (neighbourhood or suburb), for promo hot spots.
export async function areaName(lat: number, lon: number): Promise<string | null> {
  const { value } = await cached("reverse", { lat: lat.toFixed(4), lon: lon.toFixed(4) }, async () => {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lon));
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("zoom", "15");
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const a = ((await res.json()) as { address?: Record<string, string> }).address ?? {};
    return a.neighbourhood ?? a.suburb ?? a.quarter ?? a.city_district ?? a.road ?? null;
  });
  return value;
}
