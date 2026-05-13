#!/usr/bin/env node
import { execFile } from "node:child_process";
import {
  access,
  lstat,
  readdir,
  readFile,
  realpath,
  rm,
  stat,
} from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "../../..");
const defaultOlderThan = "7d";
const markerFileName = ".agentic-pm-workspace.json";
const protectedTopLevelFolders = new Set(["source-repositories"]);

loadEnvFile(resolve(repoRoot, ".env"));

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const json = args.includes("--json");
const help = args.includes("--help") || args.includes("-h");
const includeDirty = args.includes("--include-dirty");
const includeRecent = args.includes("--include-recent");
const root = resolvePath(
  readArg(args, "--root") ??
    process.env.AGENTIC_PM_WORKSPACE_ROOT ??
    resolve(repoRoot, "workspaces"),
);
const olderThanInput = readArg(args, "--older-than") ?? defaultOlderThan;
const olderThanMs = includeRecent ? 0 : parseDurationMs(olderThanInput);
const projectFilters = new Set(readRepeatedArg(args, "--project").map(slug));
const repositoryFilters = new Set(
  readRepeatedArg(args, "--repository").map(slug),
);

if (help) {
  printHelp();
  process.exit(0);
}

assertSafeWorkspaceRoot(root);

const plan = await buildCleanupPlan({
  includeDirty,
  olderThanMs,
  projectFilters,
  repositoryFilters,
  root,
});
const removed = apply ? await applyCleanupPlan(plan.candidates) : [];
const summary = {
  mode: apply ? "apply" : "dry-run",
  root,
  olderThan: includeRecent ? "disabled" : olderThanInput,
  includeDirty,
  candidates: plan.candidates,
  skipped: plan.skipped,
  removed,
  generatedAt: new Date().toISOString(),
};

if (json) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  printSummary(summary);
}

async function buildCleanupPlan(input) {
  const directories = await discoverWorkspaceDirectories(input.root);
  const candidates = [];
  const skipped = [];

  for (const directory of directories) {
    const info = await inspectWorkspaceDirectory(directory, input.root);
    if (!info) {
      continue;
    }

    const skipReason = shouldSkipWorkspace(info, input);
    if (skipReason) {
      skipped.push({ ...info, reason: skipReason });
      continue;
    }

    candidates.push(info);
  }

  return {
    candidates: sortByPath(candidates),
    skipped: sortByPath(skipped),
  };
}

async function discoverWorkspaceDirectories(root) {
  if (!(await isAccessibleDirectory(root))) {
    return [];
  }

  const results = [];
  await walk(root, 0, async (entryPath, depth) => {
    if (depth < 2 || depth > 3) {
      return;
    }

    if (await hasGitMetadata(entryPath)) {
      results.push(entryPath);
    }
  });

  return uniqueSorted(results);
}

async function walk(directory, depth, visit) {
  if (depth > 3) {
    return;
  }

  const entries = await readDirectoryEntries(directory);
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") {
      continue;
    }

    const entryPath = resolve(directory, entry.name);
    if (!entry.isDirectory()) {
      continue;
    }

    await visit(entryPath, depth + 1);
    await walk(entryPath, depth + 1, visit);
  }
}

async function inspectWorkspaceDirectory(workspacePath, root) {
  const gitRoot = await gitOutput([
    "-C",
    workspacePath,
    "rev-parse",
    "--show-toplevel",
  ]);
  if (
    !gitRoot ||
    (await canonicalPath(gitRoot.trim())) !==
      (await canonicalPath(workspacePath))
  ) {
    return undefined;
  }

  const relativePath = relative(root, workspacePath);
  const segments = relativePath.split(sep).filter(Boolean);
  const marker = await readMarker(workspacePath);
  const directoryStats = await stat(workspacePath);
  const modifiedAt = directoryStats.mtime.toISOString();
  const dirtyFiles = await readDirtyFiles(workspacePath);
  const kind = await readWorkspaceKind(workspacePath);

  return {
    path: workspacePath,
    relativePath,
    project: segments[0],
    repository: segments.length === 3 ? segments[1] : undefined,
    workspace: segments.at(-1),
    kind,
    marker,
    dirty: dirtyFiles.length > 0,
    dirtyFiles,
    modifiedAt,
    ageMs: Date.now() - directoryStats.mtimeMs,
  };
}

function shouldSkipWorkspace(info, input) {
  if (info.project && protectedTopLevelFolders.has(slug(info.project))) {
    return "protected_workspace_cache";
  }

  if (
    input.projectFilters.size > 0 &&
    (!info.project || !input.projectFilters.has(slug(info.project)))
  ) {
    return "project_filter";
  }

  if (
    input.repositoryFilters.size > 0 &&
    (!info.repository || !input.repositoryFilters.has(slug(info.repository)))
  ) {
    return "repository_filter";
  }

  if (input.olderThanMs > 0 && info.ageMs < input.olderThanMs) {
    return "too_recent";
  }

  if (info.dirty && !input.includeDirty) {
    return "dirty_workspace";
  }

  return undefined;
}

