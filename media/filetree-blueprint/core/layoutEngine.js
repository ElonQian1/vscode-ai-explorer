/**
 * LayoutEngine - 布局引擎服务（第五刀：迁移 + ES6 模块化）
 * 
 * 职责：
 * 1. 基于 elkjs 实现蓝图式自动布局
 * 2. 支持节点展开/收起的动态重排
 * 3. 管理节点尺寸策略（COMPACT/EXPANDED/FILE/FOLDER）
 * 4. 计算边的路由路径（正交连线）
 * 
 * 设计原则：
 * - 延迟初始化 ELK（首次使用时加载）
 * - 降级策略（ELK 加载失败时使用网格布局）
 * - 防重入锁（layoutInProgress）
 * - 丰富日志（便于调试）
 * 
 * 原始代码：media/filetree-blueprint/modules/layoutEngine.js
 * 迁移目标：core/layoutEngine.js（ES6 模块化）
 */

// ===== 布局配置 =====
const LAYOUT_CONFIG = {
  algorithm: 'layered',           // elkjs 分层算法，类似 UE 蓝图
  nodeSpacing: 50,                // 节点间距
  layerSpacing: 80,               // 层间距
  edgeRouting: 'ORTHOGONAL',      // 正交连线
  direction: 'RIGHT'              // 从左到右布局
};

// ===== 节点尺寸策略 =====
const NODE_SIZE = {
  COMPACT: { width: 160, height: 40 },        // 普通节点（小卡片）
  EXPANDED: { width: 520, height: 420 },      // 展开节点（大卡片）
  FILE: { width: 140, height: 35 },           // 文件节点
  FOLDER: { width: 180, height: 45 }          // 文件夹节点
};

/**
 * 布局引擎类
 */
class LayoutEngine {
  constructor() {
    this.graphData = { nodes: [], edges: [] };
    this.expandedNodes = new Set(); // 记录已展开的节点
    this.elkInstance = null;
    this.layoutInProgress = false;
    this.elkInitialized = false;
    
    // 回调钩子
    this.onLayoutComplete = null;
    this.onLayoutStart = null;
  }

