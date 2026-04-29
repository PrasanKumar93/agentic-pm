#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { MongoClient } from "mongodb";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");

loadEnvFile(resolve(repoRoot, ".env"));

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const json = args.includes("--json");
const help = args.includes("--help") || args.includes("-h");
const explicitProjectIds = readRepeatedArg(args, "--project");

if (help) {
  printHelp();
  process.exit(0);
}

const uri = process.env.MONGODB_URI ?? "mongodb://localhost:27018";
const databaseName = process.env.MONGODB_DB ?? "agentic_pm";
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });

try {
  await client.connect();
  const db = client.db(databaseName);
  const collections = getCollections(db);

  const projectIds =
    explicitProjectIds.length > 0
      ? uniqueSorted(explicitProjectIds)
      : await discoverSmokeProjectIds(collections);

  const plan = await buildCleanupPlan(collections, projectIds);
  const result = apply ? await applyCleanupPlan(collections, plan) : undefined;
  const summary = {
    mode: apply ? "apply" : "dry-run",
    database: databaseName,
    targetProjectIds: projectIds,
    counts: plan.counts,
    issueIdsEligibleForDelete: plan.issueIdsToDelete,
    deletedCounts: result,
    generatedAt: new Date().toISOString(),
  };

  if (json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printSummary(summary);
  }
} finally {
  await client.close();
}

function getCollections(db) {
  return {
    issues: db.collection("issues"),
    workItems: db.collection("work_items"),
    runs: db.collection("runs"),
    runEvents: db.collection("run_events"),
    artifacts: db.collection("artifacts"),
    operatorActions: db.collection("operator_actions"),
    dispatchControls: db.collection("dispatch_controls"),
    webhookDeliveries: db.collection("webhook_deliveries"),
  };
}

async function discoverSmokeProjectIds(collections) {
  const sources = await Promise.all([
    collections.workItems.distinct("projectId"),
    collections.runEvents.distinct("projectId"),
    collections.operatorActions.distinct("projectId"),
    collections.dispatchControls.distinct("projectId"),
    collections.webhookDeliveries.distinct("projectId"),
  ]);

  return uniqueSorted(sources.flat().filter(isSmokeProjectId));
}

async function buildCleanupPlan(collections, projectIds) {
  const workItems = await collections.workItems
    .find(
      projectIds.length > 0
        ? { projectId: { $in: projectIds } }
        : impossibleFilter(),
    )
    .project({ _id: 0, id: 1, issueId: 1 })
    .toArray();
  const workItemIds = uniqueSorted(
    workItems.map((workItem) => workItem.id).filter(isNonEmptyString),
  );
  const issueIds = uniqueSorted(
    workItems.map((workItem) => workItem.issueId).filter(isNonEmptyString),
  );
  const runs = await collections.runs
    .find(
      workItemIds.length > 0
        ? { workItemId: { $in: workItemIds } }
        : impossibleFilter(),
    )
    .project({ _id: 0, id: 1 })
    .toArray();
  const runIds = uniqueSorted(
    runs.map((run) => run.id).filter(isNonEmptyString),
  );
  const issueIdsToDelete = await findIssueIdsEligibleForDelete(
    collections,
    issueIds,
    projectIds,
  );

  const filters = buildFilters({
    projectIds,
    workItemIds,
    runIds,
    issueIdsToDelete,
  });
  const counts = {};
  await Promise.all(
    Object.entries(filters).map(async ([name, filter]) => {
      counts[name] = await collections[name].countDocuments(filter);
    }),
  );

  return {
    filters,
    counts,
    issueIdsToDelete,
    runIds,
    workItemIds,
  };
}

async function findIssueIdsEligibleForDelete(
  collections,
  issueIds,
  projectIds,
) {
  if (issueIds.length === 0) {
    return [];
  }

  const retainedWorkItems = await collections.workItems.distinct("issueId", {
    issueId: { $in: issueIds },
    projectId: { $nin: projectIds },
  });
  const retainedIssueIds = new Set(retainedWorkItems.filter(isNonEmptyString));
  return issueIds.filter((issueId) => !retainedIssueIds.has(issueId));
}

