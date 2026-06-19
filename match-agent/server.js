import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// MCP SERVER
const server = new McpServer({
  name: "github-match-agent",
  version: "1.0.0"
});

// TOOL LOGIC
function getMatchesByDate(date) {
  const filePath = path.join(__dirname, "..", "Match.json");

  const matches = JSON.parse(
    fs.readFileSync(filePath, "utf8")
  );

  return matches.filter(m => m.MatchDate === date);
}

// MCP TOOL (THIS IS THE CORRECT WAY)
server.tool(
  "getMatchesByDate",
  {
    date: z.string().describe("Date in YYYY-MM-DD format")
  },
  async ({ date }) => {
    const result = getMatchesByDate(date);

    return {
    content: [
        {
        type: "text",
        text: `Here are the matches for ${date}:\n` +
                JSON.stringify(result, null, 2)
        }
    ]
    };
  }
);

// START SERVER
const transport = new StdioServerTransport();
await server.connect(transport);

console.error("GitHub Match Agent running...");