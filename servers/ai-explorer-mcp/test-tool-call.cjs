const { spawn } = require("child_process");

async function testToolCall() {
  console.log("测试 MCP 工具调用功能...");
  
  const server = spawn("node", ["mcp-test.cjs"], {
    stdio: ["pipe", "pipe", "pipe"]
  });

  let responseCount = 0;

  server.stdout.on("data", (data) => {
    const response = data.toString().trim();
    console.log(`响应 ${++responseCount}:`, response);
  });

  server.stderr.on("data", (data) => {
    console.log("服务器日志:", data.toString());
  });

  // 1. 初始化
  server.stdin.write(JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1.0.0" } }
  }) + "\n");

  // 2. 获取工具列表
  setTimeout(() => {
    server.stdin.write(JSON.stringify({
      jsonrpc: "2.0", id: 2, method: "tools/list", params: {}
    }) + "\n");
  }, 100);

  // 3. 调用 analyzePath 工具
  setTimeout(() => {
    server.stdin.write(JSON.stringify({
      jsonrpc: "2.0", id: 3, method: "tools/call",
      params: { name: "analyzePath", arguments: { path: "d:\\rust\\active-projects\\ai-explorer\\package.json" } }
    }) + "\n");
  }, 200);

  // 清理
  setTimeout(() => {
    server.kill();
    console.log("\\n测试完成！");
  }, 2000);
}

testToolCall().catch(console.error);
