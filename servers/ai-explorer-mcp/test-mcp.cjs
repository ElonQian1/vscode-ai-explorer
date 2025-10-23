const { spawn } = require("child_process");

async function testMCP() {
  console.log("启动 MCP 服务器测试...");
  
  const server = spawn("node", ["mcp-test.cjs"], {
    stdio: ["pipe", "pipe", "pipe"]
  });

  // 监听输出
  server.stdout.on("data", (data) => {
    console.log("服务器输出:", data.toString());
  });

  server.stderr.on("data", (data) => {
    console.log("服务器错误:", data.toString());
  });

  // 发送初始化请求
  const initRequest = {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: { roots: { listChanged: true } },
      clientInfo: { name: "test-client", version: "1.0.0" }
    }
  };

  server.stdin.write(JSON.stringify(initRequest) + "\n");
  
  // 发送工具列表请求
  setTimeout(() => {
    const toolsRequest = {
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {}
    };
    server.stdin.write(JSON.stringify(toolsRequest) + "\n");
  }, 1000);

  // 清理
  setTimeout(() => {
    server.kill();
    console.log("测试完成");
  }, 3000);
}

testMCP().catch(console.error);
