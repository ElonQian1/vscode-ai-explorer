# 蓝图卡片系统 - 协作开发指南

## 🎯 当前状态
**分支**: `feature/blueprint-card-system`  
**进度**: M0阶段核心组件已完成 (M0.1-M0.3 ✅)  
**下一步**: M0.4胶囊缓存系统 → M0验收 → M1布局联动  

## 📦 已完成的核心组件

### 1. 蓝图卡片组件 (`media/filetree-blueprint/modules/blueprintCard.js`)
- ✅ 虚幻引擎风格的可拖拽卡片
- ✅ Tab结构：概览/依赖/AI/备注
- ✅ 固定/取消固定、尺寸调整
- ✅ 位置状态持久化 (localStorage)
- ✅ 多卡片并存、网格吸附

### 2. 消息契约 (`media/filetree-blueprint/contracts/messageContracts.js`)
- ✅ 标准化扩展端 ⇄ Webview 通信协议
- ✅ 数据验证和类型安全
- ✅ ACK确认机制防止消息丢失
- ✅ 增量更新策略，保护用户备注

### 3. 图表视图集成 (`media/filetree-blueprint/graphView.js`)
- ✅ 双击文件预显示蓝图卡片
- ✅ 智能降级到旧卡片系统
- ✅ 标准消息处理和ACK响应

### 4. Webview架构 (`src/features/filetree-blueprint/panel/BlueprintPanel.ts`)
- ✅ 三层挂载点架构：breadcrumb/graph-root/card-layer
- ✅ 模块加载顺序优化，CSP合规
- ✅ 蓝图卡片系统初始化和回调设置

## 🚀 快速开始

### 环境准备
```bash
# 克隆仓库
git clone https://github.com/ElonQian1/vscode-ai-explorer.git
cd vscode-ai-explorer

# 切换到开发分支
git checkout feature/blueprint-card-system

# 安装依赖
npm install

# 启动编译监听
npm run watch
```

### 开发调试
1. 按 `F5` 启动调试会话
2. 在新VS Code窗口中打开一个项目文件夹
3. `Ctrl+Shift+P` → "Show File Tree Blueprint" 
4. 双击文件节点测试蓝图卡片功能

## 📋 待完成任务

### M0.4: 胶囊缓存系统 (正在进行)
```typescript
// 需要实现的缓存结构
.ai-explorer-cache/
└── filecapsules/
    ├── hash-of-path-1.json  // Capsule数据
    ├── hash-of-path-2.json
    └── ...

// Capsule数据格式
{
  path: string,
  contentHash: string,     // 文件内容哈希，用于失效控制
  static: { summary, exports, deps },
  ai: { inferences, suggestions, lastModel },
  notes: { md, updatedAt, author },  // 用户备注，永不覆盖
  version: 1
}
```

**具体任务**:
- [ ] 创建 `CapsuleService.js` 模块
- [ ] 实现基于 `contentHash` 的缓存失效
- [ ] 用户备注独立版本化存储
- [ ] 与扩展端的文件监听集成

### M0验收: 功能验证
- [ ] 双击文件 → 显示蓝图卡片（不是底部弹窗）
- [ ] 卡片可拖拽，不遮挡底层图表交互
- [ ] AI更新无闪烁，数据增量合并
- [ ] 备注Tab可编辑并持久化保存

### M1: 布局联动 (准备阶段)
- [ ] 研究 `elkjs` 集成方案
- [ ] 设计节点尺寸变化触发布局重排
- [ ] 卡片展开时"推开"其他节点

## 🛠️ 开发约定

### Git提交规范
```bash
# 功能提交
git commit -m "feat(M0.4): 实现胶囊缓存服务
- 基于contentHash的失效控制
- 用户备注独立存储"

# 修复提交  
git commit -m "fix(blueprintCard): 修复拖拽边界检测
- 防止卡片拖出视口
- 添加边界弹回动画"

# 文档提交
git commit -m "docs(collaboration): 更新协作开发指南
- 新增调试步骤
- 完善任务分工"
```

### 代码风格
- 使用 `console.log('[模块名] 操作描述:', 数据)` 格式的日志
- 函数名使用驼峰式：`showCard()`, `updateData()`, `validateCardData()`
- 常量使用大写：`ExtensionToWebviewTypes.SHOW_ANALYSIS_CARD`
- 注释使用中文，代码使用英文

### 分支策略
- `feature/blueprint-card-system` - 主开发分支
- `feat/m0.4-capsule-cache` - 具体功能分支（可选）
- 完成一个M0.x立即提交，便于协作跟踪

## 🔍 调试技巧

### 1. 蓝图卡片调试
```javascript
// 在浏览器开发者工具Console中
window.blueprintCard.showCard('/test/path', { loading: true });
window.blueprintCard.getAllCards(); // 查看所有卡片
```

### 2. 消息契约调试
```javascript
// 查看消息格式
console.log(window.messageContracts.createShowAnalysisCardMessage('/test', {}));

// 验证数据结构
window.messageContracts.validateCardData(testData);
```

### 3. 双击事件调试
- 按 `Ctrl+Shift+D` 开启双击事件探针
- 双击任何元素查看事件路径

## 🤝 如何贡献

### 选择任务
1. 查看上面的"待完成任务"列表
2. 在GitHub Issues中创建对应任务
3. 自分配并开始开发

### 提交流程
1. 基于最新的 `feature/blueprint-card-system` 创建功能分支
2. 完成开发并测试
3. 创建 Pull Request 到 `feature/blueprint-card-system`
4. 代码review通过后合并

### 问题反馈
- 功能问题：在GitHub Issues中描述现象和复现步骤
- 架构建议：在 `docs/BLUEPRINT_ROADMAP.md` 中讨论
- 紧急问题：直接联系项目维护者

## 📚 参考资料

- [完整开发路线图](./BLUEPRINT_ROADMAP.md) - M0到M7的详细计划
- [VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview) - Webview开发文档
- [虚幻引擎蓝图](https://docs.unrealengine.com/4.27/en-US/ProgrammingAndScripting/Blueprints/) - 设计灵感来源

---

**最后更新**: 2024-10-19  
**维护者**: GitHub Copilot & 开源协作者们  
**仓库**: https://github.com/ElonQian1/vscode-ai-explorer