# AI Explorer - 智能资源管理器

[![VS Code](https://img.shields.io/badge/VS%20Code-Extension-blue?logo=visual-studio-code)](https://code.visualstudio.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.1-blue?logo=typescript)](https://www.typescriptlang.org/)
[![OpenAI](https://img.shields.io/badge/OpenAI-API-green?logo=openai)](https://openai.com/)
[![CI/CD](https://github.com/ElonQian1/vscode-ai-explorer/workflows/CI/CD%20Pipeline/badge.svg)](https://github.com/ElonQian1/vscode-ai-explorer/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Issues](https://img.shields.io/github/issues/ElonQian1/vscode-ai-explorer)](https://github.com/ElonQian1/vscode-ai-explorer/issues)
[![Stars](https://img.shields.io/github/stars/ElonQian1/vscode-ai-explorer)](https://github.com/ElonQian1/vscode-ai-explorer/stargazers)

> 🚀 AI 驱动的 VS Code 插件，提供智能文件翻译和 UML 图表生成功能

## ✨ 核心功能

### 🌟 AI 资源管理器
- **双栏镜像**：在侧边栏显示与原资源管理器相同的目录结构
- **智能翻译**：使用 AI 自动将英文文件名翻译为中文别名
- **缓存优化**：智能缓存翻译结果，避免重复 AI 调用
- **批量操作**：支持批量翻译和一键刷新

### 🎨 UML 图表生成器
- **代码解析**：支持 TypeScript、JavaScript、Python、Java 等多种语言
- **智能识别**：自动分析类、接口、方法和关系
- **世界画布**：支持无限缩放、拖拽的交互式画布
- **中文标注**：AI 自动将代码元素翻译为中文标签
- **多格式导出**：支持 PNG、SVG、PDF 格式导出

## 🏗️ 架构特色

- **🧅 洋葱架构**：清晰的分层设计，高内聚低耦合
- **🔌 模块化设计**：功能模块独立开发、独立测试
- **💉 依赖注入**：统一的服务管理和生命周期控制
- **🔄 事件驱动**：响应式的 UI 更新机制
- **📚 多根工作区**：模块隔离的开发环境

## 🚀 快速开始

### 1. 安装依赖

```bash
# 使用 npm
npm install

# 或使用 pnpm（推荐）
pnpm install
```

### 2. 配置开发环境

```bash
# 复制配置文件
cp .vscode/settings.example.json .vscode/settings.json
cp .vscode/launch.example.json .vscode/launch.json  
cp .vscode/tasks.example.json .vscode/tasks.json

# 打开多根工作区
code ai-explorer.code-workspace
```

### 3. 配置 AI 服务

在 VS Code 设置中配置 OpenAI API：

```json
{
  "aiExplorer.openaiApiKey": "your-api-key-here",
  "aiExplorer.openaiBaseUrl": "https://api.openai.com/v1",
  "aiExplorer.model": "gpt-3.5-turbo"
}
```

### 4. 开始开发

```bash
# 编译项目
npm run compile

# 启动监听模式
npm run dev

# 运行插件（F5）
# 选择 "🚀 运行整个插件" 启动配置
```

## 🎯 使用指南

### AI 资源管理器

1. 打开任意工作区文件夹
2. 在侧边栏找到 "AI 资源管理器" 视图
3. 点击 "翻译" 按钮开始批量翻译文件名
4. 使用 "切换别名显示" 在原名和别名间切换

### UML 图表生成

1. 右键点击代码文件（支持 .ts, .js, .py, .java 等）
2. 选择 "生成 UML 图表"
3. 等待 AI 分析代码结构
4. 在弹出的画布中查看和编辑 UML 图表
5. 使用工具栏切换布局或导出图表

## 📁 项目结构

```
ai-explorer/
├── 📁 src/
│   ├── 🚀 extension.ts              # 插件入口
│   ├── ⚙️ core/                     # 核心服务层
│   │   ├── ai/                      # AI 服务
│   │   ├── cache/                   # 缓存管理
│   │   ├── di/                      # 依赖注入
│   │   └── logging/                 # 日志服务
│   ├── 🎯 features/                 # 功能模块层
│   │   ├── explorer-alias/          # 文件别名模块
│   │   └── uml-canvas/              # UML 图表模块
│   └── 📚 shared/                   # 共享组件层
├── 📖 docs/                         # 文档
│   ├── MODULES.md                   # 模块索引
│   └── ARCHITECTURE.md              # 架构设计
├── 🔧 .vscode/                      # VS Code 配置
└── 📋 ai-explorer.code-workspace    # 多根工作区
```

## 🛠️ 开发指南

### 模块开发

每个功能模块都遵循统一的结构：

```
src/features/your-module/
├── YourModule.ts           # 模块入口
├── module.json             # 模块元数据
├── README.md               # 模块文档
├── ui/                     # UI 层
├── app/                    # 应用层
│   └── usecases/           # 用例
├── domain/                 # 领域层
│   ├── entities/           # 实体
│   └── ports/              # 接口
└── infra/                  # 基础设施层
```

### 添加新功能

1. **确定所属模块**：Explorer-Alias / UML-Canvas / 新模块
2. **创建用例类**：在 `app/usecases/` 目录
3. **实现 UI 界面**：在 `ui/` 或 `panel/` 目录
4. **注册服务**：在模块入口文件
5. **更新文档**：模块 README.md

### 调试技巧

```bash
# 按模块调试
F5 → "🌟 调试 Explorer-Alias 模块"
F5 → "🎨 调试 UML-Canvas 模块"

# 查看日志
Ctrl+Shift+P → "输出" → "AI Explorer - Core"

# 模块内搜索  
npm run grep:alias    # Explorer-Alias 相关
npm run grep:uml      # UML-Canvas 相关
```

## 🧪 测试

```bash
# 运行所有测试
npm test

# 运行特定模块测试
npm test -- --testPathPattern=explorer-alias
npm test -- --testPathPattern=uml-canvas

# 代码检查
npm run lint

# 自动修复
npm run lint:fix
```

## 📦 构建部署

```bash
# 编译生产版本
npm run compile

# 打包插件
npx vsce package

# 安装本地插件
code --install-extension ai-explorer-0.1.0.vsix
```

## 🤝 贡献指南

1. Fork 项目
2. 创建特性分支：`git checkout -b feature/amazing-feature`
3. 提交更改：`git commit -m 'Add amazing feature'`
4. 推送分支：`git push origin feature/amazing-feature`
5. 提交 Pull Request

### 代码规范

- 使用 TypeScript 严格模式
- 遵循 ESLint 规则
- 每个文件添加模块标签注释
- 保持模块边界清晰
- 编写单元测试

## 📄 许可证

MIT License - 查看 [LICENSE](LICENSE) 文件了解详情

## 🙏 致谢

- [VS Code Extension API](https://code.visualstudio.com/api)
- [OpenAI API](https://openai.com/api/)
- [D3.js](https://d3js.org/) - 数据可视化
- [vis.js](https://visjs.org/) - 网络图表

## 📞 支持

-  问题反馈：[GitHub Issues](https://github.com/ElonQian1/vscode-ai-explorer/issues)
- 💬 讨论：[GitHub Discussions](https://github.com/ElonQian1/vscode-ai-explorer/discussions)
- ⭐ 如果喜欢请给个 Star：[GitHub Repository](https://github.com/ElonQian1/vscode-ai-explorer)

---

<div align="center">

**🌟 如果这个项目对你有帮助，请给个 Star！**

[⬆ 回到顶部](#ai-explorer---智能资源管理器)

</div>