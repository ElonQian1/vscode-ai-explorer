/**
 * DragManager - 拖拽交互管理器（第六刀）
 * 
 * 职责：
 * 1. 管理卡片的拖拽交互
 * 2. 实时更新拖拽位置（通过 RuntimeStyle）
 * 3. 触发位置变更回调（持久化）
 * 4. 支持多卡片拖拽
 * 
 * 设计原则：
 * - 事件委托（减少监听器数量）
 * - CSP-safe（通过 RuntimeStyle 更新位置）
 * - 防抖优化（拖拽结束后再持久化）
 * - 性能优化（使用 transform 而非 top/left）
 */

/**
 * 创建拖拽管理器
 * @param {Object} options - 配置选项
 * @param {HTMLElement} options.container - 容器元素
 * @param {Object} options.runtimeStyle - RuntimeStyle 实例
 * @param {Function} options.onDragEnd - 拖拽结束回调 (element, {x, y})
 * @param {string} options.dragHandleSelector - 拖拽手柄选择器（默认 '.card-header'）
 * @returns {Object} DragManager 实例
 */
export function createDragManager({ 
  container, 
  runtimeStyle, 
  onDragEnd,
  dragHandleSelector = '.card-header'
}) {
  if (!container) {
    console.error('[DragManager] container 不能为空');
    return null;
  }
  if (!runtimeStyle) {
    console.error('[DragManager] runtimeStyle 实例必需');
    return null;
  }

  // 私有状态
  let dragState = null; // { element, startX, startY, offsetX, offsetY }
  let rafId = null; // requestAnimationFrame ID

  /**
   * 鼠标按下事件处理
   * @param {MouseEvent} event
   */
  function handleMouseDown(event) {
    // 查找拖拽手柄
    const handle = event.target.closest(dragHandleSelector);
    if (!handle) return;

    // 查找卡片元素
    const cardElement = handle.closest('.blueprint-card');
    if (!cardElement) return;

    // 防止文本选择
    event.preventDefault();

    // 获取当前位置
    const rect = cardElement.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    // 计算相对容器的位置
    const currentX = rect.left - containerRect.left;
    const currentY = rect.top - containerRect.top;

    // 初始化拖拽状态
    dragState = {
      element: cardElement,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: currentX,
      offsetY: currentY,
      path: cardElement.dataset.path
    };

    // 添加拖拽中样式
    cardElement.classList.add('dragging');

    console.log(`[DragManager] 开始拖拽: ${dragState.path} from (${currentX}, ${currentY})`);
  }

  /**
   * 鼠标移动事件处理（使用 RAF 优化）
   * @param {MouseEvent} event
   */
  function handleMouseMove(event) {
    if (!dragState) return;

    // 取消上一帧
    if (rafId) {
      cancelAnimationFrame(rafId);
    }

    // 请求新的动画帧
    rafId = requestAnimationFrame(() => {
      updateDragPosition(event.clientX, event.clientY);
    });
  }

  /**
   * 更新拖拽位置
   * @param {number} clientX - 鼠标 X 坐标
   * @param {number} clientY - 鼠标 Y 坐标
   */
  function updateDragPosition(clientX, clientY) {
    if (!dragState) return;

    // 计算新位置
    const deltaX = clientX - dragState.startX;
    const deltaY = clientY - dragState.startY;

    const newX = dragState.offsetX + deltaX;
    const newY = dragState.offsetY + deltaY;

    // 边界检查（可选：防止拖出容器）
    const boundedX = Math.max(0, newX);
    const boundedY = Math.max(0, newY);

    // 使用 RuntimeStyle 更新位置（CSP-safe）
    const posClassName = runtimeStyle.setPos(
      `card-${runtimeStyle.hash(dragState.path)}`,
      boundedX,
      boundedY
    );

    // 更新 class（移除旧位置类，添加新位置类）
    dragState.element.className = dragState.element.className.replace(/pos-\w+/g, '');
    dragState.element.classList.add(posClassName);
  }

  /**
   * 鼠标松开事件处理
   * @param {MouseEvent} event
   */
  function handleMouseUp(event) {
    if (!dragState) return;

    // 取消 RAF
    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    // 计算最终位置
    const deltaX = event.clientX - dragState.startX;
    const deltaY = event.clientY - dragState.startY;

    const finalX = Math.max(0, dragState.offsetX + deltaX);
    const finalY = Math.max(0, dragState.offsetY + deltaY);

    // 移除拖拽中样式
    dragState.element.classList.remove('dragging');

    console.log(`[DragManager] 拖拽结束: ${dragState.path} to (${finalX}, ${finalY})`);

    // 触发回调（持久化）
    if (onDragEnd) {
      onDragEnd(dragState.element, { x: finalX, y: finalY });
    }

    // 清理状态
    dragState = null;
  }

  /**
   * 启用拖拽功能
   */
  function enable() {
    container.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    console.log('[DragManager] 拖拽功能已启用');
  }

  /**
   * 禁用拖拽功能
   */
  function disable() {
    container.removeEventListener('mousedown', handleMouseDown);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);

    // 清理状态
    if (dragState) {
      dragState.element.classList.remove('dragging');
      dragState = null;
    }

    if (rafId) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }

    console.log('[DragManager] 拖拽功能已禁用');
  }

  /**
   * 检查是否正在拖拽
   * @returns {boolean}
   */
  function isDragging() {
    return dragState !== null;
  }

  /**
   * 获取当前拖拽的元素
   * @returns {HTMLElement|null}
   */
  function getDraggedElement() {
    return dragState ? dragState.element : null;
  }

  // 公开 API
  return {
    enable,
    disable,
    isDragging,
    getDraggedElement,

    // 内部状态（只读）
    get isActive() {
      return dragState !== null;
    }
  };
}
