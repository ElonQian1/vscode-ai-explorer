/**
 * index.ts
 * 
 * AI守卫统计模块主入口
 * 统一导出所有公开API和组件
 */

export { AIGuardStatsPanel } from './panel/AIGuardStatsPanel';
export { AIGuardStatsCommands, registerAIGuardStatsCommands } from './commands';

// 类型定义
export type { AIGuardStats } from '../../shared/services/AIGuardStatsService';