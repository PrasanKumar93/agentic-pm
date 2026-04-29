import type { AgenticPmConfig } from "./project.js";

export const agenticPmConfig = {
  tracker: {
    kind: "linear",
    linear: {
      teamKey: "PRA",
      activeStates: ["Todo"],
      states: {
        running: "In Progress",
        review: "In Review",
        failure: "Todo",
        done: "Done",
        cancelled: "Canceled",
      },
    },
  },
} satisfies AgenticPmConfig;