function buildFilters({ projectIds, workItemIds, runIds, issueIdsToDelete }) {
  const projectFilter =
    projectIds.length > 0
      ? { projectId: { $in: projectIds } }
      : impossibleFilter();
  const workItemFilter =
    workItemIds.length > 0 ? { id: { $in: workItemIds } } : impossibleFilter();
  const runFilter =
    runIds.length > 0 ? { id: { $in: runIds } } : impossibleFilter();
  const runScopedFilter =
    runIds.length > 0 ? { runId: { $in: runIds } } : impossibleFilter();
  const issueFilter =
    issueIdsToDelete.length > 0
      ? { id: { $in: issueIdsToDelete } }
      : impossibleFilter();

  return {
    artifacts: runScopedFilter,
    runEvents: anyFilter([
      projectFilter,
      workItemIds.length > 0
        ? { workItemId: { $in: workItemIds } }
        : impossibleFilter(),
      runScopedFilter,
    ]),
    operatorActions: anyFilter([
      projectFilter,
      workItemIds.length > 0
        ? { workItemId: { $in: workItemIds } }
        : impossibleFilter(),
      runScopedFilter,
    ]),
    runs: runFilter,
    workItems: workItemFilter,
    webhookDeliveries: projectFilter,
    dispatchControls: projectFilter,
    issues: issueFilter,
  };
}

async function applyCleanupPlan(collections, plan) {
  const order = [
    "artifacts",
    "runEvents",
    "operatorActions",
    "runs",
    "workItems",
    "webhookDeliveries",
    "dispatchControls",
    "issues",
  ];
  const deletedCounts = {};

  for (const collectionName of order) {
    const result = await collections[collectionName].deleteMany(
      plan.filters[collectionName],
    );
    deletedCounts[collectionName] = result.deletedCount;
  }

  return deletedCounts;
}

function printSummary(summary) {
  console.log(`Agentic PM smoke cleanup (${summary.mode})`);
  console.log(`Database: ${summary.database}`);
  console.log(
    `Target projects: ${summary.targetProjectIds.length > 0 ? summary.targetProjectIds.join(", ") : "none"}`,
  );
  console.log("");
  console.log("Matched documents:");

  for (const [name, count] of Object.entries(summary.counts)) {
    console.log(`- ${name}: ${count}`);
  }

  console.log("");
  console.log(
    `Issues eligible for deletion: ${summary.issueIdsEligibleForDelete.length}`,
  );

  if (summary.deletedCounts) {
    console.log("");
    console.log("Deleted documents:");
    for (const [name, count] of Object.entries(summary.deletedCounts)) {
      console.log(`- ${name}: ${count}`);
    }
  } else {
    console.log("");
    console.log(
      "Dry-run only. Re-run with --apply to delete these MongoDB documents.",
    );
  }
}

function printHelp() {
  console.log(`Usage: pnpm cleanup:smoke [-- --apply] [-- --project <projectId>] [-- --json]

Deletes local smoke/test MongoDB documents only when --apply is present.

Options:
  --apply                Delete matched documents. Omitted by default for dry-run.
  --project <projectId>  Target one project ID. Can be repeated.
  --json                 Print machine-readable summary.
  --help                 Show this message.
`);
}

function loadEnvFile(path) {
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

function readRepeatedArg(values, name) {
  const results = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (
      value === name &&
      values[index + 1] &&
      !values[index + 1].startsWith("--")
    ) {
      results.push(values[index + 1]);
      index += 1;
      continue;
    }

    if (value.startsWith(`${name}=`)) {
      results.push(value.slice(name.length + 1));
    }
  }

  return results.filter(isNonEmptyString);
}

function anyFilter(filters) {
  const activeFilters = filters.filter((filter) => !isImpossibleFilter(filter));
  return activeFilters.length > 0 ? { $or: activeFilters } : impossibleFilter();
}

function impossibleFilter() {
  return { _id: { $exists: false } };
}

function isImpossibleFilter(filter) {
  return filter?._id?.$exists === false && Object.keys(filter).length === 1;
}

function isSmokeProjectId(value) {
  return (
    isNonEmptyString(value) &&
    value !== "project_local" &&
    /smoke|test/i.test(value)
  );
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function unquoteEnvValue(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
