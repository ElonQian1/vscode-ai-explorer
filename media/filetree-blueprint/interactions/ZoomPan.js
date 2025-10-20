/**
 * ZoomPan - 缩放平移交互管理器（第七刀）
 * 
 * 职责：
 * 1. 管理图的缩放交互（鼠标滚轮）
 * 2. 管理图的平移交互（鼠标拖拽空白区域）
 * 3. 通过 transform 实现流畅的缩放/平移（60fps）
 * 4. 支持缩放中心点定位（鼠标位置）
 * 
 * 设计原则：
 * - CSP-safe（通过 RuntimeStyle 更新 transform）
 * - 性能优化（使用 transform 和 RAF）
 * - 边界限制（最小/最大缩放比例）
 * - 丝滑体验（缓动曲线）
 */

/**
 * 创建缩放平移管理器
 * @param {Object} options - 配置选项
 * @param {HTMLElement} options.container - 容器元素
 * @param {HTMLElement} options.viewport - 视口元素（被缩放/平移的元素）
 * @param {Object} options.runtimeStyle - RuntimeStyle 实例
 * @param {number} options.minZoom - 最小缩放比例（默认 0.1）
 * @param {number} options.maxZoom - 最大缩放比例（默认 3）
 * @param {number} options.zoomStep - 缩放步长（默认 0.1）
 * @param {Function} options.onZoomChange - 缩放变化回调 (scale)
 * @param {Function} options.onPanChange - 平移变化回调 ({x, y})
 * @returns {Object} ZoomPan 实例
 */
