/* eslint-disable @typescript-eslint/no-explicit-any -- MCP results are untyped JSON */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { cached } from "../cache";
import type { SourceKind } from "../types";
import { cleanSchema, type AgentTool } from "./tool";

// Qloo access goes through the event's supported route: the local `qloo mcp`
// server from @qloo/qloo-harness (https://github.com/qloo/qloo-hackathon-kit).
//  - Install: npm install --global @qloo/qloo-harness   (Node >= 22.19)
//  - Credential: `qloo setup --qloo` locally, or QLOO_API_KEY on the server.
//  - It is a stdio process, so this needs a long-running Node server
//    (Docker / Render / Railway), not serverless functions.
//
// If `qloo` is missing or has no credential, we fall back to clearly-labelled
// mock tools so the rest of the app keeps working.

const QLOO_BIN = process.env.QLOO_BIN ?? "qloo";

// Workflow envelope returned by every qloo mcp tool.
export interface QlooEnvelope {
  status: "ok" | "empty" | "needs_input" | "partial" | "degraded" | "error";
  summary: string;
  results: unknown[];
  result_count: number;
  error?: { code: string; retryable: boolean; recovery?: string };
  [k: string]: unknown;
}

export interface QlooCallInfo {
  tool: string;
  source: SourceKind;
  cached: boolean;
  status: QlooEnvelope["status"];
  summary: string;
  names: string[]; // every entity name in the result, for checking "qloo"-labelled plan items
}

// Collect every `name` field anywhere in a Qloo result (results can be lists or nested objects).
export function collectNames(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 6 || value === null || typeof value !== "object") return out;
  if (Array.isArray(value)) {
    for (const v of value) collectNames(v, out, depth + 1);
    return out;
  }
  for (const [k, v] of Object.entries(value)) {
    if (k === "name" && typeof v === "string") out.push(v);
    else collectNames(v, out, depth + 1);
  }
  return out;
}

type QlooBackend =
  | { mode: "live"; client: Client; tools: { name: string; description?: string; inputSchema: any }[] }
  | { mode: "mock"; reason: string };

let backend: Promise<QlooBackend> | null = null;

async function connect(): Promise<QlooBackend> {
  const client = new Client({ name: "crowd-kit", version: "0.1.0" });
  try {
    // Forward the full environment so QLOO_API_KEY / QLOO_HOME reach the server.
    await client.connect(new StdioClientTransport({ command: QLOO_BIN, args: ["mcp"], env: process.env as Record<string, string> }));
  } catch (err: any) {
    // A missing binary shows up as ENOENT on Unix and "Connection closed" on Windows.
    const reason = `could not start \`${QLOO_BIN} mcp\` (is @qloo/qloo-harness installed and on PATH? ${err?.code ?? err?.message ?? err})`;
    return { mode: "mock", reason };
  }
  const caps: any = await client.callTool({ name: "qloo_capabilities", arguments: {} });
  if (!caps.structuredContent?.adapter?.ready) {
    await client.close();
    return { mode: "mock", reason: "qloo has no usable credential (run `qloo setup --qloo` or set QLOO_API_KEY)" };
  }
  const { tools } = await client.listTools();
  // qloo_capabilities is a readiness probe, not useful to the agent.
  return { mode: "live", client, tools: tools.filter((t) => t.name.startsWith("qloo_") && t.name !== "qloo_capabilities") };
}

export function qlooBackend(): Promise<QlooBackend> {
  if (!backend) {
    backend = connect().catch((err) => ({ mode: "mock", reason: String(err?.message ?? err) }) as QlooBackend);
    // Retry the connection on the next request if it failed or fell back to mock.
    backend.then((b) => { if (b.mode === "mock") backend = null; });
  }
  return backend;
}

function normalize(result: any): QlooEnvelope {
  const env = result?.structuredContent ?? {};
  if (env.status === undefined) {
    const text = (result?.content ?? []).map((c: any) => c.text ?? "").join("\n");
    return { status: "error", summary: text || "Qloo returned no structured result", results: [], result_count: 0, error: { code: "UNKNOWN", retryable: false } };
  }
  return env as QlooEnvelope;
}

const MAX_RESULT_CHARS = 12_000;

// First few result names, for the live trace (e.g. " · Fender, Dr. Martens, Gibson").
function resultNames(envelope: QlooEnvelope): string {
  // `results` is a list for most workflows but an object for some (e.g. compare_audiences).
  if (!Array.isArray(envelope.results)) return "";
  const names = envelope.results.map((r: any) => r?.name).filter(Boolean).slice(0, 3);
  return names.length ? ` · ${names.join(", ")}` : "";
}

