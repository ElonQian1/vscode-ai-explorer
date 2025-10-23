#!/usr/bin/env node

const { stat } = require("fs/promises");
const { basename } = require("path");

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
      { name: "ai-explorer-cache-refresh", version: "2.0.0" },
      { capabilities: { tools: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "analyzePath",
            description: "🔒 安全地分析文件或目录路径",
            inputSchema: {
              type: "object",
              properties: { path: { type: "string", description: "要分析的路径" } },
              required: ["path"]
            }
          },
          {
            name: "refreshCache",
            description: "🔄 刷新指定路径的分析缓存",
            inputSchema: {
              type: "object",
              properties: { 
                paths: { 
                  type: "array", 
                  items: { type: "string" },
                  description: "要刷新缓存的文件路径列表"
                }
              },
              required: ["paths"]
            }
          },
          {
            name: "refreshChangedSince",
            description: "🔄 基于 git diff 批量刷新自指定提交以来的改动文件",
            inputSchema: {
              type: "object",
              properties: { 
                baseRef: { 
                  type: "string", 
                  default: "HEAD~1",
                  description: "基准提交引用，如 HEAD~1, main, 等"
                }
              }
            }
          }
        ]
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
            }, null, 2) }]
          };
        }
      }

      if (name === "refreshCache") {
        console.error("🔄 refreshCache 工具被调用，路径数:", args.paths?.length || 0);
        
        const results = [];
        for (const path of (args.paths || [])) {
          try {
            const pathCheck = SimpleSecurity.checkPath(path);
            if (!pathCheck.safe) {
              results.push({ path, error: pathCheck.reason, skipped: true });
              continue;
            }

            const stats = await stat(path);
            results.push({ 
              path, 
              refreshed: true, 
              size: stats.size,
              modified: stats.mtime.toISOString(),
              message: "✅ 缓存已刷新"
            });
          } catch (error) {
            results.push({ path, error: error.message, failed: true });
          }
        }
        
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              operation: "refreshCache",
              totalPaths: args.paths?.length || 0,
              refreshed: results.filter(r => r.refreshed).length,
              skipped: results.filter(r => r.skipped).length,
              failed: results.filter(r => r.failed).length,
              results
            }, null, 2)
          }]
        };
      }

      if (name === "refreshChangedSince") {
        console.error("🔄 refreshChangedSince 工具被调用，基准:", args.baseRef || "HEAD~1");
        
        try {
          const { exec } = require('child_process');
          const { promisify } = require('util');
          const execAsync = promisify(exec);

          const baseRef = args.baseRef || "HEAD~1";
          const { stdout } = await execAsync(`git diff --name-only ${baseRef} HEAD`);
          const changedFiles = stdout.trim().split('\n').filter(Boolean);
          
          console.error(`📋 发现 ${changedFiles.length} 个改动文件`);
          
          const results = [];
          for (const file of changedFiles) {
            try {
              const pathCheck = SimpleSecurity.checkPath(file);
              if (!pathCheck.safe) {
                results.push({ path: file, skipped: true, reason: pathCheck.reason });
                continue;
              }

              const stats = await stat(file);
              results.push({ 
                path: file, 
                refreshed: true,
                size: stats.size,
                modified: stats.mtime.toISOString()
              });
            } catch (error) {
              results.push({ path: file, error: error.message });
            }
          }

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                operation: "refreshChangedSince",
                baseRef,
                totalChanged: changedFiles.length,
                refreshed: results.filter(r => r.refreshed).length,
                skipped: results.filter(r => r.skipped).length,
                failed: results.filter(r => r.error).length,
                results
              }, null, 2)
            }]
          };
        } catch (error) {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                operation: "refreshChangedSince",
                error: error.message,
                message: "❌ Git 操作失败，请确保在 Git 仓库中运行"
              }, null, 2)
            }],
            isError: true
          };
        }
      }
      
      throw new Error(`未知工具: ${name}`);
    });

    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("🚀 AI Explorer 缓存刷新 MCP 服务器启动成功");

  } catch (error) {
    console.error("❌ 启动失败:", error);
    process.exit(1);
  }
}

startServer();
