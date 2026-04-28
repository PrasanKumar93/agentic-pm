"use server";

import { revalidatePath } from "next/cache";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
const allowedActions = new Set(["start", "retry", "pause", "resume", "cancel"]);

export async function submitWorkItemAction(formData: FormData): Promise<void> {
  const workItemId = String(formData.get("workItemId") ?? "");
  const action = String(formData.get("action") ?? "");

  if (!workItemId || !allowedActions.has(action)) {
    return;
  }

  await fetch(`${apiUrl}/work-items/${workItemId}/actions/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      actorId: "dashboard"
    }),
    cache: "no-store"
  });

  revalidatePath("/");
}
