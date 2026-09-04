#!/usr/bin/env node

import { serveStdio } from "@modelcontextprotocol/server/stdio";
import { loadProject } from "./manifest.js";
import { createIntentCutMcpServer } from "./mcp.js";

const manifestPath = process.argv[2];
if (!manifestPath) {
  console.error("Usage: intentcut-mcp <manifest>");
  process.exitCode = 1;
} else {
  try {
    const project = await loadProject(manifestPath);
    serveStdio(() => createIntentCutMcpServer(project), {
      onerror: (error) => console.error(`IntentCut MCP error: ${error.message}`),
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
