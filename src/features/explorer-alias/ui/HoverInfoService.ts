// src/features/explorer-alias/ui/HoverInfoService.ts
import * as vscode from 'vscode';
import { AnalysisOrchestrator } from '../../../core/analysis/AnalysisOrchestrator';
import { AstAnalyzer } from '../../../core/analysis/analyzers/AstAnalyzer';
import { HeuristicAnalyzer } from '../../../core/analysis/analyzers/HeuristicAnalyzer';
import { LlmAnalyzer } from '../../../core/analysis/analyzers/LlmAnalyzer';
import { AnalysisCache } from '../../../core/analysis/cache/AnalysisCache';
import { createModelRouter } from '../../../core/analysis/model/ModelRouter';
import { KVCache } from '../../../core/cache/KVCache';
import { SmartAnalysisResult } from '../../../core/ai/SmartFileAnalyzer';
import { Logger } from '../../../core/logging/Logger';

/**
 * 🎯 悬停信息服务 - VS Code内置通道
 * 
 * 策略：
 * - 悬停时立即显示缓存结果
 * - 异步触发智能分析更新
 * - 优雅降级处理错误
 */
export class HoverInfoService {
  private static instance: HoverInfoService | null = null;
  private orchestrator: AnalysisOrchestrator;
  private smartCache?: KVCache;  // SmartFileAnalyzer 的缓存 (可选)
  private pendingUpdates = new Map<string, Promise<void>>();

  private constructor(workspaceRoot: string, context?: vscode.ExtensionContext) {
    // 初始化分析内核
    const cache = new AnalysisCache(workspaceRoot);
    const heuristic = new HeuristicAnalyzer();
    const ast = new AstAnalyzer();
    const modelRouter = createModelRouter();
    const llm = new LlmAnalyzer(modelRouter);
    
    this.orchestrator = new AnalysisOrchestrator(cache, heuristic, ast, llm);
    
    // 初始化智能分析缓存（如果有context的话）
    if (context) {
      const logger = new (require('../../../core/logging/Logger').Logger)(context, 'HoverInfoService');
      this.smartCache = new KVCache(context, logger);
    }
  }

