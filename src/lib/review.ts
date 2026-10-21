import { ThinkingLevel } from "@google/genai";
import { z } from "zod";
import { generate } from "./gemini";
import { describeLayout, runChecks, type Layout } from "./layout";
import { cleanSchema } from "./tools/tool";

// AI review of the organiser's site layout (and optionally a photo of the stage
// or venue): finds chaos before it happens. The fixed checks in layout.ts run
// first; the model explains, prioritises and adds what rules can't see.

export const ReviewSchema = z.object({
  summary: z.string().describe("Two sentences: overall readiness and the single most important fix"),
  issues: z
    .array(
      z.object({
        severity: z.enum(["critical", "warning", "tip"]),
        title: z.string().describe("Short, e.g. 'Merch queue will block Entrance A'"),
        detail: z.string().describe("Why it will cause trouble on the night, with distances or numbers"),
        fix: z.string().describe("A concrete change the organiser can make"),
        zoneIds: z.array(z.string()).describe("Ids of the zones or areas involved, exactly as given"),
      }),
    )
    .max(8),
});
export type Review = z.infer<typeof ReviewSchema>;

export const ReviewRequestSchema = z.object({
  layout: z.object({
    v: z.literal(1),
    center: z.tuple([z.number(), z.number()]),
    zones: z.array(z.object({ id: z.string(), kind: z.string(), label: z.string(), lat: z.number(), lon: z.number(), qty: z.number() })).max(200),
    areas: z.array(z.object({ id: z.string(), label: z.string(), points: z.array(z.tuple([z.number(), z.number()])).max(200) })).max(20),
  }),
  event: z.object({ act: z.string(), venue: z.string(), date: z.string(), attendance: z.number(), volunteers: z.number() }),
  crowd: z.string().max(2000).optional().describe("Crowd profile from the plan"),
  risks: z.string().max(2000).optional(),
  photo: z.object({ mime: z.enum(["image/jpeg", "image/png", "image/webp"]), data: z.string().max(3_000_000) }).optional(),
});
export type ReviewRequest = z.infer<typeof ReviewRequestSchema>;

const SYSTEM = `You review an event site layout before the event, like an experienced event safety and operations manager. The goal is to catch problems that cause chaos on the night: crushes, blocked exits, queues colliding with arrivals, first aid that can't reach the crowd, poor sightlines, accessibility gaps.

You get: the zones the organiser placed (with ids, positions and distances from the stage), standing areas with their size, results of fixed safety checks, the event and crowd profile, and sometimes a photo of the stage or venue.

Rules:
- Use the fixed check numbers as given; do not recompute or contradict them.
- Refer to zones by their ids in zoneIds, exactly as given.
- Use the crowd profile: a crowd that over-indexes on merch means bigger merch queues; a young crowd means more pressure at the front barrier; an older crowd needs more seating and step-free routes.
- If there is a photo, look for visible hazards: blocked or narrow exits, trip hazards and cable runs, gaps in barriers, unsecured rigging, poor lighting, wet floors. Only report what you can actually see, and say it came from the photo.
- At most 8 issues, most severe first. Be specific (distances, counts). Each fix must be a concrete change.
- You support, and never replace, a professional safety assessment.`;

// Without a Gemini key (demo mode) the fixed checks become the review.
export function rulesOnlyReview(layout: Layout, attendance: number): Review {
  const checks = runChecks(layout, attendance).filter((c) => c.severity !== "ok");
  return {
    summary: checks.length ? `${checks.length} thing(s) to fix before the event. Start with: ${checks[0].title.toLowerCase()}.` : "No problems found by the fixed checks.",
    issues: checks.slice(0, 8).map((c) => ({ severity: c.severity === "critical" ? "critical" : "warning", title: c.title, detail: c.detail, fix: "Adjust the layout on the map and run the review again.", zoneIds: c.zoneIds })),
  };
}

export async function reviewLayout(req: ReviewRequest): Promise<Review> {
  const layout = req.layout as Layout;
  const checks = runChecks(layout, req.event.attendance);
  const text = [
    `Event: ${req.event.act} at ${req.event.venue} on ${req.event.date}. ${req.event.attendance} expected, ${req.event.volunteers} volunteers.`,
    req.crowd && `Crowd profile (from Qloo taste data): ${req.crowd}`,
    req.risks && `Known risks from the plan: ${req.risks}`,
    `Layout:\n${describeLayout(layout) || "(nothing placed yet)"}`,
    `Fixed safety checks:\n${checks.map((c) => `[${c.severity}] ${c.title}: ${c.detail} (zones: ${c.zoneIds.join(", ") || "none"})`).join("\n")}`,
    req.photo && "A photo of the stage/venue is attached.",
  ]
    .filter(Boolean)
    .join("\n\n");

  const parts: ({ text: string } | { inlineData: { mimeType: string; data: string } })[] = [{ text }];
  if (req.photo) parts.push({ inlineData: { mimeType: req.photo.mime, data: req.photo.data } });

  const { res } = await generate(() => ({
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: SYSTEM,
      responseMimeType: "application/json",
      responseJsonSchema: cleanSchema(z.toJSONSchema(ReviewSchema)),
      thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
      maxOutputTokens: 8192,
    },
  }));
  const parsed = ReviewSchema.safeParse(JSON.parse(res.text ?? "{}"));
  if (!parsed.success) throw new Error("The review came back in an unexpected format. Try again.");
  // Keep only zone ids that exist, so highlighting never points at nothing.
  const ids = new Set([...layout.zones.map((z) => z.id), ...layout.areas.map((a) => a.id)]);
  parsed.data.issues.forEach((i) => (i.zoneIds = i.zoneIds.filter((id) => ids.has(id))));
  return parsed.data;
}