// Tools for the agent. `onCall` lets the caller show each call in the live trace.
export async function qlooTools(
  onCall: (info: QlooCallInfo, input: unknown) => void,
): Promise<{ tools: AgentTool[]; mode: "live" | "mock"; reason?: string }> {
  const b = await qlooBackend();
  if (b.mode === "mock") return { tools: mockTools(onCall), mode: "mock", reason: b.reason };

  const tools = b.tools.map((t): AgentTool => {
    return {
      name: t.name,
      description: t.description ?? t.name,
      parameters: cleanSchema(t.inputSchema),
      run: async (input: Record<string, unknown>) => {
        const { value: envelope, hit } = await cached(`qloo-${t.name}`, input, async () =>
          normalize(await b.client.callTool({ name: t.name, arguments: input })),
        );
        // Live "ok" envelopes often have no summary; describe the result instead.
        const summary = envelope.summary || `${envelope.status}: ${envelope.result_count ?? 0} result(s)${resultNames(envelope)}`;
        onCall({ tool: t.name, source: "qloo", cached: hit, status: envelope.status, summary, names: collectNames(envelope.results) }, input);
        const text = JSON.stringify(envelope);
        return text.length > MAX_RESULT_CHARS ? text.slice(0, MAX_RESULT_CHARS) + "…(truncated)" : text;
      },
    };
  });
  return { tools, mode: "live" };
}

// ---------------------------------------------------------------------------
// Mock mode: same workflow names and inputs as qloo-harness 0.1.26 (checked
// with listTools), permissive schemas, obviously fake results. Lets the team
// build without a Qloo credential.
// ---------------------------------------------------------------------------
const MOCK_WORKFLOWS: Record<string, string> = {
  qloo_find_tags: "Find Qloo tags for a concept (e.g. 'korean bbq'). Input: { query, semantic?, limit? }",
  qloo_describe: "Resolve and describe an entity by name (e.g. an artist). Input: { entity, type? }",
  qloo_entity_tags: "Tags that describe one or more entities. Input: { entities, entity_type?, limit? }",
  qloo_audience_demographics: "Age and gender profile of an entity's audience. Input: { entity, entity_type?, limit? }",
  qloo_recommend:
    "Fans of the signals also like... Input: { target_type, signals?, signal_tags?, signal_location?, demographic?, filter_location?, include_tags?, exclude_tags?, explain?, limit? }",
  qloo_rank: "Rank a shortlist of options for an audience. Input: { options, option_type, signals?, signal_location?, demographic?, include_tags?, exclude_tags? }",
  qloo_compare_audiences: "How two audiences differ. Input: { group_a, group_b, target_type?, limit? }",
  qloo_where_popular: "Where an entity is popular. Input: { entity, within, entity_type?, limit? }",
  qloo_trends: "Is it rising? Input: { entities, entity_type, start_date, end_date, limit? }",
};

function mockEnvelope(tool: string, input: any): QlooEnvelope {
  const n = (i: number, label: string) => ({ name: `Mock ${label} ${i + 1}`, affinity: +(0.9 - i * 0.08).toFixed(2) });
  let results: unknown[];
  switch (tool) {
    case "qloo_audience_demographics":
      // Same shape as live Qloo: affinity indices from -1 (fewer than typical) to +1 (more).
      results = [{ age: { "24_and_younger": 0.2, "25_to_29": 0.35, "30_to_34": 0.05, "35_to_44": -0.4, "45_to_54": -0.5, "55_and_older": -0.55 }, gender: { female: 0.3, male: -0.3 } }];
      break;
    case "qloo_compare_audiences":
      results = [{ only_group_a: ["Mock tag A1", "Mock tag A2"], only_group_b: ["Mock tag B1"], shared: ["Mock shared tag"] }];
      break;
    case "qloo_rank":
      results = (Array.isArray(input?.options) ? input.options : ["Option 1", "Option 2"]).map((o: unknown, i: number) => ({ option: o, score: +(0.9 - i * 0.1).toFixed(2) }));
      break;
    default:
      results = Array.from({ length: 5 }, (_, i) => n(i, String(input?.target_type ?? tool.replace("qloo_", ""))));
  }
  return { status: "ok", summary: `MOCK DATA for ${tool} (no Qloo credential configured)`, results, result_count: results.length };
}

function mockTools(onCall: (info: QlooCallInfo, input: unknown) => void): AgentTool[] {
  return Object.entries(MOCK_WORKFLOWS).map(([name, description]): AgentTool => ({
    name,
    description: `[MOCK] ${description}`,
    parameters: { type: "object" },
    run: async (input: Record<string, unknown>) => {
      const envelope = mockEnvelope(name, input);
      onCall({ tool: name, source: "mock", cached: false, status: envelope.status, summary: envelope.summary, names: collectNames(envelope.results) }, input);
      return JSON.stringify(envelope);
    },
  }));
}
