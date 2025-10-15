# 修复：AI 兜底增强（结构化响应 + 对齐检测）

## 问题描述

根据三个文档的要求（`1、纯大写怎么办？.md`、`2、纯大写ai兜底.md`、`3、大写也应该直接通过字典.md`），旧的 AI 兜底实现存在以下问题：

1. **返回格式简单**：只返回 `{ key: alias }` 简单映射，缺少元数据
2. **缺少对齐检测**：AI 可能遗漏某些词或返回错误数量的翻译
3. **提示词不明确**：没有说明大小写处理规则（纯大写非白名单词应当翻译）

## 文档要求

### 1、纯大写怎么办？.md

- 白名单机制：只有白名单中的全大写词才是缩写（UI/API/HTTP）
- **非白名单的全大写词**（如 DEBUG/WARNING）应当：
  - 被标记为普通词
  - 使用小写键查词典
  - 如果词典没有，交给 AI 翻译

### 2、纯大写ai兜底.md

- AI 应当返回结构化 JSON：
  ```json
  [
    { "key": "debug", "alias": "调试", "kind": "normal", "confidence": 1.0 },
    { "key": "warning", "alias": "警告", "kind": "normal", "confidence": 0.9 }
  ]
  ```
- 包含字段：
  - `key`: 英文键（小写）
  - `alias`: 中文翻译
  - `kind`: `normal`=单词, `phrase`=短语
  - `confidence`: 置信度 (0-1)

### 3、大写也应该直接通过字典.md

- 词典键永远是小写
- 对齐检测（Alignment Guard）：
  - 输入 3 个词，AI 必须返回至少 3 个 `kind=normal` 的翻译
  - 如果词数不匹配，记录警告并标记缺失词

## 改进方案

### 新增类型定义

```typescript
/**
 * AI 翻译结果项（结构化）
 */
export type AITranslationItem = {
    /** 英文键（小写） */
    key: string;
    /** 中文翻译 */
    alias: string;
    /** 类型：normal=单词, phrase=短语 */
    kind: 'normal' | 'phrase';
    /** 置信度 (0-1) */
    confidence: number;
};
```

### 升级方法

#### 1. suggestLiteralTranslationsStructured()（新方法）

返回结构化 `AITranslationItem[]` 数组：

```typescript
async suggestLiteralTranslationsStructured(
    fileName: string,
    unknownWords: string[]
): Promise<AITranslationItem[]>
```

**特性**：

- ✅ AI 提示词明确大小写规则：
  ```
  9. ⚠️ 纯大写词（如DEBUG/WARNING）不是缩写，是普通单词，应当翻译
  ```
- ✅ 对齐检测（Alignment Guard）：
  ```typescript
  const normalItems = items.filter(item => item.kind === 'normal');
  if (normalItems.length < unknownWords.length) {
      console.warn(`对齐警告：输入${unknownWords.length}个词，AI返回${normalItems.length}个单词翻译`);
  }
  ```
- ✅ 置信度过滤：
  ```typescript
  const MIN_CONFIDENCE = 0.5;
  const filtered = items.filter(item => item.confidence >= MIN_CONFIDENCE);
  ```
- ✅ 缺失词标记：
  ```typescript
  const returnedKeys = new Set(normalItems.map(i => i.key.toLowerCase()));
  const missingWords = unknownWords.filter(w => !returnedKeys.has(w.toLowerCase()));
  ```

#### 2. suggestLiteralTranslations()（兼容旧接口）

保持原有签名，内部调用新方法并转换为简单映射：

```typescript
async suggestLiteralTranslations(
    fileName: string,
    unknownWords: string[]
): Promise<Record<string, string>> {
    const items = await this.suggestLiteralTranslationsStructured(fileName, unknownWords);
    
    // 转换为简单映射（兼容现有代码）
    const mappings: Record<string, string> = {};
    for (const item of items) {
        mappings[item.key] = item.alias;
    }
    
    return mappings;
}
```

### 增强的 AI 提示词

```typescript
const systemPrompt = `你是文件名"直译"助手。你的任务是为未知的英文单词或短语，提供**死板直译**的中文建议。

规则：
1. 输出格式：JSON 数组，每项包含：{ "key": "英文（小写）", "alias": "中文", "kind": "normal或phrase", "confidence": 0-1 }
2. key: 英文单词或短语（小写）
3. alias: 对应的中文词（不要加后缀，不要解释）
4. kind: "normal"=单词, "phrase"=短语
5. confidence: 置信度（0.8-1.0表示高置信，0.5-0.8表示中等）
6. 必须逐词或短语直译，保持原意义
7. 如果单词可以组成短语，同时返回单词和短语翻译
8. ⚠️ 短语翻译时，只翻译单词本身，不要添加任何分隔符
9. ⚠️ 纯大写词（如DEBUG/WARNING）不是缩写，是普通单词，应当翻译
10. ⚠️ 必须为每个输入词返回翻译，不能遗漏

示例输出：
[
  { "key": "debug", "alias": "调试", "kind": "normal", "confidence": 1.0 },
  { "key": "warning", "alias": "警告", "kind": "normal", "confidence": 1.0 },
  { "key": "element", "alias": "元素", "kind": "normal", "confidence": 1.0 },
  { "key": "hierarchy", "alias": "层级", "kind": "normal", "confidence": 0.9 },
  { "key": "element hierarchy", "alias": "元素层级", "kind": "phrase", "confidence": 0.95 }
]`;
```

