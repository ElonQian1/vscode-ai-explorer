# Phase 6: 错误恢复 - 实施计划

**计划时间**: 2025-10-17  
**状态**: 📋 规划中

---

## 🎯 目标

提升系统的鲁棒性和用户体验：

1. **重试机制**: AI 请求失败时自动重试
2. **降级策略**: AI 失败时返回静态分析结果
3. **错误上报**: 收集错误日志，帮助调试
4. **超时控制**: 避免长时间等待

---

## 📐 架构设计

### 1. 重试机制

```
AI 请求
  ↓
尝试 1 → 失败（网络错误）
  ↓ 等待 1s
尝试 2 → 失败（超时）
  ↓ 等待 2s
尝试 3 → 成功 ✅

配置：
- 最大重试次数: 3
- 重试间隔: 指数退避（1s, 2s, 4s）
- 可重试错误: 网络错误、超时、429（限流）
- 不可重试错误: 401（认证失败）、400（请求错误）
```

### 2. 降级策略

```
用户双击文件
  ↓
静态分析（100ms）✅
  ↓ 立即显示静态结果
UI 显示：加载中... ⏳
  ↓
AI 分析（3-5s）
  ├─ 成功 → 更新 UI ✅
  └─ 失败 → 保留静态结果 ✅
      ↓
      显示提示："AI 分析失败，显示基础分析结果"
```

### 3. 错误分类

```typescript
enum ErrorSeverity {
    INFO = 'info',      // 信息（缓存未命中）
    WARN = 'warn',      // 警告（AI 失败，降级）
    ERROR = 'error',    // 错误（静态分析失败）
    FATAL = 'fatal'     // 致命（系统崩溃）
}

class AnalysisError extends Error {
    constructor(
        message: string,
        public severity: ErrorSeverity,
        public context: Record<string, any>
    ) {
        super(message);
    }
}
```

### 4. 超时控制

```
AI 请求
  ↓
Promise.race([
    aiClient.analyze(),          // AI 请求
    timeout(30000)               // 30s 超时
])
  ├─ AI 完成 → 返回结果 ✅
  └─ 超时 → 取消请求，降级 ⚠️
```

---

## 🔨 实现计划

### 任务 1: RetryHelper 增强

**文件**: `src/shared/utils/RetryHelper.ts` (已存在)

```typescript
export interface RetryConfig {
    maxAttempts: number;
    initialDelay: number;
    maxDelay: number;
    backoffMultiplier: number;
    retryableErrors: string[];  // ✨ 新增：可重试的错误类型
}

export class RetryHelper {
    /**
     * 判断错误是否可重试
     */
    static isRetryable(error: any, config: RetryConfig): boolean {
        // 网络错误
        if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
            return true;
        }

        // HTTP 状态码
        if (error.response?.status === 429) {  // 限流
            return true;
        }
        if (error.response?.status === 503) {  // 服务不可用
            return true;
        }

        // 认证失败不重试
        if (error.response?.status === 401) {
            return false;
        }

        return config.retryableErrors.includes(error.name);
    }

    /**
     * 带重试的执行（增强版）
     */
    static async executeWithRetry<T>(
        fn: () => Promise<T>,
        config: Partial<RetryConfig> = {},
        onRetry?: (attempt: number, error: any) => void
    ): Promise<T> {
        const fullConfig = { ...DEFAULT_CONFIG, ...config };
        let lastError: any;

        for (let attempt = 1; attempt <= fullConfig.maxAttempts; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;

                // 判断是否可重试
                if (!this.isRetryable(error, fullConfig)) {
                    throw error;  // 不可重试，直接抛出
                }

                // 最后一次尝试，不再重试
                if (attempt >= fullConfig.maxAttempts) {
                    break;
                }

                // 计算退避时间
                const delay = Math.min(
                    fullConfig.initialDelay * Math.pow(fullConfig.backoffMultiplier, attempt - 1),
                    fullConfig.maxDelay
                );

                onRetry?.(attempt, error);

                await this.sleep(delay);
            }
        }

        throw lastError;
    }
}
```

### 任务 2: AnalysisError 类

**文件**: `src/features/file-analysis/errors.ts` (新建)

```typescript
export enum ErrorSeverity {
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error',
    FATAL = 'fatal'
}

export enum ErrorCode {
    // 静态分析错误
    FILE_NOT_FOUND = 'FILE_NOT_FOUND',
    FILE_READ_ERROR = 'FILE_READ_ERROR',
    PARSE_ERROR = 'PARSE_ERROR',

    // AI 分析错误
    AI_CLIENT_INIT_FAILED = 'AI_CLIENT_INIT_FAILED',
    AI_REQUEST_FAILED = 'AI_REQUEST_FAILED',
    AI_TIMEOUT = 'AI_TIMEOUT',
    AI_RATE_LIMIT = 'AI_RATE_LIMIT',

    // 缓存错误
    CACHE_READ_ERROR = 'CACHE_READ_ERROR',
    CACHE_WRITE_ERROR = 'CACHE_WRITE_ERROR',
}

export class AnalysisError extends Error {
    constructor(
        message: string,
        public code: ErrorCode,
        public severity: ErrorSeverity,
        public context: Record<string, any> = {}
    ) {
        super(message);
        this.name = 'AnalysisError';
    }

    /**
     * 是否可重试
     */
    isRetryable(): boolean {
        return [
            ErrorCode.AI_REQUEST_FAILED,
            ErrorCode.AI_TIMEOUT,
            ErrorCode.AI_RATE_LIMIT
        ].includes(this.code);
    }

    /**
     * 是否需要降级
     */
    needsDegradation(): boolean {
        return this.severity === ErrorSeverity.WARN;
    }

    /**
     * 格式化为日志消息
     */
    toLogMessage(): string {
        return `[${this.severity.toUpperCase()}] ${this.code}: ${this.message}`;
    }
}
```

