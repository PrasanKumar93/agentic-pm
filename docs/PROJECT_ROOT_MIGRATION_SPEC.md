# Project Root Migration Spec

Status: Implemented
Date: 2026-04-30

## Goal

The Git repository root should be the Agentic PM project root. Source code, docs, package manifests, local config examples, and workspace tooling should live directly under the Git root instead of under a nested `agentic-project-management/` folder.

The outer folder name is not part of the product contract. It can be renamed later by the operator without changing tracked files.

## Final Layout

```text
<repo-root>/
  .git/
  .env
  .env.example
  apps/
  docker/
  docs/
  examples/
  packages/
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
```

Generated runtime output remains local and ignored:

```text
<repo-root>/workspaces/
<repo-root>/workspaces-smoke/
<repo-root>/artifacts/
<repo-root>/artifacts-smoke/
```

## Migration Rules

- Remove generated workspace worktrees through `git worktree remove` or `git worktree prune` before deleting folders.
- Move tracked project files with Git-aware moves so history is preserved as renames.
- Preserve `.env` locally and keep it ignored.
- Keep dependency/build output ignored after the move.
- Do not commit generated workspaces, artifacts, `node_modules`, `.turbo`, `.next`, `dist`, or local secrets.

## Runtime Behavior

API and worker processes derive the default local repository path from their package runtime root unless `AGENTIC_PM_REPOSITORY_LOCAL_PATH` is explicitly set.

After the root migration, the default managed repository should resolve to `<repo-root>`, and generated agent workspaces should be created under `<repo-root>/workspaces/...`.

## Acceptance

- `git rev-parse --show-toplevel` returns the project root containing `apps/`, `packages/`, and `docs/`.
- `git worktree list --porcelain` shows only the main worktree after generated smoke worktrees are removed.
- `git status --short --ignored` shows tracked files as renames and generated output as ignored.
- `pnpm typecheck` passes from the flattened root.
- `pnpm build` passes from the flattened root.
