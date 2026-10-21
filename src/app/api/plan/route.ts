import { runBaseline, runCrowdKit } from "@/lib/agent";
import { DEMO_BASELINE, DEMO_PLAN, DEMO_TRACE } from "@/lib/demo";
import { readCached, writeCached } from "@/lib/cache";
import { EventInputSchema, type AgentEvent, type Plan } from "@/lib/types";

interface SavedRun {
  events: AgentEvent[];
  plan: Plan;
}

// The agent makes many tool calls; give it room. (Vercel caps this by plan.)
export const maxDuration = 300;

// POST /api/plan?mode=qloo|baseline  body: EventInput
// Streams AgentEvents as Server-Sent Events.
export async function POST(request: Request) {
  const mode = new URL(request.url).searchParams.get("mode") === "baseline" ? "baseline" : "qloo";
  const parsed = EventInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
      try {
        if (process.env.CROWDKIT_DEMO === "1") {
          // Frontend development without keys: replay canned events with small delays.
          if (mode === "qloo") {
            for (const e of DEMO_TRACE) {
              emit(e);
              await new Promise((r) => setTimeout(r, 350));
            }
          }
          emit({ type: "plan", plan: mode === "baseline" ? DEMO_BASELINE : DEMO_PLAN, mode });
          return;
        }
        // Same event submitted before? Replay the saved run: no Gemini requests, so the
        // free-tier daily limit is only spent on new events. (Server-side only, never committed.)
        const saved = await readCached<SavedRun>(`run-${mode}`, parsed.data);
        if (saved) {
          emit({ type: "status", message: "Saved plan for this exact event (no new AI requests)" });
          for (const e of saved.events) {
            emit(e);
            await new Promise((r) => setTimeout(r, 120));
          }
          emit({ type: "plan", plan: saved.plan, mode });
          return;
        }

        const events: AgentEvent[] = [];
        const record = (e: AgentEvent) => {
          events.push(e);
          emit(e);
        };
        const plan = mode === "baseline" ? await runBaseline(parsed.data) : await runCrowdKit(parsed.data, record);
        await writeCached(`run-${mode}`, parsed.data, { events, plan } satisfies SavedRun);
        emit({ type: "plan", plan, mode });
      } catch (err) {
        console.error(err);
        emit({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