### 任务 3: 增强 FileAnalysisService

```typescript
export class FileAnalysisService {
    /**
     * AI 增强分析（带重试和降级）
     */
    public async enhanceWithAI(
        staticCapsule: FileCapsule,
        options: AnalysisOptions = {}
    ): Promise<FileCapsule> {
        const relativePath = staticCapsule.file;
        this.logger.info(`[FileAnalysisService] AI增强分析: ${relativePath}`);

        try {
            // 检查是否启用AI
            const config = vscode.workspace.getConfiguration('aiExplorer');
            const enableAI = options.includeAI !== false && 
                             config.get<boolean>('fileAnalysis.enableAI', true);

            if (!enableAI) {
                this.logger.info('[FileAnalysisService] AI分析未启用,返回静态结果');
                return staticCapsule;
            }

            // 初始化AI客户端
            await this.ensureAIClient();

            if (!this.llmAnalyzer) {
                this.logger.warn('[FileAnalysisService] AI客户端未初始化,返回静态结果');
                return staticCapsule;
            }

            // 转换路径并读取文件内容
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                throw new AnalysisError(
                    '无法获取工作区根目录',
                    ErrorCode.FILE_READ_ERROR,
                    ErrorSeverity.ERROR,
                    { file: relativePath }
                );
            }

            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            const normalizedRelative = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
            const absolutePath = vscode.Uri.joinPath(workspaceFolders[0].uri, normalizedRelative).fsPath;

            this.logger.info(`[FileAnalysisService] 路径转换: ${relativePath} → ${absolutePath}`);

            // 读取文件内容
            const uri = vscode.Uri.file(absolutePath);
            const content = await vscode.workspace.fs.readFile(uri);
            const text = Buffer.from(content).toString('utf8');

            // 准备AI分析输入
            const aiInput = {
                filePath: relativePath,
                lang: staticCapsule.lang,
                content: text,
                staticAnalysis: {
                    apiCount: staticCapsule.api.length,
                    apiSummary: staticCapsule.api.map(a => `${a.kind} ${a.name}`).join(', ') || '无',
                    depsCount: staticCapsule.deps.out.length,
                    depsSummary: staticCapsule.deps.out.map(d => d.module).join(', ') || '无'
                }
            };

            // 🔥 带重试和超时的 AI 分析
            const aiResult = await RetryHelper.executeWithRetry(
                async () => {
                    // 超时控制（30s）
                    return await Promise.race([
                        this.llmAnalyzer!.analyzeFile(aiInput),
                        this.createTimeout(30000, relativePath)
                    ]);
                },
                {
                    maxAttempts: 3,
                    initialDelay: 1000,
                    backoffMultiplier: 2,
                    retryableErrors: ['NetworkError', 'TimeoutError']
                },
                (attempt, error) => {
                    this.logger.warn(
                        `[FileAnalysisService] AI分析失败，重试 ${attempt}/3`,
                        error
                    );
                }
            );

            // 合并AI结果到静态结果
            const enhancedCapsule: FileCapsule = {
                ...staticCapsule,
                summary: aiResult.summary,
                inferences: aiResult.inferences,
                recommendations: aiResult.recommendations,
                lastVerifiedAt: new Date().toISOString()
            };

            // 更新缓存
            await this.cache.set(staticCapsule.contentHash, enhancedCapsule);

            this.logger.info('[FileAnalysisService] AI增强完成并更新缓存');
            return enhancedCapsule;

        } catch (error) {
            // 🔥 错误处理和降级
            if (error instanceof AnalysisError) {
                this.logger.log(
                    error.severity,
                    error.toLogMessage(),
                    error.context
                );
            } else {
                this.logger.warn(
                    '[FileAnalysisService] AI增强失败,返回静态结果',
                    error
                );
            }

            // 降级：返回原始静态结果
            return staticCapsule;
        }
    }

    /**
     * 创建超时 Promise
     */
    private createTimeout(ms: number, file: string): Promise<never> {
        return new Promise((_, reject) => {
            setTimeout(() => {
                reject(new AnalysisError(
                    `AI 分析超时 (${ms}ms)`,
                    ErrorCode.AI_TIMEOUT,
                    ErrorSeverity.WARN,
                    { file, timeout: ms }
                ));
            }, ms);
        });
    }
}
```

### 任务 4: 用户反馈

**在 BlueprintPanel 中添加错误提示：**

