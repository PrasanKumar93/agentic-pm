"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const allowedActions = new Set<WorkItemAction>([
  "start",
  "retry",
  "request_changes",
  "pause",
  "resume",
  "cancel",
  "complete",
]);
const allowedDispatchActions = new Set<DispatchAction>([
  "pause",
  "resume",
]);
const allowedDesiredRuntimes = new Set<DesiredRuntimePreference>([
  "default",
  "fake",
  "codex",
  "cursor",
  "generic",
]);
const allowedPullRequestModes = new Set<PullRequestMode>([
  "disabled",
  "local_draft",
  "github_draft",
]);
const allowedViews = new Set(["audit", "config"]);
const allowedStatusFilters = new Set([
  "queued",
  "running",
  "waiting_for_review",
  "blocked",
  "paused",
  "failed",
  "completed",
  "cancelled",
]);

type WorkItemAction =
  | "start"
  | "retry"
  | "request_changes"
  | "pause"
  | "resume"
  | "cancel"
  | "complete";
type DispatchAction = "pause" | "resume";
type DesiredRuntimePreference =
  | "default"
  | "fake"
  | "codex"
  | "cursor"
  | "generic";
type PullRequestMode = "disabled" | "local_draft" | "github_draft";

type ReturnState = {
  projectId?: string;
  status?: string;
  view?: string;
  workItemId?: string;
};

type ActionResponse = {
  data?: {
    checks?: Array<{
      label?: string;
      message?: string;
      status?: string;
    }>;
    id?: string;
    name?: string;
    desiredRuntime?: string;
    repository?: {
      name?: string;
    };
    status?: string;
    issue?: {
      identifier?: string;
    };
  };
  error?: string;
};

export async function submitRepositoryRegistration(
  formData: FormData,
): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const defaultBranch = String(formData.get("defaultBranch") ?? "").trim();
  const localPath = String(formData.get("localPath") ?? "").trim();
  const prMode = String(formData.get("prMode") ?? "local_draft").trim();
  const prRemoteName = String(formData.get("prRemoteName") ?? "").trim();
  const prBaseBranch = String(formData.get("prBaseBranch") ?? "").trim();
  const prBranchPrefix = String(formData.get("prBranchPrefix") ?? "").trim();
  const prBranchMaxLength = String(
    formData.get("prBranchMaxLength") ?? "",
  ).trim();
  const prBranchIncludeTimestamp =
    formData.get("prBranchIncludeTimestamp") === "on";
  const prDraft = formData.get("prDraft") === "on";
  const returnState = {
    ...readReturnState(formData),
    view: "config",
  };
  let redirectUrl = createFeedbackUrl(
    "error",
    "Repository name and URL are required.",
    returnState,
  );

  if (name && url && isPullRequestMode(prMode)) {
    try {
      const response = await fetch(`${apiUrl}/repositories`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actorId: "dashboard",
          defaultBranch,
          localPath,
          name,
          projectId: returnState.projectId,
          pullRequest: {
            baseBranch: prBaseBranch,
            branch: {
              includeTimestamp: prBranchIncludeTimestamp,
              maxLength: Number(prBranchMaxLength) || undefined,
              prefix: prBranchPrefix,
            },
            draft: prDraft,
            mode: prMode,
            remoteName: prRemoteName,
          },
          url,
        }),
        cache: "no-store",
      });

      const payload = await readActionResponse(response);
      redirectUrl = response.ok
        ? createFeedbackUrl(
            "success",
            formatRepositorySuccess(payload),
            returnState,
          )
        : createFeedbackUrl(
            "error",
            payload.error ??
              `Repository registration failed with HTTP ${response.status}.`,
            returnState,
          );
    } catch (error) {
      redirectUrl = createFeedbackUrl(
        "error",
        formatRequestError("Repository registration failed", error),
        returnState,
      );
    }
  }

  revalidatePath("/");
  redirect(redirectUrl);
}

