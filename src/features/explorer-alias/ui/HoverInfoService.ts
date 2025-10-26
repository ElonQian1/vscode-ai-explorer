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
  private recentAnalyzes = new Map<string, number>(); // 记录最近分析的文件，避免频繁分析
  private readonly AI_ANALYSIS_COOLDOWN = 5 * 60 * 1000; // 5分钟冷却时间
  private _lastTooltipCache = new Map<string, string>(); // 最后一次tooltip结果缓存

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
      
      // 2. 🚫 仅在没有完整分析结果时才触发AI分析
      if (result.source !== 'llm' && this.shouldTriggerAIAnalysis(path)) {
        this.triggerAsyncUpdate(path);
      }
      
      // 3. 格式化输出
      return this.formatTooltip(result);
      
    } catch (error) {
      console.warn(`获取悬停信息失败 ${path}:`, error);
      return this.getFallbackTooltip(path);
    }
  }

  /**
   * 🎯 判断是否应该触发AI分析
   */
  private shouldTriggerAIAnalysis(path: string): boolean {
    // 1. 检查是否已经在分析中
    if (this.pendingUpdates.has(path)) {
      return false;
    }

    // 2. 检查冷却时间 - 避免对同一文件频繁分析
    const lastAnalyzed = this.recentAnalyzes.get(path);
    if (lastAnalyzed && (Date.now() - lastAnalyzed) < this.AI_ANALYSIS_COOLDOWN) {
      return false;
    }

    // 3. 检查是否已有AI分析缓存
    // 这里可以通过检查 AnalysisCache 来判断是否已有 LLM 分析结果
    // 但为了简化，我们依赖上面的冷却机制
    return true;
  }

  /**
   * 🕐 检查分析是否过期（文件变更后）
   */
  private isAnalysisStale(path: string): boolean {
    const lastAnalyzed = this.recentAnalyzes.get(path);
    return lastAnalyzed === 0; // 被标记为过期
  }

  /**
   * 🔄 异步触发完整分析（防重复）
   */
  private triggerAsyncUpdate(path: string): void {
    if (this.pendingUpdates.has(path)) {
      return; // 已经在分析中
    }

    // 记录分析时间
    this.recentAnalyzes.set(path, Date.now());

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

    // 🚨 检查是否过期
    if (this.isAnalysisStale(result.path)) {
      parts.push(`⚠️ 文件已修改，分析结果可能过期`);
      parts.push(`💡 提示: 右键选择"刷新AI分析"来更新`);
      parts.push('---');
    }

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
    this.cleanupExpiredAnalyzes();
  }

  /**
   * 🧹 清理过期的分析记录
   */
  private cleanupExpiredAnalyzes(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    for (const [path, timestamp] of this.recentAnalyzes.entries()) {
      if (now - timestamp > this.AI_ANALYSIS_COOLDOWN) {
        expiredKeys.push(path);
      }
    }
    
    expiredKeys.forEach(key => this.recentAnalyzes.delete(key));
  }

  /**
   * 🔄 强制刷新分析
   */
  async refresh(path: string): Promise<void> {
    try {
      await this.orchestrator.analyze(path, true); // forceRefresh = true
      // 清除过期标记
      this.recentAnalyzes.delete(path);
    } catch (error) {
      console.warn(`刷新分析失败 ${path}:`, error);
    }
  }

  /**
   * 📝 标记分析结果为过期状态（文件变更时调用）
   */
  async markAsStale(path: string): Promise<void> {
    // 将分析时间设置为很久以前，这样下次hover会显示"需要更新"
    this.recentAnalyzes.set(path, 0);
    
    // 可以考虑在缓存中添加"stale"标记，但这需要修改缓存结构
    // 暂时通过时间戳来处理
  }

  /**
   * 🔍 获取现有工具提示（仅查缓存，不触发新分析）
   */
  async getExistingTooltip(path: string): Promise<string | null> {
    try {
      // 🔥 优先检查 SmartFileAnalyzer 的AI分析结果
      if (this.smartCache) {
        const smartResult = await this.checkSmartAnalysisCache(path);
        if (smartResult) {
          const formatted = this.formatSmartTooltip(smartResult, path);
          return formatted;
        }
      }
      
      // 检查本地缓存（但不触发新的分析）
      const cachedResult = await (this.orchestrator as any).cache.get(path);
      if (cachedResult) {
        return this.formatTooltip(cachedResult);
      }
      
      return null; // 没有现有结果
      
    } catch (error) {
      return null;
    }
  }

  /**
   * 🔍 检查 SmartFileAnalyzer 的缓存
   */
  private async checkSmartAnalysisCache(path: string): Promise<SmartAnalysisResult | null> {
    if (!this.smartCache) return null;
    
    try {
      const moduleId = 'smart-analyzer'; // 和 SmartFileAnalyzer 使用相同的 moduleId
      const cacheKey = `file-analysis-${this.hashPath(path)}`; // 🔧 修复：使用和 SmartFileAnalyzer 相同的缓存键格式
      
      const result = await this.smartCache.get<SmartAnalysisResult>(cacheKey, moduleId);
      return result;
    } catch (error) {
      console.warn(`[HoverInfoService] ❌ 检查智能分析缓存失败 ${path}:`, error);
      return null;
    }
  }

  /**
   * 🚀 同步版本：获取现有tooltip（用于TreeItem，不支持异步）
   */
  getExistingTooltipSync(path: string): string | null {
    try {
      // 🔥 使用一个非阻塞的Promise检查，立即返回可用结果
      if (this.smartCache) {
        // 启动异步检查，但不等待结果
        this.checkSmartAnalysisCache(path).then(result => {
          if (result) {
            // 缓存结果供下次同步访问
            this._lastTooltipCache.set(path, this.formatSmartTooltip(result, path));
          }
        }).catch(() => {
          // 忽略错误，静默失败
        });
        
        // 返回上次缓存的结果（如果有的话）
        return this._lastTooltipCache.get(path) || null;
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * 🔧 路径哈希（和 SmartFileAnalyzer 保持一致）
   */
  private hashPath(filePath: string): string {
    let hash = 0;
    for (let i = 0; i < filePath.length; i++) {
      hash = ((hash << 5) - hash + filePath.charCodeAt(i)) & 0xffffffff;
    }
    return Math.abs(hash).toString(36); // 🔧 修复：添加 Math.abs() 与 SmartFileAnalyzer 保持一致
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