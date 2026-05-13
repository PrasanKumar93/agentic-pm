#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readResolvedTrackerConfig } from "../../../packages/config/src/project.js";
import {
  LinearTrackerAdapter,
  type LinearTeamNode,
  type LinearWebhookCreateInput,
  type LinearWebhookNode,
  type LinearWebhookUpdateInput,
} from "../../../packages/trackers/src/linear.js";

const endpointPath = "/webhooks/linear";
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");

loadEnvFile(resolve(repoRoot, ".env"));

const args = process.argv.slice(2);
const help = hasFlag(args, "--help") || hasFlag(args, "-h");
const apply = hasFlag(args, "--apply");
const json = hasFlag(args, "--json");
const allowHttp = hasFlag(args, "--allow-http");
const allowMissingSecret =
  hasFlag(args, "--allow-missing-secret") || hasFlag(args, "--no-secret-sync");
const syncSecret = !hasFlag(args, "--no-secret-sync");

if (help) {
  printHelp();
  process.exit(0);
}

const trackerConfig = readResolvedTrackerConfig();
const teamKey = readArg(args, "--team-key") ?? trackerConfig.linear.teamKey;
const apiKey = process.env.LINEAR_API_KEY?.trim();
const publicUrl = resolvePublicWebhookUrl(args);
const resourceTypes = parseCsv(
  readArg(args, "--resource-types") ??
    process.env.LINEAR_WEBHOOK_RESOURCE_TYPES ??
    "Issue",
);
const label =
  readArg(args, "--label") ??
  process.env.LINEAR_WEBHOOK_LABEL?.trim() ??
  `Agentic PM ${teamKey}`;
const requestedWebhookId =
  readArg(args, "--webhook-id") ?? process.env.LINEAR_WEBHOOK_ID?.trim();
const secret = syncSecret
  ? (readArg(args, "--secret") ?? process.env.LINEAR_WEBHOOK_SECRET?.trim())
  : undefined;
const linearEndpoint = readArg(args, "--linear-api-url") ?? process.env.LINEAR_API_URL;

if (!teamKey) {
  fail("Linear team key is missing from packages/config/src/agentic-pm.config.ts.");
}

if (trackerConfig.kind !== "linear" && !hasFlag(args, "--force")) {
  fail(
    `Configured tracker kind is "${trackerConfig.kind}". Use --force only if you intentionally want to manage Linear anyway.`,
  );
}

if (!apiKey) {
  fail("LINEAR_API_KEY is missing. Add it to .env before syncing the Linear webhook.");
}

if (!publicUrl) {
  fail(
    "Public webhook URL is missing. Set LINEAR_WEBHOOK_PUBLIC_URL or AGENTIC_PM_PUBLIC_BASE_URL.",
  );
}

if (!allowHttp && !publicUrl.startsWith("https://")) {
  fail(
    `Linear webhook URL must be HTTPS for live delivery: ${publicUrl}. Use --allow-http only for local experiments.`,
  );
}

if (!resourceTypes.length) {
  fail("At least one Linear webhook resource type is required.");
}

if (syncSecret && !secret && !allowMissingSecret) {
  fail(
    "LINEAR_WEBHOOK_SECRET is missing. Set it in .env, or pass --no-secret-sync if the Linear webhook already has the correct secret.",
  );
}

const adapter = new LinearTrackerAdapter({
  apiKey,
  endpoint: linearEndpoint,
});

const verification = await adapter.verifyConnection({
  teamKey,
  stateNames: [],
});
const team = verification.team;
if (!team) {
  fail(`Linear team key was not found: ${teamKey}`);
}

let webhooks: LinearWebhookNode[];
try {
  webhooks = await adapter.listWebhooks();
} catch (error) {
  fail(
    "Could not read Linear webhooks. The Linear API key likely needs admin webhook permissions.",
    { error: errorMessage(error) },
  );
}

