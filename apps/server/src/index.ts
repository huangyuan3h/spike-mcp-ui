import { createUIResource } from "@mcp-ui/server";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";

const server = new McpServer({
  name: "spike-mcp-ui-server",
  version: "0.0.0",
});

server.registerTool(
  "get_demo_ui",
  {
    description:
      "Return a demo MCP-UI resource that renders an external URL in an iframe",
    inputSchema: {},
  },
  async () => {
    const uiResource = createUIResource({
      uri: "ui://spike/demo/1",
      encoding: "text",
      content: {
        type: "externalUrl",
        iframeUrl: "http://localhost:5174/",
      },
      uiMetadata: {
        "preferred-frame-size": ["100%", "520px"],
        "initial-render-data": {
          message: "Hello from MCP server",
          generatedAt: new Date().toISOString(),
        },
      },
    });

    return { content: [uiResource] };
  }
);

server.registerTool(
  "demo_echo",
  {
    description:
      "Echo any JSON payload (used to prove UIAction(tool) -> tool call -> response)",
    inputSchema: z.record(z.unknown()),
  },
  async (payload) => {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ ok: true, echoed: payload }, null, 2),
        },
      ],
      structuredContent: {
        ok: true,
        echoed: payload,
      },
    };
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[server] MCP server running on stdio");
}

main().catch((error) => {
  console.error("[server] fatal error:", error);
  process.exit(1);
});
