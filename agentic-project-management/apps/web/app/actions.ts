"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const allowedActions = new Set<WorkItemAction>(["start", "retry", "pause", "resume", "cancel", "complete"]);
const allowedDispatchActions = new Set<DispatchAction>(["pause", "resume", "start_eligible"]);

type WorkItemAction = "start" | "retry" | "pause" | "resume" | "cancel" | "complete";
type DispatchAction = "pause" | "resume" | "start_eligible";

type ActionResponse = {
  data?: {
    status?: string;
    issue?: {
      identifier?: string;
    };
  };
  error?: string;
};

export async function submitWorkItemAction(formData: FormData): Promise<void> {
  const workItemId = String(formData.get("workItemId") ?? "");
  const action = String(formData.get("action") ?? "");
  let redirectUrl = createFeedbackUrl("error", "Choose a valid work item action.");

  if (workItemId && isWorkItemAction(action)) {
    try {
      const response = await fetch(`${apiUrl}/work-items/${workItemId}/actions/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          actorId: "dashboard"
        }),
        cache: "no-store"
      });

      const payload = await readActionResponse(response);
      redirectUrl = response.ok
        ? createFeedbackUrl("success", formatWorkItemSuccess(action, payload))
        : createFeedbackUrl("error", payload.error ?? `Action failed with HTTP ${response.status}.`);
    } catch (error) {
      redirectUrl = createFeedbackUrl("error", formatRequestError("Work item action failed", error));
    }
  }

  revalidatePath("/");
  redirect(redirectUrl);
}

export async function submitDispatchAction(formData: FormData): Promise<void> {
  const action = String(formData.get("action") ?? "");
  let redirectUrl = createFeedbackUrl("error", "Choose a valid dispatch action.");

  if (isDispatchAction(action)) {
    try {
      const response = await fetch(`${apiUrl}/dispatch-control/actions/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          actorId: "dashboard"
        }),
        cache: "no-store"
      });

      const payload = await readActionResponse(response);
      redirectUrl = response.ok
        ? createFeedbackUrl("success", formatDispatchSuccess(action))
        : createFeedbackUrl("error", payload.error ?? `Dispatch action failed with HTTP ${response.status}.`);
    } catch (error) {
      redirectUrl = createFeedbackUrl("error", formatRequestError("Dispatch action failed", error));
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

function createFeedbackUrl(tone: "success" | "error", message: string): string {
  const params = new URLSearchParams({
    feedback: tone,
    message: message.slice(0, 220)
  });

  return `/?${params.toString()}`;
}

function formatWorkItemSuccess(action: WorkItemAction, payload: ActionResponse): string {
  const identifier = payload.data?.issue?.identifier ?? "work item";
  const status = payload.data?.status ? ` (${formatStatus(payload.data.status)})` : "";

  switch (action) {
    case "start":
      return `Started ${identifier}${status}.`;
    case "retry":
      return `Queued retry for ${identifier}${status}.`;
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
    case "start_eligible":
      return "Eligible queued work started.";
  }
}

function formatRequestError(prefix: string, error: unknown): string {
  const message = error instanceof Error ? error.message : "Unknown request error";
  return `${prefix}: ${message}.`;
}

function formatStatus(status: string): string {
  return status.replaceAll("_", " ");
}
