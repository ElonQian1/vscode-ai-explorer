import { AstAnalyzer } from './analyzers/AstAnalyzer';
import { HeuristicAnalyzer } from './analyzers/HeuristicAnalyzer';
import { LlmAnalyzer } from './analyzers/LlmAnalyzer';
import { AnalysisCache } from './cache/AnalysisCache';
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
/**
 * 🎯 分析编排器 - 三段流水线的核心调度器
 *
 * 流水线：Heuristic（快速启发式）→ AST（结构化分析）→ LLM（智能总结）
 * 缓存策略：每层结果都缓存，支持渐进式增强
 */
export declare class AnalysisOrchestrator {
    private cache;
    private heuristic;
    private ast;
    private llm;
    private pendingAnalyses;
    constructor(cache: AnalysisCache, heuristic: HeuristicAnalyzer, ast: AstAnalyzer, llm: LlmAnalyzer);
    /**
     * 🔄 智能分析入口 - 支持去重合并
     */
    analyze(path: string, forceRefresh?: boolean): Promise<AnalysisResult>;
    /**
     * 🎯 快速分析 - 仅启发式，用于悬停即时显示
     */
    quickAnalyze(path: string): Promise<AnalysisResult>;
    /**
     * 🔍 执行三段流水线分析
     */
    private performAnalysis;
    /**
     * 🤔 决策是否需要 LLM 分析
     */
    private shouldUseLlm;
    /**
     * 🧹 清理过期缓存
     */
    cleanupCache(): Promise<void>;
    /**
     * 📊 获取分析统计
     */
    getStats(): Promise<{
        total: number;
        heuristic: number;
        ast: number;
        llm: number;
    }>;
}