**关键改进**：

- 第 9 条明确大写词处理
- 第 10 条强制完整覆盖
- 示例包含多种场景

## 测试用例

### 用例 1：纯大写词翻译

**输入**：

```typescript
fileName: "DEBUG_USEFORM_WARNING_ATTRIBUTION.md"
unknownWords: ["DEBUG", "USEFORM", "WARNING", "ATTRIBUTION"]
```

**预期 AI 响应**：

```json
[
  { "key": "debug", "alias": "调试", "kind": "normal", "confidence": 1.0 },
  { "key": "useform", "alias": "使用表单", "kind": "normal", "confidence": 0.8 },
  { "key": "warning", "alias": "警告", "kind": "normal", "confidence": 1.0 },
  { "key": "attribution", "alias": "归因", "kind": "normal", "confidence": 0.9 }
]
```

**对齐检测**：

- 输入 4 个词，AI 返回 4 个 `kind=normal` 翻译 ✅
- 无缺失词 ✅

### 用例 2：AI 遗漏某词（触发对齐警告）

**输入**：

```typescript
unknownWords: ["DEBUG", "WARNING", "UNKNOWN"]
```

**AI 错误响应**：

```json
[
  { "key": "debug", "alias": "调试", "kind": "normal", "confidence": 1.0 },
  { "key": "warning", "alias": "警告", "kind": "normal", "confidence": 1.0 }
]
```

**对齐检测输出**：

```
[LiteralAIFallback] 对齐警告：输入3个词，AI返回2个单词翻译
  输入词: DEBUG, WARNING, UNKNOWN
  AI返回: debug, warning
  缺失词: UNKNOWN
```

### 用例 3：短语 + 单词混合

**输入**：

```typescript
unknownWords: ["element", "hierarchy"]
```

**AI 响应**：

```json
[
  { "key": "element", "alias": "元素", "kind": "normal", "confidence": 1.0 },
  { "key": "hierarchy", "alias": "层级", "kind": "normal", "confidence": 0.9 },
  { "key": "element hierarchy", "alias": "元素层级", "kind": "phrase", "confidence": 0.95 }
]
```

**解释**：

- 返回 2 个单词 + 1 个短语
- 对齐检测：2 个 normal 项 = 2 个输入词 ✅

## 完整流程

以 `DEBUG_USEFORM_WARNING.md` 为例：

```
1. splitWithDelimiters()
   → tokens: [
       { raw: "DEBUG", lower: "debug", type: "word" },
       { raw: "USEFORM", lower: "useform", type: "word" },
       { raw: "WARNING", lower: "warning", type: "word" }
     ]
   → delims: ["_", "_", ""]
   → ext: ".md"

2. LiteralAliasBuilderV2.buildLiteralAlias()
   → 逐词查词典（使用 lower 小写键）
   → 假设词典没有这些词
   → unknownWords: ["DEBUG", "USEFORM", "WARNING"]

3. LiteralAIFallback.suggestLiteralTranslationsStructured()
   → AI 返回：
     [
       { key: "debug", alias: "调试", kind: "normal", confidence: 1.0 },
       { key: "useform", alias: "使用表单", kind: "normal", confidence: 0.8 },
       { key: "warning", alias: "警告", kind: "normal", confidence: 1.0 }
     ]
   → 对齐检测：3 个输入 = 3 个返回 ✅

4. DictionaryResolver.writeBatchLearning()
   → 写入学习词典（小写键）：
     {
       "debug": { "alias": "调试", "confidence": 1.0 },
       "useform": { "alias": "使用表单", "confidence": 0.8 },
       "warning": { "alias": "警告", "confidence": 1.0 }
     }

5. LiteralAliasBuilderV2.buildLiteralAlias()（重新翻译）
   → 查词典：debug → 调试, useform → 使用表单, warning → 警告
   → rebuildWithDelimiters()
   → 最终别名：调试_使用表单_警告.md
```

## 优势总结

### ✅ 满足文档要求

- **1、纯大写怎么办？.md**：非白名单大写词被标记为 `type: 'word'`，使用小写查词典 ✅
- **2、纯大写ai兜底.md**：AI 返回结构化 JSON（key, alias, kind, confidence）✅
- **3、大写也应该直接通过字典.md**：词典键永远小写，对齐检测防止遗漏 ✅

### ✅ 工程改进

- 向后兼容：旧接口 `suggestLiteralTranslations()` 继续工作
- 可扩展：新接口 `suggestLiteralTranslationsStructured()` 提供更多信息
- 质量保障：对齐检测 + 置信度过滤
- 调试友好：详细警告日志

### ✅ 实际案例验证

**输入**：`DEBUG_USEFORM_WARNING_ATTRIBUTION.md`

**预期输出**：`调试_使用表单_警告_归因.md`（假设 USEFORM 和 ATTRIBUTION 由 AI 翻译）

## 改进文件

- ✅ `src/features/explorer-alias/infra/translators/LiteralAIFallback.ts`

## 下一步

1. 编译代码验证语法
2. 运行测试（test-enhanced-tokenizer.ts）
3. 用户测试真实文件
4. 根据对齐警告调整 AI 提示词