```typescript
private async runAIAnalysisInBackground(
    filePath: string,
    staticCapsule: FileCapsule
): Promise<void> {
    try {
        this.logger.info(`[AI] 开始后台AI分析: ${filePath}`);

        const enhancedCapsule = await this.fileAnalysisService.enhanceWithAI(
            staticCapsule
        );

        // 发送AI增强结果
        const updateMessage = createUpdateAnalysisCardMessage(enhancedCapsule, false);
        this.sendMessage(updateMessage);

        this.logger.info(`[UI] 已发送AI增强结果: ${filePath}`);
    } catch (error) {
        this.logger.warn(`[AI] AI分析失败: ${filePath}`, error);

        // 🔥 用户友好的错误提示
        if (error instanceof AnalysisError) {
            if (error.code === ErrorCode.AI_TIMEOUT) {
                vscode.window.showWarningMessage(
                    `AI 分析超时，已显示基础分析结果。\n\n` +
                    `文件: ${staticCapsule.file}\n` +
                    `建议: 检查网络连接或稍后重试。`,
                    '重试'
                ).then(choice => {
                    if (choice === '重试') {
                        this.handleAnalyzeFile({ path: filePath, force: true });
                    }
                });
            } else if (error.code === ErrorCode.AI_RATE_LIMIT) {
                vscode.window.showWarningMessage(
                    `AI 服务限流，已显示基础分析结果。\n\n` +
                    `建议: 等待几分钟后重试。`
                );
            }
        }

        // 保持静态结果，移除 loading 状态
        const fallbackMessage = createUpdateAnalysisCardMessage(staticCapsule, false);
        this.sendMessage(fallbackMessage);
    }
}
```

---

## 📊 错误恢复效果

### 场景 1: 网络抖动

```
用户双击文件
  ↓
静态分析成功 ✅ (100ms)
  ↓ 显示基础结果
AI 分析：尝试 1 → 网络错误 ❌
  ↓ 等待 1s
AI 分析：尝试 2 → 成功 ✅ (5s)
  ↓
显示完整结果

结果：用户无感知重试，最终成功 ✅
```

### 场景 2: AI 服务不可用

```
用户双击文件
  ↓
静态分析成功 ✅ (100ms)
  ↓ 显示基础结果
AI 分析：尝试 1 → 503 服务不可用 ❌
  ↓ 等待 1s
AI 分析：尝试 2 → 503 ❌
  ↓ 等待 2s
AI 分析：尝试 3 → 503 ❌
  ↓
降级：保留静态结果 ✅
显示提示："AI 分析失败，显示基础结果"

结果：用户仍能看到静态分析，体验降级但不中断 ✅
```

### 场景 3: 认证失败

```
用户双击文件
  ↓
静态分析成功 ✅
  ↓
AI 分析：401 认证失败 ❌
  ↓ 不重试（无意义）
显示提示："AI 服务认证失败，请检查 API Key"
  ↓
提供"打开设置"按钮

结果：立即反馈错误，引导用户修复 ✅
```

---

## 🧪 测试计划

### 测试 1: 重试机制

```typescript
// 模拟网络错误
let attempts = 0;
const mockAIClient = {
    async analyze() {
        attempts++;
        if (attempts < 3) {
            throw new Error('Network error');
        }
        return { summary: '...', inferences: [], recommendations: [] };
    }
};

// 验证
await fileAnalysisService.enhanceWithAI(capsule);
expect(attempts).toBe(3);  // 重试 2 次后成功
```

### 测试 2: 降级策略

```typescript
// 模拟 AI 完全失败
const mockAIClient = {
    async analyze() {
        throw new Error('Service unavailable');
    }
};

// 验证
const result = await fileAnalysisService.enhanceWithAI(staticCapsule);
expect(result).toEqual(staticCapsule);  // 返回静态结果
```

### 测试 3: 超时控制

```typescript
// 模拟慢速 AI
const mockAIClient = {
    async analyze() {
        await sleep(40000);  // 40s（超过 30s 限制）
        return { ... };
    }
};

// 验证
const result = await fileAnalysisService.enhanceWithAI(staticCapsule);
expect(result).toEqual(staticCapsule);  // 超时后返回静态结果
```

---

## 🎯 里程碑

- [ ] **6.1**: 增强 RetryHelper（可重试判断）
- [ ] **6.2**: 创建 AnalysisError 类
- [ ] **6.3**: 集成重试机制到 FileAnalysisService
- [ ] **6.4**: 添加超时控制
- [ ] **6.5**: 完善用户错误提示
- [ ] **6.6**: 错误日志收集
- [ ] **6.7**: 错误恢复测试

---

## 📈 预期效果

| 指标 | 改进前 | 改进后 |
|------|--------|--------|
| 网络抖动成功率 | 20% | **95%** ✅ (重试) |
| AI 失败用户体验 | 报错 | **降级显示** ✅ |
| 错误诊断时间 | 手动排查 | **自动日志** ✅ |
| 超时等待 | 无限制 | **30s 上限** ✅ |

---

**下一步**: 实现 RetryHelper 增强 + AnalysisError 类 🚀
