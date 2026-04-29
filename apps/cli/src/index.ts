#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";
import { config as loadDotenv } from "dotenv";
import { loadWorkflowDocument, parseWorkflowDocument, renderWorkflowPrompt } from "@agentic-pm/config";

loadDotenv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)) });

const program = new Command();

program
  .name("agentic-pm")
  .description("Local operator CLI for Agentic Project Management")
  .version("0.1.0");

program
  .command("doctor")
  .description("Check local environment and workflow config")
  .option("-w, --workflow <path>", "Path to WORKFLOW.md", "examples/workflow/WORKFLOW.md")
  .action(async (options: { workflow: string }) => {
    const workflowPath = resolve(options.workflow);
    const workflow = await loadWorkflowDocument(dirname(workflowPath), workflowPath.split("/").at(-1));

    console.log("Workflow OK");
    console.log(JSON.stringify(workflow.config, null, 2));
    console.log(`MongoDB: ${process.env.MONGODB_URI ?? "mongodb://localhost:27018"}`);
    console.log(`Redis: ${process.env.REDIS_URL ?? "redis://localhost:6380"}`);
  });

program
  .command("render")
  .description("Render a workflow prompt using a sample issue")
  .argument("<workflow>", "Path to WORKFLOW.md")
  .action(async (workflowPath: string) => {
    const raw = await readFile(resolve(workflowPath), "utf8");
    const workflow = parseWorkflowDocument(raw, workflowPath);
    const prompt = await renderWorkflowPrompt(workflow, {
      issue: {
        identifier: "ENG-1",
        title: "Wire first agent run",
        description: "Sample issue used to validate prompt rendering.",
        url: "https://linear.app/example/issue/ENG-1"
      },
      repository: {
        name: "agentic-project-management",
        defaultBranch: "main"
      }
    });

    console.log(prompt);
  });

await program.parseAsync();
