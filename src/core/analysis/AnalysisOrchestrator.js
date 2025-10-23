/**
 * 🎯 分析编排器 - 三段流水线的核心调度器
 *
 * 流水线：Heuristic（快速启发式）→ AST（结构化分析）→ LLM（智能总结）
 * 缓存策略：每层结果都缓存，支持渐进式增强
 */
export class AnalysisOrchestrator {
    cache;
    heuristic;
    ast;
    llm;
    pendingAnalyses = new Map();
    constructor(cache, heuristic, ast, llm) {
        this.cache = cache;
        this.heuristic = heuristic;
        this.ast = ast;
        this.llm = llm;
    }
    /**
     * 🔄 智能分析入口 - 支持去重合并
     */
    async analyze(path, forceRefresh = false) {
        // 去重：同一路径的并发请求合并等待
        if (this.pendingAnalyses.has(path)) {
            return this.pendingAnalyses.get(path);
        }
        const promise = this.performAnalysis(path, forceRefresh);
        this.pendingAnalyses.set(path, promise);
        try {
            const result = await promise;
            return result;
        }
        finally {
            this.pendingAnalyses.delete(path);
        }
    }
    /**
     * 🎯 快速分析 - 仅启发式，用于悬停即时显示
     */
    async quickAnalyze(path) {
        // 先尝试缓存
        const cached = await this.cache.get(path);
        if (cached)
            return cached;
        // 仅启发式分析
        const heuristicResult = await this.heuristic.analyze(path);
        // 异步触发完整分析（不等待）
        this.analyze(path).catch(console.error);
        return heuristicResult;
    }
    /**
     * 🔍 执行三段流水线分析
     */
    async performAnalysis(path, forceRefresh) {
        if (!forceRefresh) {
            const cached = await this.cache.get(path);
            if (cached)
                return cached;
        }
        try {
            // Phase 1: 启发式分析（快速）
            const heuristicResult = await this.heuristic.analyze(path);
            await this.cache.set(heuristicResult);
            // Phase 2: AST 分析（中速，能走就走）
            let astResult;
            try {
                astResult = await this.ast.analyze(path, heuristicResult);
                await this.cache.set(astResult);
            }
            catch (error) {
                // AST 分析失败，使用启发式结果
                console.warn(`AST analysis failed for ${path}:`, error);
                astResult = heuristicResult;
            }
            // Phase 3: LLM 分析（慢速，必要时才触发）
            if (this.shouldUseLlm(path, astResult)) {
                try {
                    const llmResult = await this.llm.analyze(path, astResult);
                    await this.cache.set(llmResult);
                    return llmResult;
                }
                catch (error) {
                    console.warn(`LLM analysis failed for ${path}:`, error);
                }
            }
            return astResult;
        }
        catch (error) {
            console.error(`Analysis failed for ${path}:`, error);
            // 返回基本信息
            return {
                path,
                summary: `文件路径: ${path}`,
                role: [],
                version: 'error',
                timestamp: Date.now(),
                source: 'heuristic'
            };
        }
    }
    /**
     * 🤔 决策是否需要 LLM 分析
     */
    shouldUseLlm(path, astResult) {
        // 跳过大文件
        if (path.length > 10000)
            return false;
        // 跳过二进制文件
        const binaryExtensions = ['.jpg', '.png', '.gif', '.pdf', '.zip', '.exe'];
        if (binaryExtensions.some(ext => path.toLowerCase().endsWith(ext))) {
            return false;
        }
        // 如果 AST 分析已经很完整，可能不需要 LLM
        if (astResult.summary && astResult.exports?.length && astResult.deps?.length) {
            return false;
        }
        return true;
    }
    /**
     * 🧹 清理过期缓存
     */
    async cleanupCache() {
        await this.cache.cleanup();
    }
    /**
     * 📊 获取分析统计
     */
    async getStats() {
        return this.cache.getStats();
    }
}
