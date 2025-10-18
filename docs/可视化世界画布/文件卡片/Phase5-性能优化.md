Phase 5: 性能优化 - 实施计划

**计划时间**: 2025-10-17  
**状态**: 📋 规划中

---

## 🎯 目标

在 Phase 4 缓存机制的基础上，进一步优化性能：

1. **批量分析**: 并发处理多个文件
2. **增量更新**: 只更新变化的节点
3. **智能预加载**: 预测用户行为

---

## 📐 架构设计

### 1. 批量分析并发控制

```
用户选择 10 个文件
  ↓
BatchAnalyzer.analyzeFiles(files)
  ↓
ConcurrencyPool (限制 5 并发)
  ├─ 文件 1-5：并发分析 ⚡
  │   └─ 每个检查缓存 → 未命中才分析
  └─ 文件 6-10：等待队列
      └─ 前 5 个完成后开始

结果：
  10 个文件串行需要 50s
  10 个文件并发需要 10s（5x 提速）
```

### 2. 增量更新机制

```
文件 A 修改
  ↓
FileWatcher 监听变化
  ↓
计算新 contentHash
  ↓
对比旧 contentHash
  ├─ 相同 → 跳过 ✅
  └─ 不同 → 只更新这一个文件 ⚡

结果：
  100 个文件，1 个修改
  全量更新：100 次分析
  增量更新：1 次分析（100x 提速）
```

### 3. 智能预加载

```
用户打开文件 A
  ↓
PreloadStrategy.predict()
  ↓
预测可能访问的文件：
  ├─ A 导入的文件（deps.out）
  ├─ 导入 A 的文件（deps.in）
  └─ 同级目录的文件
  ↓
后台预加载缓存（不阻塞）

结果：
  用户点击预测文件时，立即显示 ✅
```

---

## 🔨 实现计划

### 任务 1: BatchAnalyzer 类

**文件**: `src/features/file-analysis/BatchAnalyzer.ts`

```typescript
export class BatchAnalyzer {
    constructor(
        private fileAnalysisService: FileAnalysisService,
        private logger: Logger,
        private concurrency: number = 5
    ) {}

    /**
     * 批量分析文件（带进度回调）
     */
    async analyzeFiles(
        filePaths: string[],
        onProgress?: (current: number, total: number) => void
    ): Promise<FileCapsule[]> {
        const pool = new ConcurrencyPool(this.concurrency);
        const results: FileCapsule[] = [];

        for (const filePath of filePaths) {
            await pool.add(async () => {
                const capsule = await this.fileAnalysisService.analyzeFileStatic(filePath);
                results.push(capsule);
                onProgress?.(results.length, filePaths.length);
            });
        }

        await pool.wait();
        return results;
    }

    /**
     * 批量 AI 增强（带进度回调）
     */
    async enhanceBatch(
        capsules: FileCapsule[],
        onProgress?: (current: number, total: number) => void
    ): Promise<FileCapsule[]> {
        // 类似实现...
    }
}
```

### 任务 2: IncrementalUpdater 类

**文件**: `src/features/file-analysis/IncrementalUpdater.ts`

```typescript
export class IncrementalUpdater {
    private fileHashMap = new Map<string, string>();  // filePath -> contentHash

    constructor(
        private fileAnalysisService: FileAnalysisService,
        private logger: Logger
    ) {}

    /**
     * 检查文件是否需要更新
     */
    async needsUpdate(filePath: string): Promise<boolean> {
        const content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
        const newHash = CapsuleCache.computeContentHash(Buffer.from(content).toString('utf8'));
        const oldHash = this.fileHashMap.get(filePath);

        if (oldHash === newHash) {
            this.logger.info(`[增量更新] 文件未变化，跳过: ${filePath}`);
            return false;
        }

        this.fileHashMap.set(filePath, newHash);
        return true;
    }

    /**
     * 增量更新文件列表
     */
    async updateFiles(filePaths: string[]): Promise<FileCapsule[]> {
        const filesToUpdate: string[] = [];

        for (const filePath of filePaths) {
            if (await this.needsUpdate(filePath)) {
                filesToUpdate.push(filePath);
            }
        }

        this.logger.info(
            `[增量更新] 需要更新: ${filesToUpdate.length}/${filePaths.length}`
        );

        // 只更新变化的文件
        const batchAnalyzer = new BatchAnalyzer(this.fileAnalysisService, this.logger);
        return await batchAnalyzer.analyzeFiles(filesToUpdate);
    }
}
```

### 任务 3: PreloadStrategy 类

**文件**: `src/features/file-analysis/PreloadStrategy.ts`

