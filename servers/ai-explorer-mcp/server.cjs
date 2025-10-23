#!/usr/bin/env node

const { Server } = require("@modelcontextprotocol/sdk/server/index");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio");
const { readFile, readdir, stat } = require("fs/promises");
const { join, extname } = require("path");

const server = new Server(
  { name: "ai-explorer-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler("tools/list", async () => {
  return {
    tools: [
      {
        name: "analyzePath",
        description: "分析文件或目录结构",
        inputSchema: {
          type: "object",
          properties: { path: { type: "string", description: "要分析的路径" } },
          required: ["path"]
        }
      }
    ]
  };
});

server.setRequestHandler("tools/call", async (request) => {
  const { name, arguments: args } = request.params;
  try {
    if (name === "analyzePath") {
      const stats = await stat(args.path);
      const result = stats.isFile() 
        ? { type: "file", path: args.path, size: stats.size }
        : { type: "directory", path: args.path, items: (await readdir(args.path)).length };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return { content: [{ type: "text", text: `Error: ${error.message}` }] };
  }
});

async function start() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

if (require.main === module) {
  start().catch(console.error);
}
