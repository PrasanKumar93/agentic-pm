import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Liquid } from "liquidjs";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

const trackerSchema = z.object({
  kind: z.enum(["linear", "github", "jira", "fake"]),
  team_key: z.string().optional(),
  project_slug: z.string().optional(),
  active_states: z.array(z.string()).default(["Ready for Agent"]),
  running_state: z.string().default("Agent Running"),
  review_state: z.string().default("Human Review"),
  terminal_states: z.array(z.string()).default(["Done", "Cancelled", "Duplicate"])
});

const pollingSchema = z.object({
  interval_ms: z.number().int().positive().default(30_000)
});

const workspaceSchema = z.object({
  root: z.string().default("$AGENTIC_PM_WORKSPACE_ROOT")
});

const agentSchema = z.object({
  max_concurrent_agents: z.number().int().positive().default(3),
  max_turns: z.number().int().positive().default(20),
  max_retry_backoff_ms: z.number().int().positive().default(300_000)
});

const codexSchema = z.object({
  command: z.string().default("codex"),
  args: z.array(z.string()).default(["--ask-for-approval", "never", "--sandbox", "workspace-write", "exec", "--json", "-"]),
  turn_timeout_ms: z.number().int().positive().default(3_600_000),
  stall_timeout_ms: z.number().int().positive().default(300_000)
});

const hooksSchema = z
  .object({
    after_create: z.string().optional(),
    before_run: z.string().optional(),
    after_run: z.string().optional(),
    before_remove: z.string().optional()
  })
  .default({});

export const workflowConfigSchema = z.object({
  tracker: trackerSchema,
  polling: pollingSchema.default({}),
  workspace: workspaceSchema.default({}),
  agent: agentSchema.default({}),
  codex: codexSchema.default({}),
  hooks: hooksSchema
});

export type WorkflowConfig = z.infer<typeof workflowConfigSchema>;

export interface WorkflowDocument {
  config: WorkflowConfig;
  promptTemplate: string;
  path?: string;
  rawFrontMatter: unknown;
}

export interface RenderWorkflowInput {
  issue: {
    identifier: string;
    title: string;
    description?: string;
    url?: string;
  };
  repository?: {
    name?: string;
    url?: string;
    defaultBranch?: string;
  };
  run?: unknown;
}

export function parseWorkflowDocument(raw: string, path?: string): WorkflowDocument {
  const normalized = raw.replace(/\r\n/g, "\n");
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);

  if (!match) {
    throw new Error("WORKFLOW.md must start with YAML front matter delimited by ---");
  }

  const rawFrontMatter = parseYaml(match[1] ?? "");
  const config = workflowConfigSchema.parse(rawFrontMatter ?? {});

  return {
    config,
    promptTemplate: match[2] ?? "",
    path,
    rawFrontMatter
  };
}

export async function loadWorkflowDocument(root: string, fileName = "WORKFLOW.md"): Promise<WorkflowDocument> {
  const path = join(root, fileName);
  const raw = await readFile(path, "utf8");
  return parseWorkflowDocument(raw, path);
}

export async function renderWorkflowPrompt(
  workflow: WorkflowDocument,
  input: RenderWorkflowInput
): Promise<string> {
  const engine = new Liquid({
    strictVariables: true,
    strictFilters: true
  });

  return engine.parseAndRender(workflow.promptTemplate, input);
}

export function expandEnvReference(value: string, env: NodeJS.ProcessEnv = process.env): string {
  if (!value.startsWith("$")) {
    return value;
  }

  const key = value.slice(1);
  const resolved = env[key];

  if (!resolved) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return resolved;
}
