import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "node",
  args: ["server.js"]
});

const client = new Client({
  name: "copilot-agent",
  version: "1.0.0"
});

await client.connect(transport);

// Ask your GitHub Agent
const result = await client.callTool({
  name: "getMatchesByDate",
  arguments: {
    date: "2026-06-11"
  }
});

// extract only the text
const text = result.content[0].text;

console.log("\nFINAL ANSWER:\n");
console.log(text);