const { spawn } = require("child_process");

function testFile(server, id, name, path) {
  console.log(`\n${name === "安全文件" ? "🟢" : "🔴"} 测试${name}: ${path}`);
  server.stdin.write(JSON.stringify({
    jsonrpc: "2.0", id: id, method: "tools/call",
    params: { name: "analyzePath", arguments: { path: path } }
  }) + "\n");
}

async function testFiles() {
  console.log("🔒 测试MCP安全过滤功能");
  
  const server = spawn("node", ["secure-mcp.cjs"], {
    stdio: ["pipe", "pipe", "pipe"]
  });

  server.stdout.on("data", (data) => {
    const responses = data.toString().trim().split("\n");
    responses.forEach(response => {
      if (response && response.includes("result")) {
        try {
          const parsed = JSON.parse(response);
          if (parsed.result && parsed.result.content) {
            const content = JSON.parse(parsed.result.content[0].text);
            if (content.blocked) {
              console.log("❌ 文件被阻止:", content.message);
              console.log("   原因:", content.reason);
            } else {
              console.log("✅ 文件通过安全检查");
            }
          }
        } catch {}
      }
    });
  });

  server.stderr.on("data", (data) => {
    console.log("服务器:", data.toString().trim());
  });

  // 初始化
  server.stdin.write(JSON.stringify({
    jsonrpc: "2.0", id: 1, method: "initialize",
    params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1.0.0" } }
  }) + "\n");

  // 测试不同类型的文件
  setTimeout(() => testFile(server, 2, "安全文件", "./package.json"), 200);
  setTimeout(() => testFile(server, 3, "环境变量文件", "./.env"), 400);
  setTimeout(() => testFile(server, 4, "秘密文件", "./my_secret.txt"), 600);
  setTimeout(() => testFile(server, 5, "白名单文件", "./README.md"), 800);

  setTimeout(() => {
    server.kill();
    console.log("\n✅ 测试完成");
  }, 1500);
}

testFiles();
