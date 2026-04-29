import type { TrackerKind } from "@agentic-pm/core";
import { agenticPmConfig } from "./agentic-pm.config.js";

export interface LinearTrackerConfig {
  teamKey: string;
  projectSlug?: string;
  activeStates: string[];
  states: {
    running: string;
    review: string;
    failure: string;
    done: string;
    cancelled: string;
  };
}

export interface AgenticPmConfig {
  tracker: {
    kind: TrackerKind;
    linear: LinearTrackerConfig;
  };
}

export interface ResolvedTrackerConfig {
  kind: TrackerKind;
  linear: LinearTrackerConfig;
}

export function readAgenticPmConfig(): AgenticPmConfig {
  return agenticPmConfig;
}

export function readResolvedTrackerConfig(
  env: NodeJS.ProcessEnv = process.env,
): ResolvedTrackerConfig {
  return {
    kind:
      readTrackerKind(env.AGENTIC_PM_TRACKER) ?? agenticPmConfig.tracker.kind,
    linear: agenticPmConfig.tracker.linear,
  };
}

function readTrackerKind(value: string | undefined): TrackerKind | undefined {
  const trimmed = value?.trim();
  return trimmed === "linear" ||
    trimmed === "github" ||
    trimmed === "jira" ||
    trimmed === "fake"
    ? trimmed
    : undefined;
}
