#!/usr/bin/env node

const { readFile, readdir, stat } = require("fs/promises");
const { join, extname } = require("path");

async function startServer() {
  try {
    const { Server } = await import("@modelcontextprotocol/sdk/server/index.js");
    const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
    const { CallToolRequestSchema, ListToolsRequestSchema } = await import("@modelcontextprotocol/sdk/types.js");

    const server = new Server(
      { name: "ai-explorer-mcp", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [{
          name: "analyzePath",
          description: "分析文件或目录路径",
          inputSchema: {
            type: "object",
            properties: { path: { type: "string", description: "要分析的路径" } },
            required: ["path"]
          }
        }]
      };
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      
      if (name === "analyzePath") {
        try {
          const stats = await stat(args.path);
          const result = {
            path: args.path,
            exists: true,
            type: stats.isDirectory() ? "directory" : "file",
            size: stats.size,
            modified: stats.mtime.toISOString()
          };
          
          return {
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }]
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: JSON.stringify({ path: args.path, exists: false, error: error.message }, null, 2) }],
            isError: true
          };
        }
      }
      
      throw new Error(`未知工具: ${name}`);
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("MCP Server 启动成功");

  } catch (error) {
    console.error("启动失败:", error);
    process.exit(1);
  }
}

startServer();
