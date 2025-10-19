# 蓝图卡片系统开发路线图

## 产品愿景
**语义缩放的文件蓝图**：双击文件时不再是模态抽屉，而是像虚幻引擎蓝图那样展开为可拖拽、可停靠、带Tab的大卡片。卡片之间自动腾挪空间，整体像思维导图连线展示依赖关系，AI分析与用户备注长期缓存。

## 里程碑计划

### M0: 蓝图卡片基础 (1-2天) 🎯
**目标**: 彻底替换模态框为可拖拽蓝图卡片

#### M0.1: Webview架构重构
- [x] 固定三个核心挂载点：`breadcrumb-layer` / `graph-root` / `card-layer`
- [x] 确保加载顺序：analysisCard → graphView → 其他组件
- [x] 移除所有内联脚本，满足CSP要求

#### M0.2: 蓝图卡片组件
- [ ] 创建 `blueprintCard.js` 模块 (UMD导出)
- [ ] 支持拖拽、吸附网格、固定(pin)功能
- [ ] 实现Tab结构：概览 / 依赖 / AI / 备注
- [ ] 卡片尺寸可调整并记忆位置

#### M0.3: 消息契约协议
- [ ] 定义标准消息格式：`show-analysis-card` / `update-analysis-card`
- [ ] 实现ACK确认机制：防止消息丢失
- [ ] 支持增量更新：AI结果流式合并，不覆盖用户备注

#### M0.4: 胶囊缓存系统
- [ ] 建立 `.ai-explorer-cache/filecapsules/` 存储目录
- [ ] 基于 `contentHash` 的失效控制
- [ ] 用户备注独立版本化，永不丢失

**验收标准**: 
✅ 双击文件 → 大卡片在画布上层  
✅ 卡片可拖拽，不遮挡底层交互  
✅ AI更新无闪烁，增量合并  
✅ 备注可编辑并持久化  

### M1: 联动布局 (2-3天)
**目标**: 卡片展开时推开其他节点，实现自动布局

#### 技术要点
- 引入 **elkjs** (Eclipse Layout Kernel)
- 节点尺寸动态变化：小节点 ⇄ 大卡片
- 展开触发全图重新布局 (reflow)
- 平滑动画过渡

**验收标准**: 
✅ 展开大卡片时，周围节点自动"让路"  
✅ 收起卡片时，节点回流补充空间  

### M2: 语义缩放与多卡 (3-4天)
**目标**: 视口缩放时智能切换渲染粒度，支持多卡并存

#### 功能特性
- L0: 目录层 / L1: 文件节点 / L2: 文件大卡片 / L3: 符号子图
- 远景显示图标+文件名，近景展示详细信息
- 多卡片管理："对齐网格" / "整理布局" / "只显示固定卡片"

### M3: 分析胶囊完善 (2-3天)
**目标**: 完整的缓存失效机制和数据结构

#### 数据模型
```typescript
type Capsule = {
  path: string;
  contentHash: string;        // 文件内容哈希
  static?: { summary, exports, deps };
  ai?: { inferences, suggestions, lastModel };
  notes?: { md, updatedAt, author };
  version: number;
}
```

### M4: 关系增强与视图 (3-4天)
**目标**: 依赖关系可视化和交互增强

#### 连线系统
- 正交/分层连线 (UE风格)
- 端口区分输入/输出
- 路径导览：沿线动画追踪
- 依赖过滤：按层级/作用域

### M5: 性能优化 (2-3天)
**目标**: 支持大型项目，流畅交互

#### 技术方案
- 节点>500时切换WebGL (PixiJS)
- 视图虚拟化 (仅渲染可见区域)
- 消息去抖批量处理
- 内存管理和渲染优化

### M6: MCP代理接入 (4-5天)
**目标**: AI助手集成，智能代码分析

#### AI功能
- "请AI解释该文件给新同学"
- "按依赖生成读代码顺序"
- "生成单测草案/用例矩阵"
- 分析结果直接写入备注或建议

### M7: 体验打磨 (2-3天)
**目标**: 完善的用户体验和工作流

#### 最终特性
- 卡片主题和快捷键 (O展开/P固定/Space聚焦)
- 导出PNG/PDF功能
- 工作区共享笔记
- 完整文档和示例

## Git提交策略

### 分支命名
- `feature/blueprint-card-system` - 主开发分支
- `feat/m0-webview-refactor` - M0具体功能分支
- `feat/m1-elkjs-layout` - M1具体功能分支

### 提交规范
```
feat(M0.1): 重构Webview三层挂载架构

- 固定breadcrumb-layer/graph-root/card-layer挂载点
- 移除内联脚本，满足CSP要求
- 确保analysisCard→graphView加载顺序

closes #issue-number
```

### 里程碑提交
每个M0.x完成后立即提交，便于需求方跟踪进度：
- `git add . && git commit -m "feat(M0.1): 完成Webview架构重构"`
- `git push origin feature/blueprint-card-system`

## 技术决策记录

### 渲染引擎选择
- **SVG**: <300节点，开发简单，CSS样式丰富
- **PixiJS**: >300节点，性能优秀，WebGL加速
- **决策**: M0-M2使用SVG快速迭代，M5切换PixiJS优化

### 状态管理
- **候选**: Zustand / Redux / 原生状态
- **决策**: 使用Zustand (轻量、TypeScript友好、学习成本低)

### 布局引擎
- **候选**: D3-force / Cytoscape / elkjs
- **决策**: elkjs (UE蓝图风格、支持正交连线、处理不同尺寸节点)

---

## 开发环境准备

### 依赖安装
```bash
npm install --save elkjs zustand
npm install --save-dev @types/elkjs
```

### 目录结构
```
media/filetree-blueprint/
├── modules/
│   ├── blueprintCard.js        # 蓝图卡片组件 (新增)
│   ├── layoutEngine.js         # elkjs布局引擎 (新增)
│   ├── capsuleService.js       # 胶囊缓存服务 (新增)
│   └── analysisCard.js         # 现有分析卡片 (重构)
├── contracts/
│   └── messageContracts.js     # 消息契约定义 (新增)
└── graphView.js                # 主视图控制器 (增强)
```

---

*最后更新: 2024-10-19*  
*当前里程碑: M0 - 蓝图卡片基础*