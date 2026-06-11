// Test MCP Server — Phase 3
// Minimal HTTP server implementing the MCP JSON-RPC protocol for local testing.
//
// Tools exposed:
//   sap_ping        — classifies as READ  (should be offered to the model)
//   sap_create_transport — classifies as WRITE (must NOT be offered to the model)
//
// Usage: npx tsx scripts/test-mcp-server.ts
// Then create an mcp_server_config pointing to http://localhost:9090/mcp

import express from "express";

const PORT = 9090;

const TOOLS = [
  {
    name: "sap_ping",
    description:
      "Ping a SAP system and return its availability status. Read-only health check, no data modified.",
    inputSchema: {
      type: "object",
      properties: {
        system: {
          type: "string",
          description: "SAP system name, e.g. DEV, QAS, PRD",
        },
      },
      required: ["system"],
    },
  },
  {
    name: "sap_create_transport",
    description:
      "Create a new SAP Transport Request in the target system. Write operation that modifies the system.",
    inputSchema: {
      type: "object",
      properties: {
        description: { type: "string", description: "Transport description" },
        owner: { type: "string", description: "Owner username" },
      },
      required: ["description", "owner"],
    },
  },
];

const app = express();
app.use(express.json());

app.post("/mcp", (req: express.Request, res: express.Response) => {
  const { jsonrpc, id, method, params } = req.body ?? {};

  if (jsonrpc !== "2.0") {
    return res
      .status(400)
      .json({ jsonrpc: "2.0", id, error: { code: -32600, message: "Invalid Request" } });
  }

  if (method === "initialize") {
    return res.json({
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "test-mcp-server", version: "0.1.0" },
      },
    });
  }

  if (method === "notifications/initialized") {
    return res.status(200).json({ jsonrpc: "2.0", id: null });
  }

  if (method === "tools/list") {
    return res.json({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
  }

  if (method === "tools/call") {
    const { name, arguments: args } = params ?? {};

    if (name === "sap_ping") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [
            {
              type: "text",
              text: `SAP system "${args?.system ?? "??"}" is reachable. Status: OK. Response time: 42ms. Uptime: 99.98%.`,
            },
          ],
          isError: false,
        },
      });
    }

    if (name === "sap_create_transport") {
      return res.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: "Transport DEVK900042 created successfully." }],
          isError: false,
        },
      });
    }

    return res.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: `Tool "${name}" not found` },
    });
  }

  return res.json({
    jsonrpc: "2.0",
    id,
    error: { code: -32601, message: `Method "${method}" not found` },
  });
});

// Health endpoint for quick smoke testing
app.get("/health", (_req, res) => res.json({ status: "ok", tools: TOOLS.length }));

app.listen(PORT, () => {
  console.log(`[TEST-MCP-SERVER] Listening on http://localhost:${PORT}/mcp`);
  console.log(
    `[TEST-MCP-SERVER] Tools: ${TOOLS.map((t) => t.name).join(", ")}`
  );
  console.log(`[TEST-MCP-SERVER] sap_ping   → READ  (will be exposed to model)`);
  console.log(`[TEST-MCP-SERVER] sap_create_transport → WRITE (will be filtered out)`);
});
