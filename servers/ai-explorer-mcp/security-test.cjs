const { spawn } = require("child_process");

async function testSecurity() {
  console.log("测试MCP安全过滤功能...");
  
  const server = spawn("node", ["secure-mcp.cjs"], {
    stdio: ["pipe", "pipe", "pipe"]
  });

  let responseCount = 0;

  server.stdout.on("data", (data) => {
    const responses = data.toString().trim().split("\n");
    responses.forEach(response => {
      if (response) {
        console.log(`\n=== 响应 ${++responseCount} ===`);
        try {
          const parsed = JSON.parse(response);
          if (parsed.result && parsed.result.content) {
            const content = JSON.parse(parsed.result.content[0].text);
            console.log("结果:", JSON.stringify(content, null, 2));
          } else {
            console.log("原始:", parsed);
          }
        } catch {
          console.log("原始:", response);
        }
      }
    });
  });

  server.stderr.on("data", (data) => {
    console.log("日志:", data.toString().trim());
  });

  // 初始化
  server.stdin.write(JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1.0.0" } }
  }) + "\n");

  // 测试安全文件
  setTimeout(() => {
    console.log("\n🟢 测试安全文件: package.json");
    server.stdin.write(JSON.stringify({
      jsonrpc: "2.0", id: 2, method: "tools/call",
      params: { name: "analyzePath", arguments: { path: "./package.json" } }
    }) + "\n");
  }, 100);

  // 测试敏感文件
  setTimeout(() => {
    console.log("\n🔴 测试敏感文件: test.env");
    server.stdin.write(JSON.stringify({
      jsonrpc: "2.0", id: 3, method: "tools/call",
      params: { name: "analyzePath", arguments: { path: "./test.env" } }
    }) + "\n");
  }, 300);

  // 清理
  setTimeout(() => {
    server.kill();
    console.log("\n✅ 安全测试完成！");
  }, 1500);
}

testSecurity();
