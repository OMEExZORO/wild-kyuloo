/* eslint-disable @typescript-eslint/no-explicit-any -- parses untyped third-party JSON */
import { cached } from "../cache";
import type { ToolResult } from "../types";

// Qloo hackathon API client.
// Gotchas from the developer guide:
//  - Only https://hackathon.api.qloo.com works with hackathon keys.
//  - Key goes in the X-Api-Key header.
//  - /v2/insights is GET with query params; invalid params are SILENTLY ignored,
//    so an empty result usually means a bad param for that filter.type.
//  - Never commit Qloo responses to the repo (cache lives in .cache/, gitignored).
//
// Without QLOO_API_KEY every call returns clearly-labelled mock data so the
// rest of the team can build before the key arrives.

const BASE = process.env.QLOO_BASE_URL ?? "https://hackathon.api.qloo.com";
const KEY = process.env.QLOO_API_KEY;
export const qlooIsMock = !KEY;

async function qlooGet(pathname: string, params: Record<string, string | number>): Promise<unknown> {
  const url = new URL(pathname, BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { headers: { "X-Api-Key": KEY!, accept: "application/json" } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Qloo ${res.status} on ${pathname}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

// Qloo responses are verbose (akas, external ids...). Keep what the agent needs.
function slimEntity(e: Record<string, any>) {
  const props = e.properties ?? {};
  return {
    name: e.name,
    id: e.entity_id ?? e.id,
    type: e.subtype ?? e.type,
    affinity: e.query?.affinity ?? e.affinity,
    popularity: e.popularity,
    address: props.address,
    tags: Array.isArray(e.tags) ? e.tags.slice(0, 6).map((t: any) => t.name ?? t.id) : undefined,
  };
}

function slim(raw: any): unknown {
  const r = raw?.results ?? raw;
  if (Array.isArray(r?.entities)) return { entities: r.entities.map(slimEntity) };
  if (Array.isArray(r?.tags)) return { tags: r.tags.slice(0, 25).map((t: any) => ({ name: t.name, id: t.id ?? t.tag_id, type: t.subtype ?? t.type })) };
  if (Array.isArray(r)) return r.slice(0, 25).map((x: any) => (x?.name ? slimEntity(x) : x));
  return r; // demographics / heatmap payloads are already compact
}

export async function qlooSearch(query: string, types?: string): Promise<ToolResult> {
  if (qlooIsMock) return mock("search", { query, types });
  const params: Record<string, string | number> = { query, take: 5 };
  if (types) params.types = types;
  const { value, hit } = await cached("qloo-search", params, () => qlooGet("/search", params));
  return { data: slim(value), source: "qloo", cached: hit };
}

export async function qlooTags(query: string, tagType?: string): Promise<ToolResult> {
  if (qlooIsMock) return mock("tags", { query, tagType });
  const params: Record<string, string | number> = { "filter.query": query, take: 10 };
  if (tagType) params["filter.tag.types"] = tagType;
  const { value, hit } = await cached("qloo-tags", params, () => qlooGet("/v2/tags", params));
  return { data: slim(value), source: "qloo", cached: hit };
}

export async function qlooInsights(params: Record<string, string | number>): Promise<ToolResult> {
  if (!params["filter.type"]) throw new Error("filter.type is required on every insights call");
  if (qlooIsMock) return mock("insights", params);
  const withTake = { take: 10, ...params };
  const { value, hit } = await cached("qloo-insights", withTake, () => qlooGet("/v2/insights", withTake));
  return { data: slim(value), source: "qloo", cached: hit };
}

// ---------------------------------------------------------------------------
// Mock data. Obviously fake names so nobody mistakes it for real Qloo output.
// ---------------------------------------------------------------------------
function mock(kind: string, args: Record<string, unknown>): ToolResult {
  const t = String(args["filter.type"] ?? args.types ?? "");
  let data: unknown;
  if (kind === "search") {
    data = { entities: [{ name: `${args.query} (mock)`, id: "MOCK-ENTITY-1", type: t || "urn:entity:artist", affinity: null }] };
  } else if (kind === "tags") {
    data = { tags: [{ name: `${args.query} (mock tag)`, id: `urn:tag:mock:${String(args.query).toLowerCase().replace(/\s+/g, "_")}` }] };
  } else if (t.includes("demographics")) {
    data = { demographics: { age: { "24_and_younger": 0.3, "25_to_29": 0.28, "30_to_34": 0.2, "35_and_older": 0.22 }, gender: { female: 0.56, male: 0.44 } } };
  } else if (t.includes("heatmap")) {
    data = { heatmap: [{ location: { geohash: "mock01" }, query: { affinity: 0.82, popularity: 0.6 } }] };
  } else {
    const label = t.split(":").pop() ?? "entity";
    data = { entities: Array.from({ length: 5 }, (_, i) => ({ name: `Mock ${label} ${i + 1}`, id: `MOCK-${label}-${i}`, type: t, affinity: +(0.9 - i * 0.08).toFixed(2) })) };
  }
  return { data, source: "mock", cached: false };
}
