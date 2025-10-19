# GitHub Actions CI/CD 配置说明

## 📋 概述

本项目使用 GitHub Actions 实现完整的 CI/CD 自动化流程，包括：
- ✅ 持续集成 (CI)
- 🚀 自动发布 (Release)
- 🔒 安全扫描 (Security)
- 🏷️ PR 自动化 (PR Management)
- 📦 依赖更新 (Dependabot)

## 🔧 工作流文件

### 1. ci.yml - 持续集成
**触发条件**: 推送到主分支、PR、手动触发
**功能**:
- 多平台构建矩阵 (Ubuntu, Windows, macOS)
- Node.js 版本测试 (18, 20)
- TypeScript 编译
- ESLint 代码检查
- 单元测试执行
- 依赖架构分析
- CSP 安全检查
- VSIX 打包

### 2. release.yml - 自动发布
**触发条件**: 推送标签 (v*.*.*)、手动触发
**功能**:
- 构建和测试验证
- VSIX 包生成
- GitHub Release 创建
- VS Code Marketplace 发布
- Open VSX Registry 发布
- 自动生成发布说明

### 3. security.yml - 安全扫描
**触发条件**: 每周定时、推送、PR
**功能**:
- npm audit 安全审计
- OSV Scanner 漏洞扫描
- CSP 策略验证
- ESLint 安全规则检查
- TypeScript 安全模式检查
- 许可证合规检查

### 4. pr-labeler.yml - PR 自动化
**触发条件**: PR 打开、更新、编辑
**功能**:
- 自动标签分配
- PR 大小标记
- 标题格式验证
- 合并冲突检查

## 🔑 必需的 Secrets

在 GitHub 仓库设置中配置以下 Secrets：

### VSCE_TOKEN
**用途**: 发布到 VS Code Marketplace
**获取方法**:
1. 访问 [Azure DevOps](https://dev.azure.com/)
2. 创建个人访问令牌 (PAT)
3. 权限选择: `Marketplace > Manage`

### OVSX_TOKEN  
**用途**: 发布到 Open VSX Registry
**获取方法**:
1. 访问 [Open VSX Registry](https://open-vsx.org/)
2. 注册账户并创建访问令牌
3. 权限: 发布扩展

## 📝 配置文件

### .github/labeler.yml
定义 PR 自动标签规则，基于文件路径自动分配标签：
- `area/*`: 功能区域标签
- `component/*`: 组件类型标签  
- `language/*`: 编程语言标签

### .github/dependabot.yml
Dependabot 自动依赖更新配置：
- NPM 包：每周一检查
- GitHub Actions：每周一检查
- 自动创建 PR 并分配审核者

## 🚀 使用指南

### 发布新版本

1. **创建发布标签**:
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. **自动化流程**:
   - CI 测试通过
   - 生成 VSIX 包
   - 创建 GitHub Release
   - 发布到 Marketplace
   - 发布到 Open VSX

### 开发工作流

1. **创建功能分支**:
   ```bash
   git checkout -b feature/new-feature
   ```

2. **提交代码**:
   ```bash
   git commit -m "feat(explorer): 添加新的文件分析功能"
   ```

3. **创建 PR**:
   - 自动运行 CI 检查
   - 自动分配标签
   - 验证标题格式
   - 检查代码质量

### 安全维护

- **每周自动扫描**: 依赖漏洞、许可证合规
- **PR 安全检查**: CSP 验证、代码安全检查
- **自动依赖更新**: Dependabot 创建更新 PR

## 🔍 监控和维护

### 查看构建状态
- Actions 页面查看工作流执行情况
- 失败时会收到邮件通知
- PR 中显示检查状态

### 常见问题排查

1. **发布失败**:
   - 检查 VSCE_TOKEN 和 OVSX_TOKEN 是否配置
   - 验证 package.json 版本号是否正确

2. **测试失败**:
   - 查看具体失败的测试用例
   - 本地运行 `npm test` 验证

3. **安全扫描警告**:
   - 查看 Security 页面详细报告
   - 及时更新有漏洞的依赖

## 📊 效果预期

- **自动化率**: 95% 的发布流程自动化
- **质量保障**: 多层次代码质量检查
- **安全性**: 全方位安全扫描和监控
- **效率提升**: 减少手动操作，提高开发效率

---

配置完成后，您的 AI Explorer 扩展将拥有企业级的 CI/CD 流程，确保代码质量、安全性和发布的可靠性。