```typescript
export class PreloadStrategy {
    constructor(
        private fileAnalysisService: FileAnalysisService,
        private logger: Logger
    ) {}

    /**
     * 预测用户可能访问的文件
     */
    predictNextFiles(currentFile: string, currentCapsule: FileCapsule): string[] {
        const predictions: string[] = [];

        // 1. 导入的文件（deps.out）
        for (const dep of currentCapsule.deps.out) {
            if (dep.module.startsWith('./') || dep.module.startsWith('../')) {
                const depPath = this.resolveRelativePath(currentFile, dep.module);
                predictions.push(depPath);
            }
        }

        // 2. 同级目录的文件（未来可添加）
        // 3. 最近访问的文件（未来可添加）

        return predictions;
    }

    /**
     * 后台预加载文件
     */
    async preloadFiles(filePaths: string[]): Promise<void> {
        this.logger.info(`[预加载] 开始预加载 ${filePaths.length} 个文件`);

        for (const filePath of filePaths) {
            try {
                // 只加载静态分析，不执行 AI
                await this.fileAnalysisService.analyzeFileStatic(filePath);
            } catch (error) {
                this.logger.warn(`[预加载] 失败: ${filePath}`, error);
            }
        }

        this.logger.info(`[预加载] 完成`);
    }

    private resolveRelativePath(from: string, to: string): string {
        // 实现相对路径解析...
    }
}
```

### 任务 4: 集成到 FileAnalysisService

```typescript
export class FileAnalysisService {
    private batchAnalyzer: BatchAnalyzer;
    private incrementalUpdater: IncrementalUpdater;
    private preloadStrategy: PreloadStrategy;

    constructor(logger: Logger) {
        // ... 现有初始化 ...

        this.batchAnalyzer = new BatchAnalyzer(this, logger);
        this.incrementalUpdater = new IncrementalUpdater(this, logger);
        this.preloadStrategy = new PreloadStrategy(this, logger);
    }

    // 暴露批量分析方法
    public async analyzeBatch(filePaths: string[]): Promise<FileCapsule[]> {
        return await this.batchAnalyzer.analyzeFiles(filePaths);
    }

    // 暴露增量更新方法
    public async updateIncremental(filePaths: string[]): Promise<FileCapsule[]> {
        return await this.incrementalUpdater.updateFiles(filePaths);
    }

    // 暴露预加载方法
    public async preload(filePaths: string[]): Promise<void> {
        await this.preloadStrategy.preloadFiles(filePaths);
    }
}
```

---

## 📊 性能预测

### 批量分析（10 个文件）

| 方案 | 耗时 | 提升 |
|------|------|------|
| 串行（无缓存） | 50s | - |
| 串行（有缓存 80%） | 10s | 5x |
| 并发 5（无缓存） | 10s | 5x |
| 并发 5（有缓存 80%） | **2s** | **25x** ⚡ |

### 增量更新（100 个文件，1 个修改）

| 方案 | 分析次数 | 耗时 |
|------|---------|------|
| 全量更新 | 100 | 500s |
| 增量更新 | **1** | **5s** ⚡ (100x) |

### 智能预加载

| 场景 | 无预加载 | 有预加载 |
|------|---------|---------|
| 用户点击依赖文件 | 5s（AI分析） | **<10ms**（缓存命中） ⚡ |
| 用户浏览相邻文件 | 5s×N | **<10ms×N** ⚡ |

---

## 🧪 测试计划

### 测试 1: 批量分析

```typescript
// 选择 10 个文件
const files = [
    '/src/file1.ts',
    '/src/file2.ts',
    // ...
];

// 批量分析（带进度）
const capsules = await fileAnalysisService.analyzeBatch(files);

// 验证
expect(capsules.length).toBe(10);
expect(capsules[0].file).toBe('/src/file1.ts');
```

### 测试 2: 增量更新

```typescript
// 第一次分析
await fileAnalysisService.updateIncremental(files);

// 修改一个文件
await modifyFile('/src/file1.ts');

// 第二次分析（应该只更新 file1）
const updated = await fileAnalysisService.updateIncremental(files);

// 验证
expect(updated.length).toBe(1);
expect(updated[0].file).toBe('/src/file1.ts');
```

### 测试 3: 智能预加载

```typescript
// 分析当前文件
const capsule = await fileAnalysisService.analyzeFileStatic('/src/main.tsx');

// 预测并预加载
const predictions = preloadStrategy.predictNextFiles('/src/main.tsx', capsule);
await fileAnalysisService.preload(predictions);

// 用户点击依赖文件
const depCapsule = await fileAnalysisService.analyzeFileStatic('/src/App.tsx');

// 验证：应该从缓存加载（<10ms）
```

---

## 🎯 里程碑

- [ ] **5.1**: 实现 BatchAnalyzer
- [ ] **5.2**: 实现 IncrementalUpdater
- [ ] **5.3**: 实现 PreloadStrategy
- [ ] **5.4**: 集成到 FileAnalysisService
- [ ] **5.5**: 添加用户命令（批量分析）
- [ ] **5.6**: 添加进度提示
- [ ] **5.7**: 性能测试与优化

---

**下一步**: 实现 BatchAnalyzer 类 🚀
