/**
 * Renderer - 渲染层（第八刀）
 * 
 * 职责：
 * 1. 批量 DOM 操作（节点/边的创建和更新）
 * 2. 纯 class-based 样式控制（CSP-safe）
 * 3. 高性能渲染（DocumentFragment + RAF）
 * 4. 差量更新（只更新变化的节点）
 * 
 * 设计原则：
 * - 纯函数设计（输入数据 → 输出 DOM）
 * - CSP-safe（无 inline style，使用 class）
 * - 性能优化（批量操作、虚拟 DOM 思想）
 * - 语义化 API（renderNodes/renderEdges/updatePositions）
 */

/**
 * 转义 HTML 字符（防 XSS）
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * 创建渲染器
 * @param {Object} options - 配置选项
 * @param {HTMLElement} options.nodeContainer - 节点容器
 * @param {HTMLElement} options.edgeContainer - 边容器（SVG）
 * @param {Object} options.runtimeStyle - RuntimeStyle 实例
 * @returns {Object} Renderer 实例
 */
export function createRenderer({ nodeContainer, edgeContainer, runtimeStyle }) {
  if (!nodeContainer || !edgeContainer) {
    console.error('[Renderer] nodeContainer 和 edgeContainer 不能为空');
    return null;
  }
  if (!runtimeStyle) {
    console.error('[Renderer] runtimeStyle 实例必需');
    return null;
  }

  // 私有状态
  const nodeCache = new Map(); // nodeId -> element
  const edgeCache = new Map(); // edgeId -> element

  /**
   * 创建节点元素
   * @param {Object} node - 节点数据
   * @returns {HTMLElement}
   */
  function createNodeElement(node) {
    const nodeEl = document.createElement('div');
    nodeEl.className = 'graph-node';
    nodeEl.dataset.id = node.id;
    nodeEl.dataset.type = node.type || 'default';

    // 节点头部
    const header = document.createElement('div');
    header.className = 'node-header';
    header.textContent = node.label || node.id;
    nodeEl.appendChild(header);

    // 节点图标（根据类型）
    if (node.type === 'file') {
      nodeEl.classList.add('node-file');
    } else if (node.type === 'folder') {
      nodeEl.classList.add('node-folder');
    }

    // 选中状态
    if (node.selected) {
      nodeEl.classList.add('selected');
    }

    // 展开状态
    if (node.expanded) {
      nodeEl.classList.add('expanded');
    }

    return nodeEl;
  }

  /**
   * 更新节点元素
   * @param {HTMLElement} element - 节点元素
   * @param {Object} node - 新节点数据
   */
  function updateNodeElement(element, node) {
    // 更新标签
    const header = element.querySelector('.node-header');
    if (header) {
      header.textContent = node.label || node.id;
    }

    // 更新类型
    element.dataset.type = node.type || 'default';
    element.classList.toggle('node-file', node.type === 'file');
    element.classList.toggle('node-folder', node.type === 'folder');

    // 更新选中状态
    element.classList.toggle('selected', node.selected || false);

    // 更新展开状态
    element.classList.toggle('expanded', node.expanded || false);
  }

  /**
   * 创建边元素（SVG path）
   * @param {Object} edge - 边数据
   * @returns {SVGPathElement}
   */
  function createEdgeElement(edge) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'graph-edge');
    path.dataset.id = edge.id;
    path.dataset.from = edge.from;
    path.dataset.to = edge.to;

    // 边类型
    if (edge.type === 'dependency') {
      path.classList.add('edge-dependency');
    } else if (edge.type === 'reference') {
      path.classList.add('edge-reference');
    }

    return path;
  }

  /**
   * 更新边的路径
   * @param {SVGPathElement} element - 边元素
   * @param {Object} route - 路由数据 {startPoint, endPoint, bendPoints}
   */
  function updateEdgePath(element, route) {
    if (!route || !route.startPoint || !route.endPoint) {
      console.warn('[Renderer] 无效的边路由数据');
      return;
    }

    // 构建 SVG 路径（正交路由）
    let pathData = `M ${route.startPoint.x} ${route.startPoint.y}`;

    if (route.bendPoints && route.bendPoints.length > 0) {
      // 有弯折点
      route.bendPoints.forEach(point => {
        pathData += ` L ${point.x} ${point.y}`;
      });
    }

    pathData += ` L ${route.endPoint.x} ${route.endPoint.y}`;

    element.setAttribute('d', pathData);
  }

  /**
   * 渲染节点列表
   * @param {Array<Object>} nodes - 节点数据数组
   */
  function renderNodes(nodes) {
    console.log(`[Renderer] 渲染节点: ${nodes.length} 个`);

    const fragment = document.createDocumentFragment();
    const newNodeIds = new Set();

    nodes.forEach(node => {
      newNodeIds.add(node.id);

      let element = nodeCache.get(node.id);

      if (element) {
        // 更新已存在的节点
        updateNodeElement(element, node);
      } else {
        // 创建新节点
        element = createNodeElement(node);
        nodeCache.set(node.id, element);
        fragment.appendChild(element);
      }

      // 更新位置（通过 RuntimeStyle）
      if (node.x !== undefined && node.y !== undefined) {
        const posClassName = runtimeStyle.setPos(
          `node-${runtimeStyle.hash(node.id)}`,
          node.x,
          node.y
        );
        element.classList.add(posClassName);
      }
    });

    // 移除不再存在的节点
    nodeCache.forEach((element, nodeId) => {
      if (!newNodeIds.has(nodeId)) {
        element.remove();
        nodeCache.delete(nodeId);
        console.log(`[Renderer] 移除节点: ${nodeId}`);
      }
    });

    // 批量添加新节点
    if (fragment.childNodes.length > 0) {
      nodeContainer.appendChild(fragment);
    }

    console.log(`[Renderer] ✅ 节点渲染完成 (缓存: ${nodeCache.size})`);
  }

  /**
   * 渲染边列表
   * @param {Array<Object>} edges - 边数据数组
   * @param {Object} routes - 边路由映射 {edgeId: route}
   */
  function renderEdges(edges, routes = {}) {
    console.log(`[Renderer] 渲染边: ${edges.length} 条`);

    const fragment = document.createDocumentFragment();
    const newEdgeIds = new Set();

    edges.forEach(edge => {
      const edgeId = edge.id || `${edge.from}-${edge.to}`;
      newEdgeIds.add(edgeId);

      let element = edgeCache.get(edgeId);

      if (!element) {
        // 创建新边
        element = createEdgeElement({ ...edge, id: edgeId });
        edgeCache.set(edgeId, element);
        fragment.appendChild(element);
      }

      // 更新路径
      const route = routes[edgeId];
      if (route) {
        updateEdgePath(element, route);
      }
    });

    // 移除不再存在的边
    edgeCache.forEach((element, edgeId) => {
      if (!newEdgeIds.has(edgeId)) {
        element.remove();
        edgeCache.delete(edgeId);
        console.log(`[Renderer] 移除边: ${edgeId}`);
      }
    });

    // 批量添加新边
    if (fragment.childNodes.length > 0) {
      edgeContainer.appendChild(fragment);
    }

    console.log(`[Renderer] ✅ 边渲染完成 (缓存: ${edgeCache.size})`);
  }

  /**
   * 仅更新节点位置（差量更新）
   * @param {Object} positionUpdates - 位置更新映射 {nodeId: {x, y}}
   */
  function updateNodePositions(positionUpdates) {
    if (!positionUpdates || Object.keys(positionUpdates).length === 0) {
      return;
    }

    console.log(`[Renderer] 更新节点位置: ${Object.keys(positionUpdates).length} 个`);

    Object.entries(positionUpdates).forEach(([nodeId, position]) => {
      const element = nodeCache.get(nodeId);
      if (!element) return;

      // 使用 RuntimeStyle 更新位置
      const posClassName = runtimeStyle.setPos(
        `node-${runtimeStyle.hash(nodeId)}`,
        position.x,
        position.y
      );

      // 更新 class（移除旧位置类）
      element.className = element.className.replace(/pos-\w+/g, '');
      element.classList.add('graph-node', posClassName);
    });

    console.log('[Renderer] ✅ 位置更新完成');
  }

  /**
   * 更新 SVG 视口尺寸（根据图边界）
   * @param {{x, y, width, height}} bounds - 图边界
   */
  function updateSVGViewBox(bounds) {
    if (!bounds) return;

    const svg = edgeContainer.closest('svg');
    if (!svg) return;

    svg.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
    console.log(`[Renderer] 更新 SVG viewBox: ${bounds.width}x${bounds.height}`);
  }

  /**
   * 清空所有渲染内容
   */
  function clear() {
    nodeContainer.innerHTML = '';
    edgeContainer.innerHTML = '';
    nodeCache.clear();
    edgeCache.clear();

    console.log('[Renderer] 清空渲染内容');
  }

  /**
   * 高亮节点
   * @param {string} nodeId - 节点 ID
   */
  function highlightNode(nodeId) {
    const element = nodeCache.get(nodeId);
    if (!element) return;

    element.classList.add('highlighted');
    console.log(`[Renderer] 高亮节点: ${nodeId}`);
  }

  /**
   * 取消高亮所有节点
   */
  function clearHighlights() {
    nodeCache.forEach(element => {
      element.classList.remove('highlighted');
    });
    console.log('[Renderer] 清除所有高亮');
  }

  // 公开 API
  return {
    renderNodes,
    renderEdges,
    updateNodePositions,
    updateSVGViewBox,
    clear,
    highlightNode,
    clearHighlights,

    // Getters
    getNodeElement: (nodeId) => nodeCache.get(nodeId),
    getEdgeElement: (edgeId) => edgeCache.get(edgeId),

    // 内部状态（只读）
    get nodeCount() {
      return nodeCache.size;
    },
    get edgeCount() {
      return edgeCache.size;
    }
  };
}