async function applyCleanupPlan(candidates) {
  const removed = [];

  for (const candidate of candidates) {
    try {
      if (candidate.kind === "git_worktree") {
        await git([
          "-C",
          candidate.path,
          "worktree",
          "remove",
          "--force",
          candidate.path,
        ]);
      } else {
        await rm(candidate.path, { force: true, recursive: true });
      }

      removed.push({
        path: candidate.path,
        kind: candidate.kind,
        status: "removed",
      });
    } catch (error) {
      removed.push({
        path: candidate.path,
        kind: candidate.kind,
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return removed;
}

async function readWorkspaceKind(workspacePath) {
  const gitPath = resolve(workspacePath, ".git");
  const gitStats = await lstat(gitPath);
  if (gitStats.isFile()) {
    const contents = await readFile(gitPath, "utf8");
    if (
      contents.includes("/worktrees/") ||
      contents.includes("\\worktrees\\")
    ) {
      return "git_worktree";
    }
  }

  return "git_clone";
}

async function readMarker(workspacePath) {
  try {
    const contents = await readFile(
      resolve(workspacePath, markerFileName),
      "utf8",
    );
    return JSON.parse(contents);
  } catch {
    return undefined;
  }
}

async function readDirtyFiles(workspacePath) {
  const output = await gitOutput([
    "-C",
    workspacePath,
    "status",
    "--porcelain",
  ]);
  return output
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);
}

async function hasGitMetadata(path) {
  try {
    await access(resolve(path, ".git"));
    return true;
  } catch {
    return false;
  }
}

async function isAccessibleDirectory(path) {
  try {
    const stats = await stat(path);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

async function readDirectoryEntries(path) {
  try {
    return await readdir(path, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function canonicalPath(path) {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}

async function git(args) {
  await execFileAsync("git", args, {
    maxBuffer: 20 * 1024 * 1024,
    timeout: 10 * 60_000,
  });
}

async function gitOutput(args) {
  try {
    const { stdout } = await execFileAsync("git", args, {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
      timeout: 10 * 60_000,
    });
    return stdout;
  } catch {
    return undefined;
  }
}

function assertSafeWorkspaceRoot(path) {
  const resolvedRoot = resolve(path);
  const resolvedRepoRoot = resolve(repoRoot);
  if (
    resolvedRoot === resolvedRepoRoot ||
    resolvedRoot === dirname(resolvedRepoRoot)
  ) {
    throw new Error(
      `Refusing to treat ${resolvedRoot} as a generated workspace root.`,
    );
  }

  const pathSegments = resolvedRoot.split(sep).filter(Boolean);
  if (pathSegments.length < 2) {
    throw new Error(`Refusing unsafe workspace root: ${resolvedRoot}`);
  }
}

function parseDurationMs(value) {
  const trimmed = value.trim();
  if (/^\d+$/u.test(trimmed)) {
    return Number(trimmed) * 24 * 60 * 60 * 1000;
  }

  const match = /^(\d+(?:\.\d+)?)(m|h|d|w)$/iu.exec(trimmed);
  if (!match) {
    throw new Error(
      `Invalid --older-than value "${value}". Use values like 30m, 12h, 7d, or 2w.`,
    );
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
    w: 7 * 24 * 60 * 60 * 1000,
  };

  return amount * multipliers[unit];
}

function resolvePath(path) {
  return resolve(repoRoot, path);
}

function readArg(values, name) {
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (
      value === name &&
      values[index + 1] &&
      !values[index + 1].startsWith("--")
    ) {
      return values[index + 1];
    }

    if (value.startsWith(`${name}=`)) {
      return value.slice(name.length + 1);
    }
  }

  return undefined;
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

function printSummary(summary) {
  console.log(`Agentic PM workspace cleanup (${summary.mode})`);
  console.log(`Root: ${summary.root}`);
  console.log(`Older than: ${summary.olderThan}`);
  console.log(`Include dirty: ${summary.includeDirty ? "yes" : "no"}`);
  console.log("");
  console.log(`Candidates: ${summary.candidates.length}`);

  for (const candidate of summary.candidates) {
    console.log(
      `- ${candidate.relativePath} (${candidate.kind}, modified ${candidate.modifiedAt})`,
    );
  }

  console.log("");
  console.log(`Skipped: ${summary.skipped.length}`);
  const skipCounts = countBy(summary.skipped.map((item) => item.reason));
  for (const [reason, count] of Object.entries(skipCounts)) {
    console.log(`- ${reason}: ${count}`);
  }

  if (summary.removed.length > 0) {
    console.log("");
    console.log("Removed:");
    for (const item of summary.removed) {
      console.log(`- ${item.status}: ${item.path}`);
    }
  } else if (summary.mode === "dry-run") {
    console.log("");
    console.log(
      "Dry-run only. Re-run with --apply to remove candidate workspace directories.",
    );
  } else {
    console.log("");
    console.log("No workspace directories removed.");
  }
}

function printHelp() {
  console.log(`Usage: pnpm cleanup:workspaces [-- --apply] [-- --json]

Inspects generated agent workspace directories under AGENTIC_PM_WORKSPACE_ROOT.
Dry-run is the default. Apply mode removes only matched candidate directories.

Options:
  --apply                    Remove candidate workspace directories.
  --root <path>              Workspace root. Defaults to AGENTIC_PM_WORKSPACE_ROOT or ./workspaces.
  --older-than <duration>    Candidate minimum age. Defaults to ${defaultOlderThan}. Examples: 30m, 12h, 7d, 2w.
  --include-recent           Disable the age filter.
  --include-dirty            Include workspaces with uncommitted git changes.
  --project <slug>           Restrict to one project folder slug. Can be repeated.
  --repository <slug>        Restrict to one repository folder slug. Can be repeated.
  --json                     Print machine-readable summary.
  --help                     Show this message.
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

function countBy(values) {
  return values.reduce((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function slug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-|-$/gu, "");
}

function sortByPath(values) {
  return [...values].sort((left, right) => left.path.localeCompare(right.path));
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
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