export function createZoomPan({
  container,
  viewport,
  runtimeStyle,
  minZoom = 0.1,
  maxZoom = 3,
  zoomStep = 0.1,
  onZoomChange,
  onPanChange
}) {
  if (!container || !viewport) {
    console.error('[ZoomPan] container 和 viewport 不能为空');
    return null;
  }
  if (!runtimeStyle) {
    console.error('[ZoomPan] runtimeStyle 实例必需');
    return null;
  }

  // 私有状态
  let scale = 1; // 当前缩放比例
  let panX = 0;  // 当前平移 X
  let panY = 0;  // 当前平移 Y
  let panState = null; // { startX, startY, initialPanX, initialPanY }
  let rafId = null;

  /**
   * 应用变换（缩放 + 平移）
   */
  function applyTransform() {
    // 使用 RuntimeStyle 设置 transform（CSP-safe）
    runtimeStyle.setProperties('#graph-viewport', {
      transform: `translate(${panX}px, ${panY}px) scale(${scale})`,
      'transform-origin': '0 0'
    });
  }

  /**
   * 鼠标滚轮事件处理（缩放）
   * @param {WheelEvent} event
   */
  function handleWheel(event) {
    event.preventDefault();

    // 计算缩放变化
    const delta = -Math.sign(event.deltaY) * zoomStep;
    const newScale = Math.max(minZoom, Math.min(maxZoom, scale + delta));

    if (newScale === scale) return; // 达到边界

    // 获取鼠标位置（相对于容器）
    const rect = container.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;

    // 计算缩放中心点（鼠标位置）
    // 公式：新平移 = 旧平移 + (鼠标位置 - 旧平移) * (1 - 新缩放/旧缩放)
    const scaleFactor = newScale / scale;
    const newPanX = mouseX - (mouseX - panX) * scaleFactor;
    const newPanY = mouseY - (mouseY - panY) * scaleFactor;

    // 更新状态
    scale = newScale;
    panX = newPanX;
    panY = newPanY;

    // 应用变换
    applyTransform();

    // 触发回调
    if (onZoomChange) {
      onZoomChange(scale);
    }

    console.log(`[ZoomPan] 缩放: ${scale.toFixed(2)}x at (${mouseX}, ${mouseY})`);
  }

  /**
   * 鼠标按下事件处理（开始平移）
   * @param {MouseEvent} event
   */
  function handleMouseDown(event) {
    // 只响应左键
    if (event.button !== 0) return;

    // 如果点击的是卡片，不触发平移
    if (event.target.closest('.blueprint-card')) return;

    event.preventDefault();

    // 初始化平移状态
    panState = {
      startX: event.clientX,
      startY: event.clientY,
      initialPanX: panX,
      initialPanY: panY
    };

    // 添加平移中样式
    container.classList.add('panning');

    console.log(`[ZoomPan] 开始平移 from (${panX}, ${panY})`);
  }

  /**
   * 鼠标移动事件处理（执行平移）
   * @param {MouseEvent} event
   */
  function handleMouseMove(event) {
    if (!panState) return;

    // 取消上一帧
    if (rafId) {
      cancelAnimationFrame(rafId);
    }

    // 请求新的动画帧
    rafId = requestAnimationFrame(() => {
      updatePanPosition(event.clientX, event.clientY);
    });
  }

  /**
   * 更新平移位置
   * @param {number} clientX - 鼠标 X 坐标
   * @param {number} clientY - 鼠标 Y 坐标
   */
  function updatePanPosition(clientX, clientY) {
    if (!panState) return;

    // 计算平移增量
    const deltaX = clientX - panState.startX;
    const deltaY = clientY - panState.startY;

    // 更新平移位置
    panX = panState.initialPanX + deltaX;
    panY = panState.initialPanY + deltaY;

    // 应用变换
    applyTransform();
  }

  /**
   * 鼠标松开事件处理（结束平移）
   * @param {MouseEvent} event
   */
  function handleMouseUp(event) {
    if (!panState) return;

    // 取消 RAF
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    // 移除平移中样式
    container.classList.remove('panning');

    console.log(`[ZoomPan] 平移结束 to (${panX}, ${panY})`);

    // 触发回调
    if (onPanChange) {
      onPanChange({ x: panX, y: panY });
    }

    // 清理状态
    panState = null;
  }

  /**
   * 启用缩放平移功能
   */
  function enable() {
    container.addEventListener('wheel', handleWheel, { passive: false });
    container.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    console.log('[ZoomPan] 缩放平移功能已启用');
  }

  /**
   * 禁用缩放平移功能
   */
  function disable() {
    container.removeEventListener('wheel', handleWheel);
    container.removeEventListener('mousedown', handleMouseDown);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);

    // 清理状态
    if (panState) {
      container.classList.remove('panning');
      panState = null;
    }

    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    console.log('[ZoomPan] 缩放平移功能已禁用');
  }

  /**
   * 重置缩放和平移
   */
  function reset() {
    scale = 1;
    panX = 0;
    panY = 0;

    applyTransform();

    console.log('[ZoomPan] 重置缩放和平移');
  }

  /**
   * 设置缩放比例
   * @param {number} newScale - 新缩放比例
   * @param {{x: number, y: number}} center - 缩放中心点（可选）
   */
  function setZoom(newScale, center) {
    const boundedScale = Math.max(minZoom, Math.min(maxZoom, newScale));

    if (center) {
      // 以指定中心点缩放
      const scaleFactor = boundedScale / scale;
      panX = center.x - (center.x - panX) * scaleFactor;
      panY = center.y - (center.y - panY) * scaleFactor;
    }

    scale = boundedScale;
    applyTransform();

    if (onZoomChange) {
      onZoomChange(scale);
    }

    console.log(`[ZoomPan] 设置缩放: ${scale.toFixed(2)}x`);
  }

  /**
   * 设置平移位置
   * @param {{x: number, y: number}} position - 新平移位置
   */
  function setPan(position) {
    panX = position.x;
    panY = position.y;

    applyTransform();

    if (onPanChange) {
      onPanChange({ x: panX, y: panY });
    }

    console.log(`[ZoomPan] 设置平移: (${panX}, ${panY})`);
  }

  /**
   * 缩放到适应内容
   * @param {{x, y, width, height}} bounds - 内容边界
   */
  function fitToContent(bounds) {
    if (!bounds || bounds.width === 0 || bounds.height === 0) return;

    const containerRect = container.getBoundingClientRect();
    const padding = 50; // 边距

    // 计算适应的缩放比例
    const scaleX = (containerRect.width - padding * 2) / bounds.width;
    const scaleY = (containerRect.height - padding * 2) / bounds.height;
    const fitScale = Math.min(scaleX, scaleY, maxZoom);

    // 居中显示
    const centerX = (containerRect.width - bounds.width * fitScale) / 2 - bounds.x * fitScale;
    const centerY = (containerRect.height - bounds.height * fitScale) / 2 - bounds.y * fitScale;

    scale = fitScale;
    panX = centerX;
    panY = centerY;

    applyTransform();

    console.log(`[ZoomPan] 缩放适应内容: ${scale.toFixed(2)}x`);
  }

  // 公开 API
  return {
    enable,
    disable,
    reset,
    setZoom,
    setPan,
    fitToContent,

    // Getters
    getScale: () => scale,
    getPan: () => ({ x: panX, y: panY }),

    // 内部状态（只读）
    get isPanning() {
      return panState !== null;
    }
  };
}
