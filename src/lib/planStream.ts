import type { AgentEvent, EventInput } from "./types";

// Browser side of POST /api/plan: posts the event and hands each streamed AgentEvent to `onEvent`.
export async function streamPlan(input: EventInput, mode: "qloo" | "baseline", onEvent: (e: AgentEvent) => void): Promise<void> {
  const res = await fetch(`/api/plan?mode=${mode}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok || !res.body) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Request failed (${res.status}) ${detail.slice(0, 200)}`);
  }
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    const chunks = buf.split("\n\n");
    buf = chunks.pop() ?? "";
    for (const chunk of chunks) {
      if (chunk.startsWith("data: ")) onEvent(JSON.parse(chunk.slice(6)) as AgentEvent);
    }
  }
}