  /**
   * 🏭 单例工厂方法
   */
  static getInstance(workspaceRoot?: string, context?: vscode.ExtensionContext): HoverInfoService {
    if (!HoverInfoService.instance) {
      if (!workspaceRoot) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
          throw new Error('需要工作区路径来初始化 HoverInfoService');
        }
        workspaceRoot = workspaceFolders[0].uri.fsPath;
      }
      HoverInfoService.instance = new HoverInfoService(workspaceRoot, context);
    }
    return HoverInfoService.instance;
  }

  /**
   * 🎯 获取悬停工具提示 - 主要入口
   */
  async getTooltip(path: string): Promise<string> {
    try {
      // 🔥 优先检查 SmartFileAnalyzer 的AI分析结果
      if (this.smartCache) {
        const smartResult = await this.checkSmartAnalysisCache(path);
        if (smartResult) {
          return this.formatSmartTooltip(smartResult, path);
        }
      }
      
      // 1. 立即尝试快速分析（缓存 + 启发式）
      const result = await this.orchestrator.quickAnalyze(path);
      
      // 2. 异步触发完整分析（不阻塞UI）
      this.triggerAsyncUpdate(path);
      
      // 3. 格式化输出
      return this.formatTooltip(result);
      
    } catch (error) {
      console.warn(`获取悬停信息失败 ${path}:`, error);
      return this.getFallbackTooltip(path);
    }
  }

  /**
   * 🔄 异步触发完整分析（防重复）
   */
  private triggerAsyncUpdate(path: string): void {
    if (this.pendingUpdates.has(path)) {
      return; // 已经在分析中
    }

    const updatePromise = this.performAsyncUpdate(path);
    this.pendingUpdates.set(path, updatePromise);
    
    // 清理完成的任务
    updatePromise.finally(() => {
      this.pendingUpdates.delete(path);
    });
  }

  /**
   * 🎯 执行异步完整分析
   */
  private async performAsyncUpdate(path: string): Promise<void> {
    try {
      await this.orchestrator.analyze(path);
      // 分析完成，可以触发UI更新事件（如果需要）
      // 这里可以发送事件通知树节点刷新tooltip
    } catch (error) {
      console.warn(`异步分析失败 ${path}:`, error);
    }
  }

  /**
   * 🎨 格式化工具提示文本
   */
  private formatTooltip(result: AnalysisResult): string {
    const parts: string[] = [];

    // 主要概要
    parts.push(`📝 ${result.summary}`);

    // 角色信息
    if (result.role?.length) {
      const roleEmoji = this.getRoleEmoji(result.role[0]);
      parts.push(`${roleEmoji} 类型: ${result.role.join(' • ')}`);
    }

    // 语言信息
    if (result.language) {
      parts.push(`💻 语言: ${result.language}`);
    }

    // 导出信息
    if (result.exports?.length) {
      const exports = result.exports.slice(0, 3).join(', ');
      const more = result.exports.length > 3 ? ` 等${result.exports.length}项` : '';
      parts.push(`📤 导出: ${exports}${more}`);
    }

    // 依赖信息
    if (result.deps?.length) {
      const deps = result.deps.slice(0, 2).join(', ');
      const more = result.deps.length > 2 ? ` 等${result.deps.length}项` : '';
      parts.push(`📦 依赖: ${deps}${more}`);
    }

    // 分析状态
    const statusEmoji = this.getSourceEmoji(result.source);
    parts.push(`${statusEmoji} ${this.getSourceDescription(result.source)}`);

    // 路径信息
    parts.push(`📁 ${result.path}`);

    return parts.join('\n');
  }

  /**
   * 🎭 获取角色对应的emoji
   */
  private getRoleEmoji(role: string): string {
    const emojiMap: Record<string, string> = {
      '入口': '🚀',
      '页面': '📄',
      '组件': '🧩',
      '服务': '⚙️',
      '工具函数': '🔧',
      '配置': '⚙️',
      '类型定义': '📝',
      '样式': '🎨',
      '测试': '🧪',
      '脚本': '📜'
    };
    return emojiMap[role] || '📄';
  }

  /**
   * 📊 获取分析来源emoji
   */
  private getSourceEmoji(source: string): string {
    switch (source) {
      case 'heuristic': return '⚡';
      case 'ast': return '🔍';
      case 'llm': return '🤖';
      default: return '❓';
    }
  }

  /**
   * 📝 获取分析来源描述
   */
  private getSourceDescription(source: string): string {
    switch (source) {
      case 'heuristic': return '快速推测';
      case 'ast': return '结构化分析';
      case 'llm': return 'AI智能分析';
      default: return '未知来源';
    }
  }

  /**
   * 🆘 回退工具提示（分析失败时）
   */
  private getFallbackTooltip(path: string): string {
    return `📁 ${path}\n⚠️ 正在分析中...`;
  }

  /**
   * 📊 获取服务状态
   */
  async getServiceStatus(): Promise<{
    pendingUpdates: number;
    cacheStats: { total: number; heuristic: number; ast: number; llm: number };
  }> {
    const cacheStats = await this.orchestrator.getStats();
    return {
      pendingUpdates: this.pendingUpdates.size,
      cacheStats
    };
  }

  /**
   * 🧹 清理缓存
   */
  async cleanup(): Promise<void> {
    await this.orchestrator.cleanupCache();
  }

  /**
   * 🔄 强制刷新分析
   */
  async refresh(path: string): Promise<void> {
    try {
      await this.orchestrator.analyze(path, true); // forceRefresh = true
    } catch (error) {
      console.warn(`刷新分析失败 ${path}:`, error);
    }
  }

  /**
   * 🔍 检查 SmartFileAnalyzer 的缓存
   */
  private async checkSmartAnalysisCache(path: string): Promise<SmartAnalysisResult | null> {
    if (!this.smartCache) return null;
    
    try {
      const moduleId = 'smartAnalyzer'; // 和 SmartFileAnalyzer 使用相同的 moduleId
      const cacheKey = `analysis:${path}`;
      return await this.smartCache.get<SmartAnalysisResult>(cacheKey, moduleId);
    } catch (error) {
      console.warn(`检查智能分析缓存失败 ${path}:`, error);
      return null;
    }
  }

  /**
   * 🎨 格式化智能分析工具提示
   */
  private formatSmartTooltip(result: SmartAnalysisResult, path: string): string {
    const parts: string[] = [];

    // 主要用途
    parts.push(`🎯 ${result.purpose}`);

    // 详细描述
    if (result.description) {
      parts.push(`📝 ${result.description}`);
    }

    // 技术标签
    if (result.tags?.length) {
      const tags = result.tags.slice(0, 3).join(' • ');
      const more = result.tags.length > 3 ? ` 等${result.tags.length}项` : '';
      parts.push(`🏷️ 标签: ${tags}${more}`);
    }

    // 重要性评分
    const stars = '⭐'.repeat(Math.min(result.importance, 5));
    parts.push(`${stars} 重要性: ${result.importance}/10`);

    // 分析状态
    const sourceEmoji = result.source === 'ai-analysis' ? '🤖' : 
                       result.source === 'rule-based' ? '⚡' : '💾';
    const sourceText = result.source === 'ai-analysis' ? 'AI智能分析' : 
                      result.source === 'rule-based' ? '规则分析' : '缓存';
    parts.push(`${sourceEmoji} ${sourceText}`);

    // 分析时间
    const analyzedDate = new Date(result.analyzedAt).toLocaleString('zh-CN');
    parts.push(`🕐 分析时间: ${analyzedDate}`);

    // 路径信息
    parts.push(`📁 ${path}`);

    return parts.join('\n');
  }
}

// 导出类型定义
export interface AnalysisResult {
  path: string;
  summary: string;
  role: string[];
  language?: string;
  exports?: string[];
  deps?: string[];
  related?: string[];
  version: string;
  timestamp: number;
  source: 'heuristic' | 'ast' | 'llm';
}