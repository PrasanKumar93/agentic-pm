import { slugify } from "@agentic-pm/core";

export function buildAgentBranchName(issueIdentifier: string, title: string): string {
  const slug = slugify(title);
  return `agent/${issueIdentifier.toLowerCase()}-${slug}`.slice(0, 120);
}

export function isProtectedBranch(branch: string): boolean {
  return ["main", "master", "develop", "production"].includes(branch);
}