export async function submitRepositoryUpdate(
  formData: FormData,
): Promise<void> {
  const repositoryId = String(formData.get("repositoryId") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const defaultBranch = String(formData.get("defaultBranch") ?? "").trim();
  const localPath = String(formData.get("localPath") ?? "").trim();
  const prMode = String(formData.get("prMode") ?? "local_draft").trim();
  const prRemoteName = String(formData.get("prRemoteName") ?? "").trim();
  const prBaseBranch = String(formData.get("prBaseBranch") ?? "").trim();
  const prBranchPrefix = String(formData.get("prBranchPrefix") ?? "").trim();
  const prBranchMaxLength = String(
    formData.get("prBranchMaxLength") ?? "",
  ).trim();
  const prBranchIncludeTimestamp =
    formData.get("prBranchIncludeTimestamp") === "on";
  const prDraft = formData.get("prDraft") === "on";
  const returnState = {
    ...readReturnState(formData),
    view: "config",
  };
  let redirectUrl = createFeedbackUrl(
    "error",
    "Choose a valid repository to update.",
    returnState,
  );

  if (
    isSafeQueryValue(repositoryId) &&
    name &&
    url &&
    isPullRequestMode(prMode)
  ) {
    try {
      const response = await fetch(`${apiUrl}/repositories/${repositoryId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actorId: "dashboard",
          defaultBranch,
          localPath,
          name,
          projectId: returnState.projectId,
          pullRequest: {
            baseBranch: prBaseBranch,
            branch: {
              includeTimestamp: prBranchIncludeTimestamp,
              maxLength: Number(prBranchMaxLength) || undefined,
              prefix: prBranchPrefix,
            },
            draft: prDraft,
            mode: prMode,
            remoteName: prRemoteName,
          },
          url,
        }),
        cache: "no-store",
      });

      const payload = await readActionResponse(response);
      redirectUrl = response.ok
        ? createFeedbackUrl(
            "success",
            formatRepositoryUpdateSuccess(payload),
            returnState,
          )
        : createFeedbackUrl(
            "error",
            payload.error ??
              `Repository update failed with HTTP ${response.status}.`,
            returnState,
          );
    } catch (error) {
      redirectUrl = createFeedbackUrl(
        "error",
        formatRequestError("Repository update failed", error),
        returnState,
      );
    }
  }

  revalidatePath("/");
  redirect(redirectUrl);
}

export async function submitRepositoryArchive(
  formData: FormData,
): Promise<void> {
  const repositoryId = String(formData.get("repositoryId") ?? "").trim();
  const repositoryName = String(formData.get("repositoryName") ?? "").trim();
  const confirmationName = String(
    formData.get("confirmationName") ?? "",
  ).trim();
  const reason = String(formData.get("archiveReason") ?? "").trim();
  const returnState = {
    ...readReturnState(formData),
    view: "config",
  };
  let redirectUrl = createFeedbackUrl(
    "error",
    `Type ${repositoryName || "the repository name"} to archive this repository.`,
    returnState,
  );

  if (
    isSafeQueryValue(repositoryId) &&
    repositoryName &&
    confirmationName === repositoryName
  ) {
    try {
      const response = await fetch(
        `${apiUrl}/repositories/${repositoryId}/archive`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            actorId: "dashboard",
            confirmationName,
            projectId: returnState.projectId,
            reason,
          }),
          cache: "no-store",
        },
      );

      const payload = await readActionResponse(response);
      redirectUrl = response.ok
        ? createFeedbackUrl(
            "success",
            formatRepositoryArchiveSuccess(payload),
            returnState,
          )
        : createFeedbackUrl(
            "error",
            payload.error ??
              `Repository archive failed with HTTP ${response.status}.`,
            returnState,
          );
    } catch (error) {
      redirectUrl = createFeedbackUrl(
        "error",
        formatRequestError("Repository archive failed", error),
        returnState,
      );
    }
  }

  revalidatePath("/");
  redirect(redirectUrl);
}

export async function submitRepositoryConnectivityCheck(
  formData: FormData,
): Promise<void> {
  const name = String(formData.get("name") ?? "").trim();
  const url = String(formData.get("url") ?? "").trim();
  const defaultBranch = String(formData.get("defaultBranch") ?? "").trim();
  const localPath = String(formData.get("localPath") ?? "").trim();
  const prMode = String(formData.get("prMode") ?? "local_draft").trim();
  const prRemoteName = String(formData.get("prRemoteName") ?? "").trim();
  const prBaseBranch = String(formData.get("prBaseBranch") ?? "").trim();
  const prBranchPrefix = String(formData.get("prBranchPrefix") ?? "").trim();
  const prBranchMaxLength = String(
    formData.get("prBranchMaxLength") ?? "",
  ).trim();
  const prBranchIncludeTimestamp =
    formData.get("prBranchIncludeTimestamp") === "on";
  const repositoryId = String(formData.get("repositoryId") ?? "").trim();
  const returnState = {
    ...readReturnState(formData),
    view: "config",
  };
  let redirectUrl = createFeedbackUrl(
    "error",
    "Repository name and URL are required for access check.",
    returnState,
  );

  if (name && url && isPullRequestMode(prMode)) {
    try {
      const response = await fetch(
        `${apiUrl}/repositories/connectivity-check`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            actorId: "dashboard",
            defaultBranch,
            localPath,
            name,
            projectId: returnState.projectId,
            repositoryId: repositoryId || undefined,
            pullRequest: {
              baseBranch: prBaseBranch,
              branch: {
                includeTimestamp: prBranchIncludeTimestamp,
                maxLength: Number(prBranchMaxLength) || undefined,
                prefix: prBranchPrefix,
              },
              mode: prMode,
              remoteName: prRemoteName,
            },
            url,
          }),
          cache: "no-store",
        },
      );

      const payload = await readActionResponse(response);
      redirectUrl = response.ok
        ? createFeedbackUrl(
            payload.data?.status === "error" ? "error" : "success",
            formatRepositoryConnectivitySuccess(payload),
            returnState,
          )
        : createFeedbackUrl(
            "error",
            payload.error ??
              `Repository access check failed with HTTP ${response.status}.`,
            returnState,
          );
    } catch (error) {
      redirectUrl = createFeedbackUrl(
        "error",
        formatRequestError("Repository access check failed", error),
        returnState,
      );
    }
  }

  revalidatePath("/");
  redirect(redirectUrl);
}

export async function submitCreateWorkItem(formData: FormData): Promise<void> {
  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const repositoryId = String(formData.get("repositoryId") ?? "");
  const desiredRuntime = String(formData.get("desiredRuntime") ?? "default");
  const returnState = readReturnState(formData);
  let redirectUrl = createFeedbackUrl(
    "error",
    "Choose a valid repository and title.",
    returnState,
  );

  if (
    title &&
    isSafeQueryValue(repositoryId) &&
    isDesiredRuntimePreference(desiredRuntime)
  ) {
    try {
      const response = await fetch(`${apiUrl}/work-items`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          actorId: "dashboard",
          description,
          desiredRuntime,
          projectId: returnState.projectId,
          repositoryId,
          title,
        }),
        cache: "no-store",
      });

      const payload = await readActionResponse(response);
      const nextState = response.ok
        ? {
            ...returnState,
            status: "queued",
            workItemId: payload.data?.id,
          }
        : returnState;
      redirectUrl = response.ok
        ? createFeedbackUrl(
            "success",
            formatCreateWorkItemSuccess(payload),
            nextState,
          )
        : createFeedbackUrl(
            "error",
            payload.error ??
              `Work item creation failed with HTTP ${response.status}.`,
            returnState,
          );
    } catch (error) {
      redirectUrl = createFeedbackUrl(
        "error",
        formatRequestError("Work item creation failed", error),
        returnState,
      );
    }
  }

  revalidatePath("/");
  redirect(redirectUrl);
}

export async function submitWorkItemAction(formData: FormData): Promise<void> {
  const workItemId = String(formData.get("workItemId") ?? "");
  const action = String(formData.get("action") ?? "");
  const returnState = readReturnState(formData);
  let redirectUrl = createFeedbackUrl(
    "error",
    "Choose a valid work item action.",
    returnState,
  );

  if (workItemId && isWorkItemAction(action)) {
    try {
      const response = await fetch(
        `${apiUrl}/work-items/${workItemId}/actions/${action}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            actorId: "dashboard",
            projectId: returnState.projectId,
          }),
          cache: "no-store",
        },
      );

      const payload = await readActionResponse(response);
      redirectUrl = response.ok
        ? createFeedbackUrl(
            "success",
            formatWorkItemSuccess(action, payload),
            returnState,
          )
        : createFeedbackUrl(
            "error",
            payload.error ?? `Action failed with HTTP ${response.status}.`,
            returnState,
          );
    } catch (error) {
      redirectUrl = createFeedbackUrl(
        "error",
        formatRequestError("Work item action failed", error),
        returnState,
      );
    }
  }

  revalidatePath("/");
  redirect(redirectUrl);
}

