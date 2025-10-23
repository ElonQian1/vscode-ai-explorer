const { spawn } = require("child_process");

async function testSecureMCP() {
  console.log("测试安全增强的 MCP 服务器...");
  
  const server = spawn("node", ["secure-mcp.cjs"], {
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

  // 3. 测试安全文件 - package.json（安全）
  setTimeout(() => {
    server.stdin.write(JSON.stringify({
      jsonrpc: "2.0", id: 3, method: "tools/call",
      params: { name: "analyzePath", arguments: { path: "d:\\rust\\active-projects\\ai-explorer\\package.json" } }
    }) + "\n");
  }, 200);

  // 4. 测试敏感文件 - .env 文件（应该被阻止）
  setTimeout(() => {
    server.stdin.write(JSON.stringify({
      jsonrpc: "2.0", id: 4, method: "tools/call",
      params: { name: "analyzePath", arguments: { path: "d:\\rust\\active-projects\\ai-explorer\\.env" } }
    }) + "\n");
  }, 300);

  // 5. 测试目录列表
  setTimeout(() => {
    server.stdin.write(JSON.stringify({
      jsonrpc: "2.0", id: 5, method: "tools/call",
      params: { name: "listDirectory", arguments: { path: "d:\\rust\\active-projects\\ai-explorer", includeHidden: false } }
    }) + "\n");
  }, 400);

  // 清理
  setTimeout(() => {
    server.kill();
    console.log("\\n安全测试完成！");
  }, 2000);
}

testSecureMCP().catch(console.error);
