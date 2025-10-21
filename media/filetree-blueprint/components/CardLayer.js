/**
 * CardLayer - 卡片层管理组件（第三刀）
 * 
 * 职责：
 * 1. 卡片容器的打开、移动、关闭
 * 2. 集成 RuntimeStyle 实现 CSP-safe 的位置控制
 * 3. 管理卡片的 z-index 层级
 * 4. 持久化卡片位置到 savedPositions
 * 
 * 设计原则：
 * - 纯 class-based 样式控制（CSP 安全）
 * - 通过 RuntimeStyle 动态管理位置和层级
 * - 语义化 API（openCard/moveCard/closeCard）
 * - 防御式编程（null 检查、日志记录）
 */

import { hash } from '../core/runtimeStyle.js';

/**
 * 创建卡片层管理器
 * @param {Object} options - 配置选项
 * @param {HTMLElement} options.container - 卡片容器（通常是 #graph-container）
 * @param {Object} options.runtimeStyle - RuntimeStyle 实例
 * @param {Function} options.onCardMoved - 卡片移动回调 (path, {x, y})
 * @returns {Object} CardLayer 实例
 */
export function createCardLayer({ container, runtimeStyle, onCardMoved }) {
  if (!container) {
    console.error('[CardLayer] container 不能为空');
    return null;
  }
  if (!runtimeStyle) {
    console.error('[CardLayer] runtimeStyle 实例必需');
    return null;
  }

  // 私有状态
  const openCards = new Map(); // path -> { element, position }
  let highestZIndex = 1000; // 起始 z-index

  /**
   * 打开卡片
   * @param {string} path - 文件路径
   * @param {Object} options - 选项
   * @param {HTMLElement} options.content - 卡片内容元素
   * @param {{x: number, y: number}} options.position - 初始位置
   * @param {number} options.width - 卡片宽度
   * @param {number} options.height - 卡片高度
   * @returns {HTMLElement|null} 卡片元素
   */
  function openCard(path, { content, position = { x: 100, y: 100 }, width = 400, height = 600 }) {
    if (openCards.has(path)) {
      console.warn(`[CardLayer] 卡片已打开: ${path}`);
      // 聚焦已存在的卡片
      const existing = openCards.get(path);
      focusCard(existing.element);
      return existing.element;
    }

    // 创建卡片容器
    const cardElement = document.createElement('div');
    cardElement.className = 'blueprint-card';
    cardElement.dataset.path = path;
    
    // 设置基础样式（使用 class）
    cardElement.classList.add('card-opened');
    
    // 生成稳定的位置类名
    const posClassName = `card-pos-${hash(path)}`;
    const sizeClassName = `card-size-${hash(path)}`;
    
    // 使用 RuntimeStyle 设置尺寸（CSP-safe）
    runtimeStyle.setProperties(sizeClassName, { width: `${width}px`, height: `${height}px` });
    cardElement.classList.add(sizeClassName);

    // 添加内容
    if (content) {
      cardElement.appendChild(content);
    }

    // 添加到容器
    container.appendChild(cardElement);

    // 使用 RuntimeStyle 设置位置（CSP-safe）
    runtimeStyle.setPos(posClassName, position.x, position.y);
    cardElement.classList.add(posClassName);

    // 设置 z-index（提升到最前）
    highestZIndex += 1;
    runtimeStyle.setZIndex(`.blueprint-card[data-path="${path}"]`, highestZIndex);

    // 缓存状态
    openCards.set(path, {
      element: cardElement,
      position: { ...position },
      zIndex: highestZIndex
    });

    console.log(`[CardLayer] 打开卡片: ${path} at (${position.x}, ${position.y}) z=${highestZIndex}`);

    return cardElement;
  }

  /**
   * 移动卡片
   * @param {string} path - 文件路径
   * @param {{x: number, y: number}} newPosition - 新位置
   */
  function moveCard(path, newPosition) {
    const card = openCards.get(path);
    if (!card) {
      console.warn(`[CardLayer] 卡片未打开，无法移动: ${path}`);
      return;
    }

    // 生成稳定的位置类名（与 openCard 中保持一致）
    const posClassName = `card-pos-${hash(path)}`;
    
    // 更新位置（通过 RuntimeStyle）
    runtimeStyle.setPos(posClassName, newPosition.x, newPosition.y);

    // 更新缓存
    card.position = { ...newPosition };

    console.log(`[CardLayer] 移动卡片: ${path} to (${newPosition.x}, ${newPosition.y})`);

    // 触发回调（持久化）
    if (onCardMoved) {
      onCardMoved(path, newPosition);
    }
  }

  /**
   * 关闭卡片
   * @param {string} path - 文件路径
   */
  function closeCard(path) {
    const card = openCards.get(path);
    if (!card) {
      console.warn(`[CardLayer] 卡片未打开，无法关闭: ${path}`);
      return;
    }

    // 移除 DOM 元素
    if (card.element.parentNode) {
      card.element.parentNode.removeChild(card.element);
    }

    // 清理 RuntimeStyle 规则
    runtimeStyle.removeRule(`card-${runtimeStyle.hash(path)}`);

    // 移除缓存
    openCards.delete(path);

    console.log(`[CardLayer] 关闭卡片: ${path}`);
  }

  /**
   * 聚焦卡片（提升 z-index）
   * @param {HTMLElement} cardElement - 卡片元素
   */
  function focusCard(cardElement) {
    const path = cardElement.dataset.path;
    if (!path) return;

    const card = openCards.get(path);
    if (!card) return;

    // 提升 z-index
    highestZIndex += 1;
    runtimeStyle.setZIndex(`.blueprint-card[data-path="${path}"]`, highestZIndex);
    card.zIndex = highestZIndex;

    console.log(`[CardLayer] 聚焦卡片: ${path} z=${highestZIndex}`);
  }

  /**
   * 关闭所有卡片
   */
  function closeAllCards() {
    console.log(`[CardLayer] 关闭所有卡片 (count=${openCards.size})`);
    
    // 复制路径列表（避免迭代时修改）
    const paths = Array.from(openCards.keys());
    paths.forEach(path => closeCard(path));
  }

  /**
   * 获取已打开的卡片列表
   * @returns {Array<string>} 路径列表
   */
  function getOpenCards() {
    return Array.from(openCards.keys());
  }

  /**
   * 检查卡片是否已打开
   * @param {string} path - 文件路径
   * @returns {boolean}
   */
  function isCardOpen(path) {
    return openCards.has(path);
  }

  /**
   * 获取卡片位置
   * @param {string} path - 文件路径
   * @returns {{x: number, y: number}|null}
   */
  function getCardPosition(path) {
    const card = openCards.get(path);
    return card ? { ...card.position } : null;
  }

  /**
   * 恢复卡片位置（从 savedPositions）
   * @param {string} path - 文件路径
   * @param {{x: number, y: number}} position - 恢复的位置
   */
  function restoreCardPosition(path, position) {
    if (!isCardOpen(path)) {
      console.warn(`[CardLayer] 卡片未打开，无法恢复位置: ${path}`);
      return;
    }

    moveCard(path, position);
    console.log(`[CardLayer] 恢复卡片位置: ${path} to (${position.x}, ${position.y})`);
  }

  // 公开 API
  return {
    openCard,
    moveCard,
    closeCard,
    focusCard,
    closeAllCards,
    getOpenCards,
    isCardOpen,
    getCardPosition,
    restoreCardPosition,
    
    // 内部状态（只读）
    get cardCount() {
      return openCards.size;
    }
  };
}