export async function submitReviewChangeRequest(
  formData: FormData,
): Promise<void> {
  const workItemId = String(formData.get("workItemId") ?? "");
  const desiredRuntime = String(
    formData.get("desiredRuntime") ?? "default",
  ).trim();
  const feedback = String(formData.get("feedback") ?? "").trim();
  const returnState = readReturnState(formData);
  let redirectUrl = createFeedbackUrl(
    "error",
    "Add review feedback before requesting changes.",
    returnState,
  );

  if (
    workItemId &&
    feedback.length > 0 &&
    isDesiredRuntimePreference(desiredRuntime)
  ) {
    try {
      const response = await fetch(
        `${apiUrl}/work-items/${workItemId}/actions/request_changes`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            actorId: "dashboard",
            desiredRuntime,
            feedback,
          }),
          cache: "no-store",
        },
      );

      const payload = await readActionResponse(response);
      redirectUrl = response.ok
        ? createFeedbackUrl(
            "success",
            formatWorkItemSuccess("request_changes", payload),
            returnState,
          )
        : createFeedbackUrl(
            "error",
            payload.error ??
              `Change request failed with HTTP ${response.status}.`,
            returnState,
          );
    } catch (error) {
      redirectUrl = createFeedbackUrl(
        "error",
        formatRequestError("Change request failed", error),
        returnState,
      );
    }
  }

  revalidatePath("/");
  redirect(redirectUrl);
}

