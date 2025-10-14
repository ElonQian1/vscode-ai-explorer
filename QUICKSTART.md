# 🚀 快速启动指南

## 当前状态
✅ 项目结构已创建  
✅ 依赖已安装  
✅ TypeScript 已编译  
✅ 配置文件已就绪  

## 🎯 下一步操作

### 1. 配置 OpenAI API（必需）

在 VS Code 中打开设置（`Ctrl+,`），搜索 `aiExplorer`，然后配置：

```json
{
  "aiExplorer.openaiApiKey": "你的-OpenAI-API-密钥",
  "aiExplorer.openaiBaseUrl": "https://api.openai.com/v1",
  "aiExplorer.model": "gpt-3.5-turbo"
}
```

> 💡 如果使用其他 API 提供商（如 Azure OpenAI），请相应修改 baseURL

### 2. 运行插件

**方法一：使用 F5 快捷键**
1. 在当前 VS Code 窗口按 `F5`
2. 选择 "🚀 运行整个插件"
3. 将打开新的扩展开发宿主窗口

**方法二：使用命令面板**
1. 按 `Ctrl+Shift+P` 打开命令面板
2. 输入 "Debug: Start Debugging"
3. 选择相应的启动配置

### 3. 测试功能

#### 测试 AI 资源管理器
1. 在新窗口中打开一个包含文件的工作区
2. 在侧边栏找到 "AI 资源管理器" 视图
3. 点击刷新按钮 🔄
4. 点击翻译按钮 🈁 开始翻译文件名

#### 测试 UML 图表生成
1. 打开一个代码文件（.ts, .js, .py 等）
2. 右键选择 "生成 UML 图表"
3. 或使用命令面板：`Ctrl+Shift+P` → "UML Canvas: Generate From File"
4. 查看生成的 UML 图表

### 4. 开发调试

#### 查看日志输出
1. 在开发宿主窗口中按 `Ctrl+Shift+P`
2. 选择 "输出"
3. 在输出面板选择 "AI Explorer - Core"

#### 模块独立调试
- **Explorer-Alias 模块**：使用 "🌟 调试 Explorer-Alias 模块" 启动配置
- **UML-Canvas 模块**：使用 "🎨 调试 UML-Canvas 模块" 启动配置

## 🛠️ 开发工作流

### 修改代码后重新加载
1. 在开发宿主窗口按 `Ctrl+R` 重新加载扩展
2. 或者按 `Ctrl+Shift+P` → "Developer: Reload Window"

### 编译代码
```bash
# 单次编译
npm run compile

# 监听模式（推荐）
npm run dev
```

### 代码检查
```bash
# 检查代码质量
npm run lint

# 自动修复问题
npm run lint:fix
```

## 🔧 常见问题

### 1. OpenAI API 调用失败
- 检查 API 密钥是否正确
- 确认网络连接正常
- 查看输出面板的错误日志

### 2. 插件无法启动
- 确保已编译：`npm run compile`
- 检查 TypeScript 错误：查看 VS Code 问题面板
- 重新安装依赖：`npm install`

### 3. 无法看到 AI 资源管理器视图
- 确保工作区包含文件夹
- 重新加载窗口：`Ctrl+R`
- 检查插件是否正确激活

## 📚 开发资源

- **模块文档**：`docs/MODULES.md` - 快速定位功能
- **架构设计**：`docs/ARCHITECTURE.md` - 了解整体设计
- **功能模块**：
  - Explorer-Alias: `src/features/explorer-alias/README.md`
  - UML-Canvas: `src/features/uml-canvas/README.md`

## 🎯 下一步开发建议

1. **完善 AI 翻译逻辑**：优化提示词模板，提高翻译质量
2. **增强 UML 解析**：支持更多编程语言和代码结构
3. **改进前端界面**：使用 D3.js 或 vis.js 创建更丰富的图表
4. **添加单元测试**：为核心功能编写测试用例
5. **性能优化**：实现更智能的缓存策略

---

🎉 **恭喜！你现在可以开始使用和开发 AI Explorer 插件了！**

有任何问题随时查看文档或询问。