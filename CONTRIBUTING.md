# Contributing to AI Explorer

感谢你对 AI Explorer 项目的兴趣！我们欢迎各种形式的贡献。

## 🚀 快速开始

1. Fork 这个仓库
2. 克隆到本地：`git clone git@github.com:your-username/vscode-ai-explorer.git`
3. 安装依赖：`npm install`
4. 复制配置文件：
   ```bash
   cp .vscode/settings.example.json .vscode/settings.json
   cp .vscode/launch.example.json .vscode/launch.json
   cp .vscode/tasks.example.json .vscode/tasks.json
   ```
5. 配置 OpenAI API 密钥
6. 开始开发：`npm run dev`

## 📋 开发指南

### 项目结构

- `src/core/` - 核心服务（AI 客户端、缓存、日志）
- `src/features/` - 功能模块
  - `explorer-alias/` - AI 文件翻译模块
  - `uml-canvas/` - UML 图表生成模块
- `src/shared/` - 共享组件和类型

### 代码规范

- 使用 TypeScript 严格模式
- 遵循 ESLint 规则：`npm run lint`
- 每个文件添加模块标签注释
- 保持模块边界清晰（不允许跨模块导入）

### 提交规范

使用约定式提交格式：
- `feat: 新功能`
- `fix: 修复 bug`
- `docs: 文档更新`
- `style: 代码格式化`
- `refactor: 重构`
- `test: 测试相关`
- `chore: 构建工具、依赖更新`

示例：
```
feat(explorer-alias): 添加批量翻译进度显示

- 显示翻译进度条
- 支持取消翻译操作
- 优化错误处理
```

## 🐛 Bug 报告

提交 bug 时请包含：
- 操作系统和 VS Code 版本
- 插件版本
- 复现步骤
- 预期行为和实际行为
- 错误日志（输出面板中的 "AI Explorer - Core"）

## 💡 功能请求

提交功能请求时请说明：
- 功能描述
- 使用场景
- 是否愿意自己实现

## 🧪 测试

```bash
# 运行所有测试
npm test

# 运行特定模块测试
npm test -- --testPathPattern=explorer-alias

# 代码检查
npm run lint
```

## 📖 文档

- 更新 README.md 中的功能说明
- 为新功能添加使用示例
- 更新模块文档（各模块的 README.md）

## 🔄 Pull Request 流程

1. 创建功能分支：`git checkout -b feature/amazing-feature`
2. 进行开发并提交
3. 推送分支：`git push origin feature/amazing-feature`
4. 创建 Pull Request
5. 等待代码审查和合并

### PR 清单

- [ ] 代码通过 lint 检查
- [ ] 添加了必要的测试
- [ ] 更新了相关文档
- [ ] 提交信息清晰描述了变更
- [ ] 遵循了代码规范

## 🏗️ 架构约束

- **模块独立性**：功能模块间不能直接依赖
- **分层架构**：UI → Application → Domain ← Infrastructure
- **依赖注入**：通过 DI 容器管理服务
- **错误处理**：统一的错误处理和日志记录

## 📞 获取帮助

- 查看 [文档](./docs/MODULES.md)
- 提交 [Issue](https://github.com/ElonQian1/vscode-ai-explorer/issues)
- 参与 [讨论](https://github.com/ElonQian1/vscode-ai-explorer/discussions)

---

感谢你的贡献！🙏