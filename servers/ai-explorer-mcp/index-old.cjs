#!/usr/bin/env node

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { CallToolRequestSchema } = require("@modelcontextprotocol/sdk/types.js");

const { readFile, readdir, stat } = require("fs/promises");
const { join, extname } = require("path");

function registerTools() {
  return [
    {
      name: "analyzePath",
      description: "分析文件或目录结构",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string", description: "要分析的路径" }
        },
        required: ["path"]
      }
    }
  ];
}

async function callTool(name, args) {
  try {
    if (name === "analyzePath") {
      const stats = await stat(args.path);
      if (stats.isFile()) {
        const content = await readFile(args.path, "utf-8");
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              type: "file",
              path: args.path,
              size: stats.size,
              lines: content.split("\n").length
            }, null, 2)
          }]
        };
      } else {
        const files = await readdir(args.path);
        return {
          content: [{
            type: "text", 
            text: JSON.stringify({
              type: "directory",
              path: args.path,
              files: files.slice(0, 10)
            }, null, 2)
          }]
        };
      }
    }
    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error: ${error.message}`
      }]
    };
  }
}

class AIExplorerMCPServer {
  constructor() {
    this.server = new Server(
      { name: "ai-explorer-mcp", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );
    this.availableTools = registerTools();
    this.setupHandlers();
  }

  setupHandlers() {
    this.server.setRequestHandler("tools/list", async () => ({
      tools: this.availableTools
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      return callTool(name, args || {});
    });
  }

  async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

if (require.main === module) {
  const server = new AIExplorerMCPServer();
  server.start().catch(console.error);
}

module.exports = AIExplorerMCPServer;