export async function submitDispatchAction(formData: FormData): Promise<void> {
  const action = String(formData.get("action") ?? "");
  const returnState = readReturnState(formData);
  let redirectUrl = createFeedbackUrl(
    "error",
    "Choose a valid dispatch action.",
    returnState,
  );

  if (isDispatchAction(action)) {
    try {
      const response = await fetch(
        `${apiUrl}/dispatch-control/actions/${action}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            actorId: "dashboard",
            projectId: returnState.projectId,
          }),
          cache: "no-store",
        },
      );

      const payload = await readActionResponse(response);
      redirectUrl = response.ok
        ? createFeedbackUrl(
            "success",
            formatDispatchSuccess(action),
            returnState,
          )
        : createFeedbackUrl(
            "error",
            payload.error ??
              `Dispatch action failed with HTTP ${response.status}.`,
            returnState,
          );
    } catch (error) {
      redirectUrl = createFeedbackUrl(
        "error",
        formatRequestError("Dispatch action failed", error),
        returnState,
      );
    }
  }

  revalidatePath("/");
  redirect(redirectUrl);
}

export async function submitRuntimePreference(
  formData: FormData,
): Promise<void> {
  const workItemId = String(formData.get("workItemId") ?? "");
  const desiredRuntime = String(formData.get("desiredRuntime") ?? "default");
  const returnState = readReturnState(formData);
  let redirectUrl = createFeedbackUrl(
    "error",
    "Choose a valid runtime.",
    returnState,
  );

  if (workItemId && isDesiredRuntimePreference(desiredRuntime)) {
    try {
      const response = await fetch(
        `${apiUrl}/work-items/${workItemId}/runtime`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            actorId: "dashboard",
            desiredRuntime,
          }),
          cache: "no-store",
        },
      );

      const payload = await readActionResponse(response);
      redirectUrl = response.ok
        ? createFeedbackUrl(
            "success",
            formatRuntimeSuccess(desiredRuntime, payload),
            returnState,
          )
        : createFeedbackUrl(
            "error",
            payload.error ??
              `Runtime preference failed with HTTP ${response.status}.`,
            returnState,
          );
    } catch (error) {
      redirectUrl = createFeedbackUrl(
        "error",
        formatRequestError("Runtime preference failed", error),
        returnState,
      );
    }
  }

  revalidatePath("/");
  redirect(redirectUrl);
}

export async function submitPullRequestLink(formData: FormData): Promise<void> {
  const artifactId = String(formData.get("artifactId") ?? "");
  const remotePrUrl = String(formData.get("remotePrUrl") ?? "").trim();
  const returnState = readReturnState(formData);
  let redirectUrl = createFeedbackUrl(
    "error",
    "Enter a valid pull request URL.",
    returnState,
  );

  if (isSafeQueryValue(artifactId) && isHttpUrl(remotePrUrl)) {
    try {
      const response = await fetch(
        `${apiUrl}/artifacts/${artifactId}/link-pr`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            actorId: "dashboard",
            remoteName: "origin",
            remotePrUrl,
          }),
          cache: "no-store",
        },
      );

      const payload = await readActionResponse(response);
      redirectUrl = response.ok
        ? createFeedbackUrl("success", "Linked pull request.", returnState)
        : createFeedbackUrl(
            "error",
            payload.error ?? `PR link failed with HTTP ${response.status}.`,
            returnState,
          );
    } catch (error) {
      redirectUrl = createFeedbackUrl(
        "error",
        formatRequestError("PR link failed", error),
        returnState,
      );
    }
  }

  revalidatePath("/");
  redirect(redirectUrl);
}

function isWorkItemAction(value: string): value is WorkItemAction {
  return allowedActions.has(value as WorkItemAction);
}

function isDispatchAction(value: string): value is DispatchAction {
  return allowedDispatchActions.has(value as DispatchAction);
}

function isDesiredRuntimePreference(
  value: string,
): value is DesiredRuntimePreference {
  return allowedDesiredRuntimes.has(value as DesiredRuntimePreference);
}

function isPullRequestMode(value: string): value is PullRequestMode {
  return allowedPullRequestModes.has(value as PullRequestMode);
}

async function readActionResponse(response: Response): Promise<ActionResponse> {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as ActionResponse;
  } catch {
    return {};
  }
}

function createFeedbackUrl(
  tone: "success" | "error",
  message: string,
  returnState: ReturnState,
): string {
  const params = new URLSearchParams({
    feedback: tone,
    message: message.slice(0, 220),
  });

  if (returnState.status) {
    params.set("status", returnState.status);
  }

  if (returnState.projectId) {
    params.set("projectId", returnState.projectId);
  }

  if (returnState.view) {
    params.set("view", returnState.view);
  }

  if (returnState.workItemId) {
    params.set("workItemId", returnState.workItemId);
  }

  return `/?${params.toString()}`;
}

function readReturnState(formData: FormData): ReturnState {
  const projectId = String(formData.get("projectId") ?? "");
  const status = String(formData.get("status") ?? "");
  const view = String(formData.get("view") ?? "");
  const workItemId = String(formData.get("workItemId") ?? "");

  return {
    projectId: isSafeQueryValue(projectId) ? projectId : undefined,
    status: allowedStatusFilters.has(status) ? status : undefined,
    view: allowedViews.has(view) ? view : undefined,
    workItemId: isSafeQueryValue(workItemId) ? workItemId : undefined,
  };
}

function isSafeQueryValue(value: string): boolean {
  return /^[A-Za-z0-9_.:-]{1,128}$/.test(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function formatWorkItemSuccess(
  action: WorkItemAction,
  payload: ActionResponse,
): string {
  const identifier = payload.data?.issue?.identifier ?? "work item";
  const status = payload.data?.status
    ? ` (${formatStatus(payload.data.status)})`
    : "";

  switch (action) {
    case "start":
      return `Started ${identifier}${status}.`;
    case "retry":
      return `Queued retry for ${identifier}${status}.`;
    case "request_changes":
      return `Queued PR changes for ${identifier}${status}.`;
    case "pause":
      return `Paused ${identifier}${status}.`;
    case "resume":
      return `Resumed ${identifier}${status}.`;
    case "cancel":
      return `Cancelled ${identifier}${status}.`;
    case "complete":
      return `Completed ${identifier}${status}.`;
  }
}

function formatDispatchSuccess(action: DispatchAction): string {
  switch (action) {
    case "pause":
      return "Dispatch paused.";
    case "resume":
      return "Dispatch resumed.";
  }
}

function formatRuntimeSuccess(
  desiredRuntime: DesiredRuntimePreference,
  payload: ActionResponse,
): string {
  const identifier = payload.data?.issue?.identifier ?? "work item";
  const runtime =
    desiredRuntime === "default"
      ? "default runtime"
      : formatStatus(desiredRuntime);
  return `Set ${identifier} to ${runtime}.`;
}

function formatCreateWorkItemSuccess(payload: ActionResponse): string {
  const identifier = payload.data?.issue?.identifier ?? "work item";
  const repository = payload.data?.repository?.name;
  return repository
    ? `Created ${identifier} for ${repository}.`
    : `Created ${identifier}.`;
}

function formatRepositorySuccess(payload: ActionResponse): string {
  const name = payload.data?.name ?? "repository";
  return `Registered ${name}.`;
}

function formatRepositoryUpdateSuccess(payload: ActionResponse): string {
  const name = payload.data?.name ?? "repository";
  return `Updated ${name}.`;
}

function formatRepositoryArchiveSuccess(payload: ActionResponse): string {
  const name = payload.data?.name ?? "repository";
  return `Archived ${name}.`;
}

function formatRepositoryConnectivitySuccess(payload: ActionResponse): string {
  const name = payload.data?.name ?? "repository";
  const status = payload.data?.status ?? "unknown";
  const summary = payload.data?.checks
    ?.map((check) => `${check.label ?? "Check"}: ${check.status ?? "unknown"}`)
    .join("; ");
  return `Checked ${name}: ${status}${summary ? ` (${summary})` : ""}.`;
}

function formatRequestError(prefix: string, error: unknown): string {
  const message =
    error instanceof Error ? error.message : "Unknown request error";
  return `${prefix}: ${message}.`;
}

function formatStatus(status: string): string {
  return status.replaceAll("_", " ");
}
