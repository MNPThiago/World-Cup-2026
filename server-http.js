import fs from "fs";
import path from "path";
import express from "express";
import { fileURLToPath } from "url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
// Use the official SSEServerTransport for standard HTTP MCP deployments
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Initialize the MCP Server
const server = new McpServer({
  name: "github-match-agent",
  version: "1.0.0"
});

// Helper Functions
function normalizeDate(value) {
  return new Date(value).toISOString().split("T")[0];
}

function getMatchesByDate(date) {
  const filePath = path.join(process.cwd(), "Match.json");
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const matches = JSON.parse(fs.readFileSync(filePath, "utf8"));
  const target = normalizeDate(date);

  return matches.filter(
    (m) => normalizeDate(m.MatchDate) === target
  );
}

// Define the Tool
server.tool(
  "getMatchesByDate",
  { date: z.string() },
  async ({ date }) => {
    const matches = getMatchesByDate(date);

    console.log("📩 MCP TOOL CALLED");
    console.log("date:", date);
    console.log("count:", matches.length);

    return {
      content: [
        {
          type: "text",
          text: matches.length > 0
            ? matches.map(m => `- ${m.Match}`).join("\n")
            : `No matches found for ${date}`
        }
      ]
    };
  }
);

// Track active sessions globally
let transportSession = null;

// 1. SSE Connection Route (Copilot calls this first)
app.get("/sse", async (req, res) => {
  console.log("🔄 Copilot initiating SSE Handshake...");
  
  // Point Copilot back to our POST endpoint to handle processing
  transportSession = new SSEServerTransport("/messages", res);
  
  await server.connect(transportSession);
});

// 2. Message Payload Handler Route (Copilot passes requests here)
app.post("/messages", async (req, res) => {
  if (!transportSession) {
    return res.status(400).json({ error: "No active SSE transport session established." });
  }
  
  console.log("📩 Received Message Payload:", JSON.stringify(req.body));
  await transportSession.handleMessage(req, res);
});

// Root Healthcheck
app.get("/", (req, res) => {
  res.send("Football MCP Server is running cleanly. v5");
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`🚀 MCP Server running on port ${port}`);
});
