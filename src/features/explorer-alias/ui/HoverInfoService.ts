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
  /**
   * 📝 格式化智能分析结果为tooltip（面向非技术用户的丰富展示）
   */
  private formatSmartTooltip(result: SmartAnalysisResult, path: string): string {
    const parts: string[] = [];
    const fileName = path.split(/[/\\]/).pop() || 'unknown';

    // 🎯 白话解释 - 使用专门的用户友好说明
    const explanation = result.userFriendlyExplanation || result.purpose;
    parts.push(`**🎯 这个文件是做什么的？**\n${explanation}`);

    // � 核心功能清单 - "这个文件能干什么"
    const coreFunctions = this.buildCoreFunctionsSection(result, fileName);
    if (coreFunctions) {
      parts.push(coreFunctions);
    }

    // �📝 详细说明（技术实现细节）
    if (result.description && result.description !== explanation) {
      parts.push(`**📖 技术实现**\n${result.description}`);
    }

    // 🔥 增强的信息卡片
    const infoCard = this.buildEnhancedInfoCard(result, fileName);
    parts.push(infoCard);

    // 💡 给非技术用户的提示
    const userTips = this.buildUserFriendlyTips(result);
    if (userTips) {
      parts.push(userTips);
    }

    // 🔗 相关文件推荐
    if (result.relatedFiles?.length) {
      const related = result.relatedFiles.slice(0, 3).map(f => `• ${f.split(/[/\\]/).pop()}`).join('\n');
      parts.push(`**🔗 相关文件**\n${related}`);
    }

    // 📊 技术信息（放在最后，给AI代理使用）
    const techInfo = this.buildTechInfo(result, path);
    parts.push(`---\n${techInfo}`);

    return parts.join('\n\n');
  }

  /**
   * 🔥 构建增强的信息卡片
   */
  private buildEnhancedInfoCard(result: SmartAnalysisResult, fileName: string): string {
    const importance = '⭐'.repeat(Math.min(result.importance, 5));
    const isKey = result.isKeyFile ? '🔑 核心文件' : '📄 普通文件';
    const complexity = result.codeStats?.complexity || this.getComplexityFromTags(result.tags);
    const projectRole = result.projectRole || this.getProjectRole(result.tags, result.purpose);
    
    let cardContent = `**📊 文件信息卡片**\n` +
           `┌─ 📁 ${fileName}\n` +
           `├─ ${importance} 重要程度: ${result.importance}/10\n` +
           `├─ ${isKey}\n` +
           `├─ 🧩 复杂度: ${this.getComplexityEmoji(complexity)}\n` +
           `├─ 🎭 项目角色: ${projectRole}\n`;

    // 添加代码统计（如果有）
    if (result.codeStats) {
      cardContent += `├─ 📏 代码规模: ${result.codeStats.lines}行/${result.codeStats.functions}函数\n`;
    }

    cardContent += `└─ 🏷️ 技术栈: ${result.tags.slice(0, 2).join(' • ')}`;
    
    return cardContent;
  }

  /**
   * 🔥 构建信息卡片（兼容旧版本）
   */
  private buildInfoCard(result: SmartAnalysisResult, fileName: string): string {
    return this.buildEnhancedInfoCard(result, fileName);
  }

  /**
   * 💡 构建用户友好提示
   */
  private buildUserFriendlyTips(result: SmartAnalysisResult): string | null {
    const tips = [];
    
    // 重要性提示
    if (result.importance >= 8) {
      tips.push('🚨 **高风险修改** - 这是项目核心文件，改动可能影响整个系统');
    } else if (result.importance >= 6) {
      tips.push('⚠️ **谨慎修改** - 重要文件，建议先了解其作用和影响范围');
    } else if (result.importance <= 3) {
      tips.push('ℹ️ **相对安全** - 辅助文件，修改影响范围通常较小');
    }

    // 功能类型提示  
    if (result.tags.includes('config')) {
      tips.push('⚙️ **配置控制** - 修改会影响整个项目的行为和设置');
    }

    if (result.tags.includes('api') || result.tags.includes('client')) {
      tips.push('🔌 **外部接口** - 负责与其他系统或服务的通信');
    }

    if (result.tags.includes('core') || result.tags.includes('engine')) {
      tips.push('🎯 **核心引擎** - 包含项目的主要业务逻辑');
    }

    if (result.tags.includes('test')) {
      tips.push('🧪 **质量保障** - 测试文件，确保代码功能正确性');
    }

    // 业务影响提示
    if (result.isKeyFile) {
      tips.push('📢 **业务影响** - 修改可能影响用户体验或系统稳定性');
    }

    return tips.length ? `**💡 实用提示**\n${tips.map(tip => `• ${tip}`).join('\n')}` : null;
  }

  /**
   * 🧩 获取复杂度标签
   */
  private getComplexityLabel(tags: string[]): string {
    if (tags.includes('complex') || tags.includes('algorithm')) return '🔴 复杂';
    if (tags.includes('simple') || tags.includes('config')) return '🟢 简单';
    if (tags.includes('interface') || tags.includes('api')) return '🟡 中等';
    return '🟦 标准';
  }

  /**
   * 从标签获取复杂度
   */
  private getComplexityFromTags(tags: string[]): string {
    if (tags.includes('complex') || tags.includes('algorithm')) return 'high';
    if (tags.includes('simple') || tags.includes('config')) return 'low';
    if (tags.includes('interface') || tags.includes('api')) return 'medium';
    return 'medium';
  }

  /**
   * 获取复杂度表情符号
   */
  private getComplexityEmoji(complexity: string): string {
    const level = complexity?.toLowerCase();
    switch (level) {
      case 'high': return '🔴 高';
      case 'medium': return '🟡 中';
      case 'low': return '🟢 低';
      default: return '🟦 标准';
    }
  }

  /**
   * 🎭 获取项目中的角色
   */
  private getProjectRole(tags: string[], purpose: string): string {
    // 基于标签和用途判断项目角色
    if (tags.includes('config') || purpose.includes('配置')) return '⚙️ 配置管理';
    if (tags.includes('api') || tags.includes('client') || purpose.includes('客户端')) return '🔌 接口服务';
    if (tags.includes('core') || tags.includes('engine') || purpose.includes('核心')) return '🎯 核心逻辑';
    if (tags.includes('ui') || tags.includes('view') || purpose.includes('界面')) return '🎨 用户界面';
    if (tags.includes('util') || tags.includes('helper') || purpose.includes('工具')) return '🔧 辅助工具';
    if (tags.includes('test') || purpose.includes('测试')) return '🧪 质量保证';
    if (tags.includes('model') || tags.includes('data') || purpose.includes('数据')) return '📊 数据处理';
    if (tags.includes('service') || purpose.includes('服务')) return '⚡ 业务服务';
    return '📋 通用模块';
  }

  /**
   * 🤗 构建用户友好说明
   */
  private buildUserFriendlySection(result: SmartAnalysisResult): string {
    if (result.userFriendlyExplanation) {
      return `\n**🤗 通俗解释**\n${result.userFriendlyExplanation}`;
    }
    
    // 如果没有专门的用户友好说明，尝试从purpose生成
    if (result.purpose) {
      return `\n**🤗 通俗解释**\n${this.makeUserFriendly(result.purpose)}`;
    }
    
    return '';
  }

  /**
   * 将技术术语转换为通俗语言
   */
  private makeUserFriendly(text: string): string {
    return text
      .replace(/API/g, '应用程序接口')
      .replace(/client/g, '客户端')
      .replace(/service/g, '服务')
      .replace(/manager/g, '管理器')
      .replace(/controller/g, '控制器')
      .replace(/handler/g, '处理器')
      .replace(/provider/g, '提供器')
      .replace(/interface/g, '接口')
      .replace(/factory/g, '工厂')
      .replace(/utils?/g, '工具')
      .replace(/helper/g, '辅助工具');
  }

  /**
   * 📊 构建技术信息（给AI代理使用）
   */
  private buildTechInfo(result: SmartAnalysisResult, path: string): string {
    const sourceEmoji = result.source === 'ai-analysis' ? '🤖' : 
                       result.source === 'rule-based' ? '⚡' : '💾';
    const sourceText = result.source === 'ai-analysis' ? 'AI智能分析' : 
                      result.source === 'rule-based' ? '规则分析' : '缓存分析';
    
    const analyzedDate = new Date(result.analyzedAt).toLocaleString('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });

    // 构建结构化信息供AI代理使用
    const structuredInfo = [
      `${sourceEmoji} ${sourceText} | 🕐 ${analyzedDate}`,
      `📁 \`${path}\``,
      `🎯 重要性评分: ${result.importance}/10 ${result.isKeyFile ? '(关键文件)' : ''}`,
      `🏷️ 技术标签: ${result.tags.join(', ')}`,
    ];

    // 添加MCP服务相关信息
    if (result.relatedFiles?.length) {
      structuredInfo.push(`� 关联文件: ${result.relatedFiles.length}个`);
    }

    return `**🤖 AI代理信息**\n${structuredInfo.join('\n')}`;
  }

  /**
   * 💼 构建业务影响信息
   */
  private buildBusinessImpactSection(result: SmartAnalysisResult): string {
    if (result.businessImpact) {
      let impactSection = '\n**💼 业务影响**\n';
      
      // 风险等级
      const riskEmoji = {
        'low': '🟢',
        'medium': '🟡', 
        'high': '🟠',
        'critical': '🔴'
      };
      
      impactSection += `${riskEmoji[result.businessImpact.riskLevel] || '🔶'} 风险等级: ${result.businessImpact.riskLevel}\n`;
      
      // 影响区域
      if (result.businessImpact.affectedAreas && result.businessImpact.affectedAreas.length > 0) {
        impactSection += `🎯 影响区域: ${result.businessImpact.affectedAreas.slice(0, 3).join(', ')}\n`;
      }
      
      // 修改建议
      if (result.businessImpact.modificationGuidance) {
        impactSection += `💡 修改建议: ${result.businessImpact.modificationGuidance}`;
      }
      
      return impactSection;
    }
    return '';
  }

  /**
   * 🔌 构建MCP信息
   */
  private buildMCPInfoSection(result: SmartAnalysisResult): string {
    if (result.mcpInfo) {
      let mcpSection = '\n**🔌 MCP代理信息**\n';
      
      if (result.mcpInfo.apiSurface && result.mcpInfo.apiSurface.length > 0) {
        mcpSection += `📍 API接口: ${result.mcpInfo.apiSurface.slice(0, 3).join(', ')}\n`;
      }
      
      if (result.mcpInfo.keyInterfaces && result.mcpInfo.keyInterfaces.length > 0) {
        mcpSection += `� 关键接口: ${result.mcpInfo.keyInterfaces.slice(0, 2).join(', ')}\n`;
      }
      
      if (result.mcpInfo.designPatterns && result.mcpInfo.designPatterns.length > 0) {
        mcpSection += `🏗️ 设计模式: ${result.mcpInfo.designPatterns.join(', ')}\n`;
      }
      
      if (result.mcpInfo.qualityMetrics) {
        const metrics = Object.entries(result.mcpInfo.qualityMetrics).slice(0, 2);
        if (metrics.length > 0) {
          mcpSection += `📊 质量指标: ${metrics.map(([k, v]) => `${k}=${v}`).join(', ')}\n`;
        }
      }
      
      return mcpSection;
    }
    return '';
  }

  /**
   * 🔧 构建核心功能清单 - "这个文件能干什么"
   */
  private buildCoreFunctionsSection(result: SmartAnalysisResult, fileName: string): string {
    const functions = this.extractCoreFunctions(result, fileName);
    
    if (functions.length === 0) {
      return '';
    }
    
    const functionList = functions.map((func, index) => `${index + 1}. **${func}**`).join('\n');
    return `\n**🔧 核心功能清单**\n${functionList}`;
  }

  /**
   * 🎯 提取文件的核心功能
   */
  private extractCoreFunctions(result: SmartAnalysisResult, fileName: string): string[] {
    const functions: string[] = [];
    
    // 基于文件名和标签推断功能
    const lowerFileName = fileName.toLowerCase();
    const tags = result.tags.map(t => t.toLowerCase());
    const purpose = result.purpose.toLowerCase();
    
    // AI客户端相关功能  
    if (lowerFileName.includes('aiclient') || lowerFileName.includes('ai-client') || 
        lowerFileName.includes('openaiclient') || lowerFileName.includes('multiprovideraiclient') ||
        (lowerFileName.includes('openai') && lowerFileName.includes('client')) ||
        tags.some(t => t.includes('ai')) || purpose.includes('ai')) {
      functions.push('🤖 调用AI服务（ChatGPT、混元等）');
      functions.push('🔄 自动故障转移和备用服务商切换');
      functions.push('📝 批量文本翻译和内容生成');
      functions.push('⚡ 智能速率限制和请求管理');
      functions.push('🩺 AI服务健康检查和状态监控');
      functions.push('⚙️ 多提供商配置管理');
    }
    
    // 翻译相关功能
    else if (lowerFileName.includes('translate') || tags.some(t => t.includes('translate')) ||
             purpose.includes('翻译') || purpose.includes('translate')) {
      functions.push('🌐 英文到中文智能翻译');
      functions.push('📦 批量文本翻译处理');
      functions.push('🎯 专业术语精准转换');
      functions.push('🔧 翻译质量优化和校验');
    }
    
    // 分析器相关功能
    else if (lowerFileName.includes('analyzer') || tags.some(t => t.includes('analy')) ||
             purpose.includes('分析') || purpose.includes('analyzer')) {
      functions.push('🔍 智能代码文件分析');
      functions.push('📊 文件复杂度和重要性评估');
      functions.push('🏷️ 自动技术标签生成');
      functions.push('💡 用户友好的代码解释');
      functions.push('🔗 相关文件智能推荐');
    }
    
    // 缓存相关功能
    else if (lowerFileName.includes('cache') || tags.some(t => t.includes('cache')) ||
             purpose.includes('缓存') || purpose.includes('cache')) {
      functions.push('💾 高效数据缓存存储');
      functions.push('⚡ 快速数据检索和访问');
      functions.push('🧹 自动缓存过期和清理');
      functions.push('📊 缓存性能监控和统计');
    }
    
    // 服务相关功能
    else if (lowerFileName.includes('service') || tags.some(t => t.includes('service')) ||
             purpose.includes('服务') || purpose.includes('service')) {
      functions.push('⚙️ 核心业务服务提供');
      functions.push('🔄 服务状态管理');
      functions.push('📡 外部API集成');
      functions.push('🛡️ 错误处理和恢复');
    }
    
    // UI/界面相关功能
    else if (tags.some(t => t.includes('ui') || t.includes('view')) || 
             purpose.includes('界面') || purpose.includes('ui') || purpose.includes('view')) {
      functions.push('🎨 用户界面展示');
      functions.push('🖱️ 用户交互处理');
      functions.push('📱 界面状态管理');
      functions.push('🔄 数据绑定和更新');
    }
    
    // 配置相关功能
    else if (lowerFileName.includes('config') || tags.some(t => t.includes('config')) ||
             purpose.includes('配置') || purpose.includes('config')) {
      functions.push('⚙️ 系统配置管理');
      functions.push('🔧 参数设置和调整');
      functions.push('💾 配置数据持久化');
      functions.push('🔄 配置热重载');
    }
    
    // 工具类功能
    else if (lowerFileName.includes('util') || lowerFileName.includes('helper') ||
             tags.some(t => t.includes('util') || t.includes('helper')) ||
             purpose.includes('工具') || purpose.includes('辅助')) {
      functions.push('🔧 通用工具函数提供');
      functions.push('⚡ 高效算法实现');
      functions.push('🛡️ 数据验证和处理');
      functions.push('🔄 格式转换和标准化');
    }
    
    // 如果没有匹配到特定类型，基于通用模式生成
    if (functions.length === 0) {
      // 尝试从purpose中提取动词
      if (purpose.includes('管理')) {
        functions.push('⚙️ 数据和状态管理');
      }
      if (purpose.includes('处理')) {
        functions.push('🔄 数据处理和转换');
      }
      if (purpose.includes('提供')) {
        functions.push('📡 服务和功能提供');
      }
      if (purpose.includes('监控')) {
        functions.push('📊 系统监控和统计');
      }
      
      // 如果还是没有，使用通用描述
      if (functions.length === 0) {
        functions.push(`🔧 ${result.purpose}`);
      }
    }
    
    return functions.slice(0, 6); // 最多显示6个核心功能
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