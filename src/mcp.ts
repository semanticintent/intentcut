import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { createAgentProjectContext } from "./agent.js";
import { agentEditProposalSchema, validateAgentEditProposal } from "./edit-proposal.js";
import type { LoadedProject } from "./manifest.js";

const readOnlyAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

function result(name: string, value: unknown): CallToolResult {
  const structuredContent = { [name]: value };
  return {
    content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
    structuredContent,
  };
}

export function readProjectContextTool(project: LoadedProject): CallToolResult {
  return result("context", createAgentProjectContext(project));
}

export function validateEditProposalTool(project: LoadedProject, proposal: unknown): CallToolResult {
  return result("validation", validateAgentEditProposal(project, proposal));
}

export function createIntentCutMcpServer(project: LoadedProject): McpServer {
  const server = new McpServer(
    { name: "intentcut", version: "0.0.0" },
    {
      instructions: [
        "Read intentcut_project_context before proposing edits.",
        "Use its exact project revision in every edit proposal.",
        "Validation never applies a proposal. Approval and publication are human-only.",
      ].join(" "),
    },
  );

  server.registerTool(
    "intentcut_project_context",
    {
      title: "Read IntentCut project context",
      description: "Return deterministic project topology, semantic revision, and the complete agent authority boundary. Performs no media inspection or filesystem writes.",
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({ context: z.unknown() }),
      annotations: readOnlyAnnotations,
    },
    async () => readProjectContextTool(project),
  );

  server.registerTool(
    "intentcut_validate_edit_proposal",
    {
      title: "Validate an IntentCut edit proposal",
      description: "Validate a revision-bound declarative edit proposal without applying it or changing the manifest.",
      inputSchema: z.object({ proposal: agentEditProposalSchema }).strict(),
      outputSchema: z.object({ validation: z.unknown() }),
      annotations: readOnlyAnnotations,
    },
    async ({ proposal }) => validateEditProposalTool(project, proposal),
  );

  return server;
}
