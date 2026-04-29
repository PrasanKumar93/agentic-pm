export const statusTone = {
  queued: "neutral",
  running: "blue",
  waiting_for_review: "amber",
  blocked: "red",
  paused: "neutral",
  failed: "red",
  completed: "green",
  cancelled: "neutral"
} as const;