  /**
   * 初始化 ELK 引擎（延迟加载）
   */
  async initELK() {
    try {
      console.log('[LayoutEngine] 🔄 等待本地 ELK.js 加载...');
      
      // 等待 ELK 加载（最多 3 秒）
      let attempts = 0;
      const maxAttempts = 30; // 30 * 100ms = 3 秒
      
      while (attempts < maxAttempts) {
        if (window.ELK && typeof window.ELK === 'function') {
          this.elkInstance = new window.ELK();
          console.log('[LayoutEngine] ✅ 本地 ELK.js 初始化成功');
          return;
        }
        
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      // 超时后使用兜底
      console.warn('[LayoutEngine] ⚠️ 本地 ELK.js 加载超时，使用网格兜底布局');
      this.elkInstance = this.createFallbackLayout();
      
    } catch (error) {
      console.warn('[LayoutEngine] ELK 初始化失败，使用网格兜底布局:', error);
      this.elkInstance = this.createFallbackLayout();
    }
  }

  /**
   * 降级布局实现（简单的网格布局）
   */
  createFallbackLayout() {
    return {
      layout: async (graph) => {
        console.log('[LayoutEngine] 🔄 使用降级网格布局算法');
        
        // 真实网格布局：一定返回坐标，保证节点能画出来
        const children = graph.children || [];
        const COLS = Math.ceil(Math.sqrt(children.length || 1));
        const GAPX = 80, GAPY = 60, W = 160, H = 40;
        
        children.forEach((c, i) => {
          const col = i % COLS;
          const row = Math.floor(i / COLS);
          c.x = col * (W + GAPX);
          c.y = row * (H + GAPY);
          // 确保尺寸信息存在
          c.width = c.width || W;
          c.height = c.height || H;
        });
        
        console.log(`[LayoutEngine] ✅ 网格布局完成: ${children.length} 个节点已分配坐标`);
        
        return {
          id: 'root',
          children: children,
          edges: graph.edges || []
        };
      }
    };
  }

  /**
   * 设置图数据
   * @param {Array} nodes - 节点数组
   * @param {Array} edges - 边数组
   */
  setGraph(nodes, edges) {
    this.graphData = { nodes: [...nodes], edges: [...edges] };
    console.log(`[LayoutEngine] 📊 设置图数据: ${nodes.length} 节点, ${edges.length} 边`);
  }

  /**
   * 标记节点为展开状态
   * @param {string} nodeId - 节点 ID
   * @param {boolean} expanded - 是否展开
   */
  markExpanded(nodeId, expanded = true) {
    if (expanded) {
      this.expandedNodes.add(nodeId);
      console.log(`[LayoutEngine] 📌 节点展开: ${nodeId}`);
    } else {
      this.expandedNodes.delete(nodeId);
      console.log(`[LayoutEngine] 📌 节点收起: ${nodeId}`);
    }
  }

  /**
   * 获取节点尺寸（根据展开状态和类型）
   * @param {Object} node - 节点对象
   * @returns {{width: number, height: number}}
   */
  getNodeSize(node) {
    if (this.expandedNodes.has(node.id)) {
      return NODE_SIZE.EXPANDED;
    }
    
    switch (node.type) {
      case 'file':
        return NODE_SIZE.FILE;
      case 'folder':
        return NODE_SIZE.FOLDER;
      default:
        return NODE_SIZE.COMPACT;
    }
  }

  /**
   * 执行布局重排
   * @param {string} reason - 触发原因
   * @param {Array} changedNodes - 变更的节点列表
   * @returns {Promise<Object|null>} 布局结果
   */
  async reflow(reason = 'manual', changedNodes = []) {
    if (this.layoutInProgress) {
      console.log('[LayoutEngine] ⏳ 布局进行中，跳过本次请求');
      return false;
    }

    // 延迟初始化：首次使用时才加载 ELK
    if (!this.elkInitialized) {
      await this.initELK();
      this.elkInitialized = true;
    }

    if (!this.elkInstance) {
      console.warn('[LayoutEngine] ⚠️ ELK 实例未就绪，可能是加载失败');
      return false;
    }

    this.layoutInProgress = true;
    console.log(`[LayoutEngine] 🔄 开始重新布局: ${reason}, 影响节点:`, changedNodes);

    try {
      this.onLayoutStart?.(reason, changedNodes);

      // 准备 ELK 图数据
      const elkGraph = this.prepareELKGraph();
      
      // 执行布局计算
      const layoutResult = await this.elkInstance.layout(elkGraph);
      
      // 应用布局结果
      const appliedLayout = this.applyLayout(layoutResult);
      
      console.log('[LayoutEngine] ✅ 布局完成');
      this.onLayoutComplete?.(appliedLayout, reason);
      
      return appliedLayout;
      
    } catch (error) {
      console.error('[LayoutEngine] ❌ 布局失败:', error);
      return null;
    } finally {
      this.layoutInProgress = false;
    }
  }

  /**
   * 准备 ELK 图数据结构
   * @returns {Object} ELK 图对象
   */
  prepareELKGraph() {
    const elkNodes = this.graphData.nodes.map(node => {
      const size = this.getNodeSize(node);
      return {
        id: node.id,
        width: size.width,
        height: size.height,
        layoutOptions: this.expandedNodes.has(node.id) ? {
          'elk.padding': '[top=10,left=10,bottom=10,right=10]'
        } : {}
      };
    });

    const elkEdges = this.graphData.edges.map(edge => ({
      id: edge.id || `${edge.from?.node || edge.from}-${edge.to?.node || edge.to}`,
      sources: [edge.from?.node || edge.from],
      targets: [edge.to?.node || edge.to]
    }));

    return {
      id: 'root',
      layoutOptions: {
        'elk.algorithm': LAYOUT_CONFIG.algorithm,
        'elk.spacing.nodeNode': LAYOUT_CONFIG.nodeSpacing.toString(),
        'elk.layered.spacing.nodeNodeBetweenLayers': LAYOUT_CONFIG.layerSpacing.toString(),
        'elk.edgeRouting': LAYOUT_CONFIG.edgeRouting,
        'elk.direction': LAYOUT_CONFIG.direction,
        'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
        'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF'
      },
      children: elkNodes,
      edges: elkEdges
    };
  }

  /**
   * 应用布局结果到图数据
   * @param {Object} layoutResult - ELK 布局结果
   * @returns {Object|null} 应用后的布局数据
   */
  applyLayout(layoutResult) {
    if (!layoutResult || !layoutResult.children) {
      console.warn('[LayoutEngine] ⚠️ 无效的布局结果');
      return null;
    }

    // 更新节点位置
    const positionUpdates = {};
    
    layoutResult.children.forEach(elkNode => {
      const originalNode = this.graphData.nodes.find(n => n.id === elkNode.id);
      if (originalNode && elkNode.x !== undefined && elkNode.y !== undefined) {
        positionUpdates[elkNode.id] = {
          x: elkNode.x,
          y: elkNode.y,
          width: elkNode.width,
          height: elkNode.height
        };
      }
    });

    console.log(`[LayoutEngine] 📍 更新 ${Object.keys(positionUpdates).length} 个节点位置`);
    
    return {
      nodes: positionUpdates,
      edges: this.calculateEdgeRoutes(layoutResult),
      bounds: this.calculateGraphBounds(layoutResult)
    };
  }

  /**
   * 计算边的路由路径
   * @param {Object} layoutResult - ELK 布局结果
   * @returns {Object} 边路由映射
   */
  calculateEdgeRoutes(layoutResult) {
    const edgeRoutes = {};
    
    if (layoutResult.edges) {
      layoutResult.edges.forEach(edge => {
        if (edge.sections && edge.sections.length > 0) {
          const section = edge.sections[0];
          edgeRoutes[edge.id] = {
            startPoint: { x: section.startX, y: section.startY },
            endPoint: { x: section.endX, y: section.endY },
            bendPoints: section.bendPoints || []
          };
        }
      });
    }
    
    return edgeRoutes;
  }

  /**
   * 计算图的总边界
   * @param {Object} layoutResult - ELK 布局结果
   * @returns {{x, y, width, height}} 边界坐标
   */
  calculateGraphBounds(layoutResult) {
    if (!layoutResult.children || layoutResult.children.length === 0) {
      return { x: 0, y: 0, width: 800, height: 600 };
    }

    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;

    layoutResult.children.forEach(node => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    });

    return {
      x: minX,
      y: minY,
      width: maxX - minX + 100,  // 添加边距
      height: maxY - minY + 100
    };
  }

  /**
   * 强制重新布局（忽略进行状态）
   * @param {string} reason - 触发原因
   * @returns {Promise<Object|null>}
   */
  async forceReflow(reason = 'force') {
    this.layoutInProgress = false;
    return await this.reflow(reason);
  }

  /**
   * 获取当前状态
   * @returns {Object} 状态对象
   */
  getState() {
    return {
      layoutInProgress: this.layoutInProgress,
      expandedNodes: Array.from(this.expandedNodes),
      nodeCount: this.graphData.nodes.length,
      edgeCount: this.graphData.edges.length
    };
  }
}

/**
 * 创建布局引擎实例
 * @returns {LayoutEngine}
 */
export function createLayoutEngine() {
  return new LayoutEngine();
}

// 导出配置常量
export { NODE_SIZE, LAYOUT_CONFIG };
