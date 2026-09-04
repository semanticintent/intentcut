import { InMemoryTransport, LATEST_PROTOCOL_VERSION, type JSONRPCMessage } from "@modelcontextprotocol/server";
import { describe, expect, it } from "vitest";
import { createAgentProjectContext } from "../src/agent.js";
import { createIntentCutMcpServer, readProjectContextTool, validateEditProposalTool } from "../src/mcp.js";
import type { LoadedProject } from "../src/manifest.js";

function project(): LoadedProject {
  return {
    baseDirectory: "/production", manifestPath: "/production/intentcut.yaml",
    manifest: {
      version: 1,
      project: { title: "MCP", resolution: { width: 1920, height: 1080 }, fps: 30, maximumDuration: "3m" },
      scenes: [{ id: "demo", type: "video", source: "demo.mov", speed: 1 }],
      annotations: [],
      inspection: { contactSheets: { samples: 12, columns: 4, frameWidth: 480 }, cutDetection: { threshold: 0.18, minimumGap: "1s", maximumCandidates: 20 }, silenceDetection: { thresholdDb: -35, minimumDuration: "500ms" }, transcripts: [] },
      output: { file: "preview.mp4", codec: "h264", reportDirectory: "reports" },
    },
  };
}

async function request(transport: InMemoryTransport, message: JSONRPCMessage): Promise<JSONRPCMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Timed out waiting for MCP response.")), 2_000);
    const previous = transport.onmessage;
    transport.onmessage = (response) => {
      previous?.(response);
      if (!("id" in response) || !("id" in message) || response.id !== message.id) return;
      clearTimeout(timer);
      resolve(response);
    };
    void transport.send(message);
  });
}

describe("bounded MCP adapter", () => {
  it("returns the same read-only context as the provider-neutral API", () => {
    const current = project();
    expect(readProjectContextTool(current).structuredContent).toEqual({ context: createAgentProjectContext(current) });
  });

  it("returns validation-only proposal results", () => {
    const current = project();
    const proposal = {
      kind: "intentcut-edit-proposal", version: 1,
      expectedRevision: createAgentProjectContext(current).project.revision,
      summary: "Increase the demonstration speed.",
      operations: [{ id: "speed-demo", operation: "scene.set-speed", sceneId: "demo", speed: 1.25 }],
      authority: { state: "proposed-only", applied: false },
    };
    expect(validateEditProposalTool(current, proposal).structuredContent).toEqual({
      validation: expect.objectContaining({ valid: true, authority: { state: "validation-only", applied: false, manifestWritten: false } }),
    });
  });

  it("registers exactly two read-only MCP tools over a real protocol connection", async () => {
    const server = createIntentCutMcpServer(project());
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await clientTransport.start();
    await server.connect(serverTransport);
    try {
      await request(clientTransport, {
        jsonrpc: "2.0", id: 1, method: "initialize",
        params: { protocolVersion: LATEST_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "intentcut-test", version: "1" } },
      });
      await clientTransport.send({ jsonrpc: "2.0", method: "notifications/initialized" });
      const response = await request(clientTransport, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
      expect(response).toHaveProperty("result.tools");
      const tools = (response as { result: { tools: Array<{ name: string; annotations?: Record<string, unknown> }> } }).result.tools;
      expect(tools.map((tool) => tool.name)).toEqual(["intentcut_project_context", "intentcut_validate_edit_proposal"]);
      expect(tools.every((tool) => tool.annotations?.readOnlyHint === true && tool.annotations?.destructiveHint === false)).toBe(true);

      const contextResponse = await request(clientTransport, {
        jsonrpc: "2.0", id: 3, method: "tools/call",
        params: { name: "intentcut_project_context", arguments: {} },
      });
      expect(contextResponse).toHaveProperty("result.structuredContent.context.authority.state", "read-only");

      const current = project();
      const validationResponse = await request(clientTransport, {
        jsonrpc: "2.0", id: 4, method: "tools/call",
        params: {
          name: "intentcut_validate_edit_proposal",
          arguments: { proposal: {
            kind: "intentcut-edit-proposal", version: 1,
            expectedRevision: createAgentProjectContext(current).project.revision,
            summary: "Increase the demonstration speed.",
            operations: [{ id: "speed-demo", operation: "scene.set-speed", sceneId: "demo", speed: 1.25 }],
            authority: { state: "proposed-only", applied: false },
          } },
        },
      });
      expect(validationResponse).toHaveProperty("result.structuredContent.validation.valid", true);
      expect(validationResponse).toHaveProperty("result.structuredContent.validation.authority.manifestWritten", false);
    } finally {
      await server.close();
      await clientTransport.close();
    }
  });
});
