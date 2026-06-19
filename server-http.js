import fs from "fs";
import path from "path";
import express from "express";
import { fileURLToPath } from "url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

// ----------------------------
// Setup paths (ESM-safe)
// ----------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ----------------------------
// MCP Server
// ----------------------------
const server = new McpServer({
  name: "github-match-agent",
  version: "1.0.0"
});

// ----------------------------
// Helpers
// ----------------------------

// Robust date normalization (fixes Copilot formatting issues)
function normalizeDate(value) {
  const d = new Date(value);
  return d.toISOString().split("T")[0];
}

// Load and filter matches
function getMatchesByDate(date) {
  const filePath = path.join(process.cwd(), "Match.json");

  const matches = JSON.parse(fs.readFileSync(filePath, "utf8"));

  const targetDate = normalizeDate(date);

  return matches.filter(
    (m) => normalizeDate(m.MatchDate) === targetDate
  );
}

// ----------------------------
// MCP Tool
// ----------------------------
server.tool(
  "getMatchesByDate",
  {
    date: z.string()
  },
  async ({ date }) => {

    const matches = getMatchesByDate(date);

    console.log("📩 MCP TOOL CALLED");
    console.log("date received:", date);
    console.log("matches:", matches);
    console.log("match count:", matches.length);

    return {
      content: [
        {
          type: "text",
          text:
            matches.length > 0
              ? matches.map(m => `- ${m.Match}`).join("\n")
              : `I could not find match data for ${date}`
        }
      ]
    };
  }
);

// ----------------------------
// Express App
// ----------------------------
const app = express();
app.use(express.json());

// MCP endpoint
app.all("/mcp", async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined // stateless MCP
    });

    //await server.connect(transport);
    //await transport.handleRequest(req, res);
    await server.handleRequest(transport, req, res);
    
  } catch (err) {
    console.error("❌ MCP Error:", err);
    res.status(500).json({
      error: err.message
    });
  }
});

// Health check
app.get("/", (req, res) => {
  res.send("Football MCP Server is running.");
});

// ----------------------------
// Start server
// ----------------------------
const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`🚀 MCP Server running on port ${port}`);
});