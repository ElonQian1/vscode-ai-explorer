// servers/ai-explorer-mcp/index.ts
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ToolSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { registerTools } from "./tools/index.js";

/**
 * 🤖 AI Explorer MCP 服务器
 *
 * 为 GitHub Copilot Coding Agent 提供项目分析工具
 * 支持文件/目录智能分析、缓存管理、相关文件查找等功能
 */

class AIExplorerMCPServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "ai-explorer",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
    console.error("AI Explorer MCP Server initialized");
  }

  private setupHandlers(): void {
    // 注册工具列表处理器
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: await this.getAvailableTools(),
      };
    });

    // 注册工具调用处理器
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        const result = await this.callTool(name, args || {});
        return {
          content: [
            {
              type: "text",
              text:
                typeof result === "string"
                  ? result
                  : JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(`Tool ${name} failed:`, errorMessage);

        return {
          content: [
            {
              type: "text",
              text: `Error: ${errorMessage}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  private async getAvailableTools(): Promise<ToolSchema[]> {
    return [
      {
        name: "analyze_path",
        description: "分析指定文件或文件夹的用途、结构和依赖关系",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "要分析的文件或文件夹的绝对路径",
            },
            force_refresh: {
              type: "boolean",
              description: "是否强制刷新分析结果，跳过缓存",
              default: false,
            },
          },
          required: ["path"],
        },
      },
      {
        name: "get_summary",
        description: "从缓存中快速获取文件或文件夹的分析摘要（不触发新分析）",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "要查询的文件或文件夹路径",
            },
          },
          required: ["path"],
        },
      },
      {
        name: "list_related",
        description: "查找与指定文件相关的其他文件（基于导入、依赖关系等）",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "基准文件路径",
            },
            max_results: {
              type: "number",
              description: "最大返回结果数",
              default: 10,
            },
          },
          required: ["path"],
        },
      },
      {
        name: "get_project_overview",
        description: "获取整个项目的结构概览和关键文件分析",
        inputSchema: {
          type: "object",
          properties: {
            root_path: {
              type: "string",
              description: "项目根目录路径",
            },
            max_depth: {
              type: "number",
              description: "扫描的最大目录深度",
              default: 3,
            },
          },
          required: ["root_path"],
        },
      },
      {
        name: "clear_cache",
        description: "清除指定路径或全部分析缓存",
        inputSchema: {
          type: "object",
          properties: {
            path: {
              type: "string",
              description: "要清除缓存的路径，留空则清除全部缓存",
            },
          },
        },
      },
    ];
  }

  private async callTool(name: string, args: any): Promise<any> {
    const tools = await registerTools();
    const toolFunction = tools[name];

    if (!toolFunction) {
      throw new Error(`Unknown tool: ${name}`);
    }

    return await toolFunction(args);
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("AI Explorer MCP Server connected via stdio");
  }
}

// 启动服务器
async function main() {
  const server = new AIExplorerMCPServer();
  await server.run();
}

// 处理未捕获的异常
process.on("uncaughtException", (error) => {
  console.error("Uncaught exception:", error);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled rejection at:", promise, "reason:", reason);
  process.exit(1);
});

// 只在直接运行时启动
if (require.main === module) {
  main().catch((error) => {
    console.error("Failed to start server:", error);
    process.exit(1);
  });
}