const matchingWebhook = pickTargetWebhook({
  label,
  requestedWebhookId,
  team,
  url: publicUrl,
  webhooks,
});
const operation = matchingWebhook ? "update" : "create";
const plan = {
  dryRun: !apply,
  operation,
  trackerKind: trackerConfig.kind,
  team: pickTeam(team),
  targetWebhook: matchingWebhook ? pickWebhook(matchingWebhook) : undefined,
  desired: {
    label,
    url: publicUrl,
    resourceTypes,
    secretConfigured: Boolean(secret),
    secretSynced: syncSecret,
  },
  matching: {
    requestedWebhookId,
    exactUrlMatch: Boolean(
      webhooks.find(
        (webhook) =>
          webhook.url === publicUrl && sameWebhookTeam(webhook, team),
      ),
    ),
    teamWebhookCount: webhooks.filter((webhook) => sameWebhookTeam(webhook, team))
      .length,
  },
};

if (!apply) {
  printResult({
    ok: true,
    message:
      operation === "update"
        ? "Dry run: existing Linear webhook would be updated."
        : "Dry run: a new Linear webhook would be created.",
    plan,
  });
  process.exit(0);
}

if (operation === "update") {
  const input: LinearWebhookUpdateInput = {
    enabled: true,
    label,
    resourceTypes,
    secret,
    url: publicUrl,
  };
  const result = await adapter.updateWebhook(matchingWebhook.id, input);
  printResult({
    ok: result.success,
    message: result.success
      ? "Linear webhook updated."
      : "Linear webhook update returned success=false.",
    plan,
    webhook: result.webhook ? pickWebhook(result.webhook) : undefined,
  });
} else {
  const input: LinearWebhookCreateInput = {
    enabled: true,
    label,
    resourceTypes,
    secret,
    teamId: team.id,
    url: publicUrl,
  };
  const result = await adapter.createWebhook(input);
  printResult({
    ok: result.success,
    message: result.success
      ? "Linear webhook created."
      : "Linear webhook creation returned success=false.",
    plan,
    webhook: result.webhook ? pickWebhook(result.webhook) : undefined,
  });
}

function pickTargetWebhook(input: {
  label: string;
  requestedWebhookId?: string;
  team: LinearTeamNode;
  url: string;
  webhooks: LinearWebhookNode[];
}): LinearWebhookNode | undefined {
  if (input.requestedWebhookId) {
    return input.webhooks.find((webhook) => webhook.id === input.requestedWebhookId);
  }

  return input.webhooks.find(
    (webhook) => webhook.url === input.url && sameWebhookTeam(webhook, input.team),
  ) ?? input.webhooks.find(
    (webhook) => webhook.label === input.label && sameWebhookTeam(webhook, input.team),
  ) ?? onlyItem(input.webhooks.filter((webhook) => sameWebhookTeam(webhook, input.team)));
}

function sameWebhookTeam(webhook: LinearWebhookNode, team: LinearTeamNode): boolean {
  return webhook.team?.id === team.id || webhook.team?.key === team.key;
}

function resolvePublicWebhookUrl(values: string[]): string | undefined {
  const exact =
    readArg(values, "--url") ??
    process.env.LINEAR_WEBHOOK_PUBLIC_URL?.trim() ??
    process.env.AGENTIC_PM_PUBLIC_WEBHOOK_URL?.trim();
  if (exact) {
    return normalizeHttpUrl(exact);
  }

  const base =
    process.env.AGENTIC_PM_PUBLIC_BASE_URL?.trim() ??
    process.env.PUBLIC_WEBHOOK_BASE_URL?.trim();
  const normalizedBase = base ? normalizeHttpUrl(base) : undefined;
  return normalizedBase
    ? `${normalizedBase.replace(/\/+$/u, "")}${endpointPath}`
    : undefined;
}

function normalizeHttpUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function pickTeam(team: LinearTeamNode) {
  return {
    id: team.id,
    key: team.key,
    name: team.name,
  };
}

