import fs from "fs";
import path from "path";
import express from "express";
import { fileURLToPath } from "url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//
// Create MCP server
//
const server = new McpServer({
  name: "github-match-agent",
  version: "1.0.0"
});

//
// Business logic (same as server.js)
//
function getMatchesByDate(date) {
  const filePath = path.join(__dirname, "..", "Match.json");

  const matches = JSON.parse(
    fs.readFileSync(filePath, "utf8")
  );

  return matches.filter(
    m => m.MatchDate === date
  );
}

//
// MCP tool (same as server.js)
//
server.tool(
  "getMatchesByDate",
  {
    date: z.string()
  },
  async ({ date }) => {
    const matches = getMatchesByDate(date);

    return {
      content: [
        {
          type: "text",
          text:
            matches.length > 0
              ? matches.map(m => `- ${m.Match}`).join("\n")
              : `No matches found for ${date}`
        }
      ]
    };
  }
);

//
// Express app
//
const app = express();
app.use(express.json());

//
// MCP endpoint
//
app.all("/mcp", async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined // stateless
    });

    await server.connect(transport);
    await transport.handleRequest(req, res);
  }
  catch (err) {
    console.error(err);
    res.status(500).json({
      error: err.message
    });
  }
});

//
// Health endpoint
//
app.get("/", (req, res) => {
  res.send("Football MCP Server is running.");
});

//
// Start server
//
const port = process.env.PORT || 3000;

app.listen(port, () => {
  console.log(`Football MCP Server listening on port ${port}`);
});