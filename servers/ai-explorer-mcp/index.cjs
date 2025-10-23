#!/usr/bin/env node

const { readFile, readdir, stat } = require("fs/promises");
const { join, extname, basename, dirname } = require("path");

// 简化的安全过滤器
class SimpleSecurity {
  static SENSITIVE_PATTERNS = [
    /^\.env$/i, /^\.env\..+$/i, /password/i, /secret/i, /credential/i,
    /\.key$/i, /\.pem$/i, /\.crt$/i, /id_rsa$/i, /private[_-]?key/i
  ];

  static WHITELIST = [
    '.env.example', 'README.md', 'LICENSE', 'package.json'
  ];

  static checkPath(filePath) {
    const fileName = basename(filePath);
    
    if (this.WHITELIST.some(w => w.toLowerCase() === fileName.toLowerCase())) {
      return { safe: true };
    }
    
    for (const pattern of this.SENSITIVE_PATTERNS) {
      if (pattern.test(fileName)) {
        return { safe: false, reason: `敏感文件: ${fileName}`, riskLevel: 'high' };
      }
    }
    
    return { safe: true };
  }
}

async function startServer() {
  try {
    const { Server } = await import("@modelcontextprotocol/sdk/server/index.js");
    const { StdioServerTransport } = await import("@modelcontextprotocol/sdk/server/stdio.js");
    const { CallToolRequestSchema, ListToolsRequestSchema } = await import("@modelcontextprotocol/sdk/types.js");

    const server = new Server(
      { name: "ai-explorer-secure-mcp", version: "1.0.0" },
      { capabilities: { tools: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [{
          name: "analyzePath",
          description: "🔒 安全地分析文件或目录路径",
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
          const pathCheck = SimpleSecurity.checkPath(args.path);
          if (!pathCheck.safe) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  path: args.path,
                  blocked: true,
                  reason: pathCheck.reason,
                  riskLevel: pathCheck.riskLevel,
                  message: "🔒 此文件被安全策略阻止分析"
                }, null, 2)
              }]
            };
          }

          const stats = await stat(args.path);
          return {
            content: [{
              type: "text", 
              text: JSON.stringify({
                path: args.path,
                exists: true,
                type: stats.isDirectory() ? "directory" : "file",
                size: stats.size,
                modified: stats.mtime.toISOString(),
                securityStatus: "✅ 安全检查通过"
              }, null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{ type: "text", text: JSON.stringify({ 
              path: args.path, exists: false, error: error.message 
            }, null, 2) }],
            isError: true
          };
        }
      }
      
      throw new Error(`未知工具: ${name}`);
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("�� 安全增强的 MCP Server 启动成功");

  } catch (error) {
    console.error("启动失败:", error);
    process.exit(1);
  }
}

startServer();
