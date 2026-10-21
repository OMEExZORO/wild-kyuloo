// Provider-neutral tool definition: a JSON Schema for the model, and a run
// function that returns the text the model sees as the tool's result.

export interface AgentTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema (type: "object")
  run: (input: Record<string, unknown>) => Promise<string>;
}

// Drop JSON Schema keywords model APIs don't need or reject.
export function cleanSchema(schema: unknown): Record<string, unknown> {
  const { $schema, ...rest } = (schema ?? {}) as Record<string, unknown>;
  void $schema;
  return { type: "object", ...rest };
}
