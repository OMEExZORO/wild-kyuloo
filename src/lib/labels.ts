// Human-readable names for agent tools, used by the live trace.

export const TOOL_LABELS: Record<string, { label: string; icon: string }> = {
  qloo_describe: { label: "Identify the act on Qloo", icon: "spark" },
  qloo_find_tags: { label: "Translate the theme into Qloo tags", icon: "spark" },
  qloo_entity_tags: { label: "Read the act's taste tags", icon: "spark" },
  qloo_audience_demographics: { label: "Profile the audience", icon: "spark" },
  qloo_recommend: { label: "Find what fans also love", icon: "spark" },
  qloo_rank: { label: "Rank the shortlist for this crowd", icon: "spark" },
  qloo_compare_audiences: { label: "Compare with the venue's regulars", icon: "spark" },
  qloo_where_popular: { label: "Map where the fans are", icon: "spark" },
  qloo_trends: { label: "Check what's rising", icon: "spark" },
  geocode_venue: { label: "Locate the venue", icon: "pin" },
  nearby_osm: { label: "Scan the neighbourhood", icon: "pin" },
  weather_for_date: { label: "Check the forecast", icon: "cloud" },
  web_search: { label: "Research the venue online", icon: "globe" },
  web_fetch: { label: "Read a web page", icon: "globe" },
  plan_volunteers: { label: "Plan volunteer shifts", icon: "calc" },
};

export function toolLabel(tool: string) {
  return TOOL_LABELS[tool] ?? { label: tool.replace(/_/g, " "), icon: "info" };
}

// One-line description of a tool input, for the trace.
export function describeInput(input: unknown): string {
  if (!input || typeof input !== "object") return "";
  const o = input as Record<string, unknown>;
  const pick = o.entity ?? o.query ?? o.entities ?? o.options ?? o.signals ?? o.group_a;
  if (pick !== undefined) {
    const text = Array.isArray(pick) ? pick.join(", ") : String(pick);
    const extra = o.target_type ?? o.option_type ?? o.type;
    return extra ? `${text} → ${extra}` : text;
  }
  if (typeof o.lat === "number" && typeof o.lon === "number") return `${o.lat.toFixed(3)}, ${o.lon.toFixed(3)}`;
  if (typeof o.attendance === "number") return `${o.attendance} people, ${o.volunteers} volunteers`;
  return "";
}