function pickWebhook(webhook: LinearWebhookNode) {
  return {
    id: webhook.id,
    label: webhook.label,
    url: webhook.url,
    enabled: webhook.enabled,
    resourceTypes: webhook.resourceTypes,
    allPublicTeams: webhook.allPublicTeams,
    team: webhook.team ? pickTeam(webhook.team) : undefined,
  };
}

function printResult(output: unknown) {
  if (json) {
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  const result = output as {
    message: string;
    plan?: typeof plan;
    webhook?: ReturnType<typeof pickWebhook>;
  };
  console.log(result.message);
  if (result.plan) {
    console.log(`Team: ${result.plan.team.key} (${result.plan.team.name})`);
    console.log(`URL: ${result.plan.desired.url}`);
    console.log(`Resource types: ${result.plan.desired.resourceTypes.join(", ")}`);
    console.log(
      `Secret: ${
        result.plan.desired.secretConfigured
          ? "configured and included"
          : result.plan.desired.secretSynced
            ? "missing"
            : "not synced"
      }`,
    );
    console.log(`Operation: ${result.plan.operation}`);
    if (result.plan.dryRun) {
      console.log("No Linear changes were made. Re-run with --apply to execute.");
    }
  }
  if (result.webhook) {
    console.log(`Webhook: ${result.webhook.id}`);
  }
}

function fail(message: string, details?: unknown): never {
  if (json) {
    console.error(JSON.stringify({ ok: false, error: message, details }, null, 2));
  } else {
    console.error(message);
    if (details) {
      console.error(JSON.stringify(details, null, 2));
    }
  }
  process.exit(1);
}

function printHelp() {
  console.log(`Usage: pnpm linear:webhook [-- options]

Creates or updates the Linear webhook for Agentic PM from local config and .env.
The command is dry-run by default; use --apply to mutate Linear.

Reads:
  Team key: packages/config/src/agentic-pm.config.ts
  API key:  LINEAR_API_KEY
  URL:      LINEAR_WEBHOOK_PUBLIC_URL, AGENTIC_PM_PUBLIC_WEBHOOK_URL,
            or AGENTIC_PM_PUBLIC_BASE_URL + ${endpointPath}
  Secret:   LINEAR_WEBHOOK_SECRET, unless --no-secret-sync is used

Options:
  --apply                    Create/update the webhook in Linear.
  --url <url>                Override the public callback URL.
  --webhook-id <id>          Update a known webhook id. Also read from LINEAR_WEBHOOK_ID.
  --team-key <key>           Override the TypeScript configured team key.
  --resource-types <csv>     Resource types. Defaults to Issue.
  --label <text>             Webhook label. Defaults to "Agentic PM <team key>".
  --no-secret-sync           Do not send LINEAR_WEBHOOK_SECRET to Linear.
  --allow-missing-secret     Allow creating/updating without a secret.
  --allow-http               Allow a non-HTTPS URL for local experiments.
  --linear-api-url <url>     Override the Linear GraphQL endpoint.
  --force                    Run even when AGENTIC_PM_TRACKER is not linear.
  --json                     Print machine-readable output.
  --help                     Show this message.
`);
}

function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function onlyItem<T>(items: T[]): T | undefined {
  return items.length === 1 ? items[0] : undefined;
}

function hasFlag(values: string[], name: string): boolean {
  return values.includes(name);
}

function readArg(values: string[], name: string): string | undefined {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === name && values[index + 1] && !values[index + 1].startsWith("--")) {
      return values[index + 1];
    }

    if (value.startsWith(`${name}=`)) {
      return value.slice(name.length + 1);
    }
  }

  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function loadEnvFile(path: string): void {
  if (!existsSync(path)) {
    return;
  }

  const lines = readFileSync(path, "utf8").split(/\r?\n/u);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");
    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    const value = unquoteEnvValue(trimmed.slice(separator + 1).trim());
    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

function unquoteEnvValue(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
