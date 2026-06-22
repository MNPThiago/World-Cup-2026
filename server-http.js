import fs from "fs";
import path from "path";
import express from "express";
import { fileURLToPath } from "url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

function normalizeDate(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().split("T")[0];
}

function getMatchesByDate(date) {
  const filePath = path.join(__dirname, "Match.json");
  if (!fs.existsSync(filePath)) {
    return [];
  }

  const target = normalizeDate(date);
  if (!target) {
    return [];
  }

  const matches = JSON.parse(fs.readFileSync(filePath, "utf8"));

  return matches.filter((m) => normalizeDate(m.MatchDate) === target);
}

function buildMcpServer() {
  const mcp = new McpServer({
    name: "github-match-agent",
    version: "1.0.0"
  });

  mcp.tool(
    "getMatchesByDate",
    { date: z.string() },
    async ({ date }) => {
      const matches = getMatchesByDate(date);

      console.log("MCP tool called: getMatchesByDate", { date, count: matches.length });

      return {
        content: [
          {
            type: "text",
            text: matches.length > 0
              ? matches.map((m) => `- ${m.Match}`).join("\n")
              : `No matches found for ${date}`
          }
        ]
      };
    }
  );

  return mcp;
}

// Keep HTTP and SSE transports isolated so either integration can work independently.
const httpMcpServer = buildMcpServer();
const sseMcpServer = buildMcpServer();

let sseTransport = null;

async function handleStreamableHttp(req, res) {
  try {
    // Create a fresh transport for each request (stateless mode)
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });
    await httpMcpServer.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error("HTTP MCP transport error", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "MCP HTTP transport failure" });
    }
  }
}

// MCP over Streamable HTTP (for connectors that POST initialize/callTool directly)
app.all("/mcp", handleStreamableHttp);

// Compatibility route for connectors configured with base path '/'
app.post("/", handleStreamableHttp);

// MCP over SSE (for clients that do GET /sse then POST /messages)
app.get("/sse", async (req, res) => {
  try {
    console.log("SSE handshake started");
    sseTransport = new SSEServerTransport("/messages", res);
    await sseMcpServer.connect(sseTransport);
  } catch (error) {
    console.error("SSE transport error", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "MCP SSE transport failure" });
    }
  }
});

app.post("/messages", async (req, res) => {
  try {
    if (!sseTransport) {
      return res.status(400).json({ error: "No active SSE session. Call /sse first." });
    }

    await sseTransport.handleMessage(req, res);
  } catch (error) {
    console.error("SSE message handling error", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "MCP SSE message failure" });
    }
  }
});

app.get("/", (req, res) => {
  res.send("Football V6 MCP server is running. Use /mcp for MCP over HTTP.");
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`MCP server listening on port ${port}`);
});
