# 🎯 蓝图卡片系统 - 虚幻引擎风格的文件分析界面

## 📋 Pull Request概述
将传统的模态抽屉替换为虚幻引擎风格的可拖拽蓝图卡片，实现"语义缩放的文件蓝图"体验。

**分支**: `feature/blueprint-card-system`  
**目标**: `master`  
**类型**: ✨ 新功能 (Major Feature)  

## 🎨 产品愿景
> **双击文件时不再是模态抽屉，而是像虚幻引擎蓝图那样展开为可拖拽、可停靠、带Tab的大卡片。卡片之间自动腾挪空间，整体像思维导图连线展示依赖关系，AI分析与用户备注长期缓存。**

## ✅ 已完成功能 (M0阶段)

### 🎯 M0.1: Webview架构重构
- ✅ 固定三层挂载点：`breadcrumb-layer` / `graph-root` / `card-layer`
- ✅ 模块加载顺序优化，满足CSP安全要求
- ✅ 蓝图卡片系统初始化和回调设置

### 🎯 M0.2: 蓝图卡片组件
- ✅ **blueprintCard.js**: 完整的卡片类系统
  - 可拖拽、可固定、可调整尺寸
  - Tab结构：概览/依赖/AI/备注
  - 网格吸附、多卡片并存
  - 位置状态持久化

### 🎯 M0.3: 消息契约协议
- ✅ **messageContracts.js**: 标准化通信协议
  - `show-analysis-card` / `update-analysis-card` + ACK确认
  - 数据验证和类型安全
  - 增量更新策略，保护用户备注
  - 防丢失重试机制

### 🎯 集成和交互
- ✅ **graphView.js**: 双击文件预显示蓝图卡片
- ✅ 智能降级：蓝图卡片不可用时回退到旧系统
- ✅ 标准消息处理和ACK响应

## 🎬 使用演示

### 当前体验
1. **双击文件节点** → 立即显示加载态蓝图卡片
2. **拖拽卡片** → 平滑移动，网格吸附（按住Shift）
3. **Tab切换** → 概览/依赖/AI/备注四个视图
4. **固定卡片** → 📌 固定后重新打开恢复位置
5. **编辑备注** → 📝 Markdown支持，自动保存

### 技术亮点
```javascript
// 🎯 智能卡片显示
window.blueprintCard.showCard('/src/utils.ts', cardData, {
  x: nodeX + 50,  // 相对节点位置
  y: nodeY + 30,
  activeTab: 'overview'
});

// 🔄 增量数据更新（保护用户备注）
window.blueprintCard.updateCard(path, {
  ai: { inferences: [...], suggestions: [...] }
  // notes 字段永远不会被覆盖
});

// 📨 标准消息契约
const message = messageContracts.createShowAnalysisCardMessage(path, data);
vscode.postMessage(message);
```

## 📦 新增文件

### 核心模块
- `media/filetree-blueprint/modules/blueprintCard.js` - 蓝图卡片组件 (UMD模块)
- `media/filetree-blueprint/contracts/messageContracts.js` - 消息契约定义

### 文档和指南  
- `docs/BLUEPRINT_ROADMAP.md` - 完整M0-M7开发路线图
- `docs/COLLABORATION_GUIDE.md` - 协作开发指南

### 修改文件
- `media/filetree-blueprint/graphView.js` - 集成蓝图卡片系统
- `src/features/filetree-blueprint/panel/BlueprintPanel.ts` - 模块加载顺序

## 🧪 测试建议

### 功能测试
1. **基础卡片**
   - [ ] 双击文件显示卡片（非底部弹窗）
   - [ ] 卡片可拖拽到任意位置
   - [ ] 固定/取消固定功能正常
   - [ ] Tab切换无闪烁

2. **数据处理**
   - [ ] AI分析结果正确显示在AI Tab
   - [ ] 依赖关系在依赖Tab中展示
   - [ ] 备注编辑后自动保存
   - [ ] 关闭重开卡片恢复位置

3. **多卡片交互**
   - [ ] 多个卡片可同时存在
   - [ ] 卡片不会重叠或遮挡
   - [ ] 最新打开的卡片自动置顶

### 兼容性测试
- [ ] 蓝图卡片系统不可用时降级正常
- [ ] 旧的分析卡片功能依然工作
- [ ] 消息ACK机制防止数据丢失

## 🚀 下一步计划

### M0.4: 胶囊缓存系统 (进行中)
- 建立 `.ai-explorer-cache/filecapsules/` 存储
- 基于 `contentHash` 的缓存失效控制
- 用户备注独立版本化，永不丢失

### M1: 布局联动 (准备中)
- 引入 **elkjs** 布局引擎
- 卡片展开时"推开"其他节点
- 实现真正的"蓝图式"空间布局

## 🔗 相关链接

- **开发文档**: [BLUEPRINT_ROADMAP.md](./docs/BLUEPRINT_ROADMAP.md)
- **协作指南**: [COLLABORATION_GUIDE.md](./docs/COLLABORATION_GUIDE.md)  
- **设计灵感**: [虚幻引擎蓝图系统](https://docs.unrealengine.com/4.27/en-US/ProgrammingAndScripting/Blueprints/)

---

## ⚡ 快速验收清单

**核心验证**:
- [ ] 双击文件 → 蓝图卡片 (不是底部弹窗)
- [ ] 卡片可拖拽，位置保存
- [ ] Tab切换流畅，内容正确
- [ ] 备注编辑并持久化

**技术验证**:
- [ ] Console无严重错误
- [ ] 消息ACK响应正常  
- [ ] 降级机制工作
- [ ] 多卡片并存无问题

**Ready for Review** ✅