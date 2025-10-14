/**
 * DictionaryResolver.ts
 * 
 * 直译词典解析器，支持：
 * 1. 分层加载（项目固定 > 项目学习 > 全局 > 内置）
 * 2. 最长短语匹配（Trie 树实现）
 * 3. 形态归一化（复数、时态还原）
 */

import * as path from 'path';
import * as fs from 'fs';

// 动态导入 vscode，避免测试环境报错
let vscode: any;
try {
    vscode = require('vscode');
} catch {
    // 测试环境下使用 mock
    vscode = {
        workspace: {
            getConfiguration: () => ({
                get: (key: string, defaultValue: any) => defaultValue
            }),
            fs: {
                readFile: async (uri: any) => {
                    const content = fs.readFileSync(uri.fsPath, 'utf-8');
                    return Buffer.from(content);
                }
            }
        },
        Uri: {
            file: (path: string) => ({ fsPath: path })
        }
    };
}

/** 词典条目 */
export interface DictEntry {
  alias: string;
  confidence?: number;
}

/** 词典结构 */
export interface Dictionary {
  words: { [word: string]: DictEntry };
  phrases: { [phrase: string]: DictEntry };
}

/** Trie 树节点 */
class TrieNode {
  children: Map<string, TrieNode> = new Map();
  isEnd: boolean = false;
  entry: DictEntry | null = null;
}

/** 
 * 形态归一化
 * 将复数、动名词、过去式等还原为基本形式
 */
function normalizeForm(word: string): string {
  const lower = word.toLowerCase();
  
  // 复数还原（简化规则）
  if (lower.endsWith('ies') && lower.length > 4) {
    return lower.slice(0, -3) + 'y'; // entities → entity
  }
  if (lower.endsWith('es') && lower.length > 3) {
    const stem = lower.slice(0, -2);
    // 特殊情况：-ches, -shes, -xes, -zes 保留 es
    if (stem.endsWith('ch') || stem.endsWith('sh') || stem.endsWith('x') || stem.endsWith('z')) {
      return lower;
    }
    return stem; // nodes → node
  }
  if (lower.endsWith('s') && lower.length > 2) {
    return lower.slice(0, -1); // elements → element
  }

  // 动名词/现在分词还原
  if (lower.endsWith('ing') && lower.length > 5) {
    const stem = lower.slice(0, -3);
    // 双写尾字母的情况：running → run
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
      return stem.slice(0, -1);
    }
    // 特殊情况：analyzing → analyze (z 结尾加 e)
    if (stem.endsWith('z') || stem.endsWith('v')) {
      return stem + 'e';
    }
    return stem; // doing → do
  }

  // 过去式还原
  if (lower.endsWith('ed') && lower.length > 4) {
    const stem = lower.slice(0, -2);
    // 双写尾字母的情况：stopped → stop
    if (stem.length >= 3 && stem[stem.length - 1] === stem[stem.length - 2]) {
      return stem.slice(0, -1);
    }
    // 特殊情况：analyzed → analyze (z 结尾加 e)
    if (stem.endsWith('z') || stem.endsWith('v')) {
      return stem + 'e';
    }
    return stem; // walked → walk
  }

  return lower;
}

/**
 * 直译词典解析器
 */
export class DictionaryResolver {
  private wordTrie = new TrieNode();
  private phraseTrie = new TrieNode();
  private wordMap = new Map<string, DictEntry>(); // 原词 → 条目
  private normalizedMap = new Map<string, string>(); // 归一词 → 原词

  constructor() {}

  /**
   * 加载分层词典
   * @param workspaceRoot 工作区根路径
   */
  async loadDictionaries(workspaceRoot: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('aiExplorer.alias');
    const dictPaths: string[] = config.get('literalDictPaths') || [
      '.ai/.ai-literal.dict.json',
      '.ai/.ai-glossary.literal.learned.json'
    ];

    // 清空旧数据
    this.wordTrie = new TrieNode();
    this.phraseTrie = new TrieNode();
    this.wordMap.clear();
    this.normalizedMap.clear();

    // 加载内置词典（优先级最低）
    this.loadBuiltinDict();

    // 加载用户词典（按优先级从低到高）
    for (const relPath of dictPaths.reverse()) {
      const absPath = path.join(workspaceRoot, relPath);
      await this.loadDictFile(absPath);
    }
  }

  /**
   * 加载内置词典
   */
  private loadBuiltinDict(): void {
    const builtinDict: Dictionary = {
      words: {
        'element': { alias: '元素', confidence: 1.0 },
        'hierarchy': { alias: '层级', confidence: 1.0 },
        'analyze': { alias: '分析', confidence: 1.0 },
        'simple': { alias: '简版', confidence: 1.0 },
        'script': { alias: '脚本', confidence: 1.0 },
        'universal': { alias: '通用', confidence: 1.0 },
        'api': { alias: 'API', confidence: 1.0 },
        'contact': { alias: '联系人', confidence: 1.0 },
        'module': { alias: '模块', confidence: 1.0 },
        'ui': { alias: 'UI', confidence: 1.0 }
      },
      phrases: {
        'element hierarchy': { alias: '元素_层级', confidence: 1.0 }
      }
    };

    this.mergeDictionary(builtinDict);
  }

  /**
   * 加载词典文件
   */
  private async loadDictFile(filePath: string): Promise<void> {
    try {
      const uri = vscode.Uri.file(filePath);
      const content = await vscode.workspace.fs.readFile(uri);
      const dict: Dictionary = JSON.parse(content.toString());
      this.mergeDictionary(dict);
    } catch (error) {
      // 文件不存在或格式错误，跳过
    }
  }

  /**
   * 合并词典到 Trie 树
   */
  private mergeDictionary(dict: Dictionary): void {
    // 合并单词
    if (dict.words) {
      for (const [word, entry] of Object.entries(dict.words)) {
        const normalized = normalizeForm(word);
        
        // 保存映射
        this.wordMap.set(word, entry);
        this.normalizedMap.set(normalized, word);

        // 插入 Trie
        this.insertWord(this.wordTrie, word.toLowerCase(), entry);
      }
    }

    // 合并短语
    if (dict.phrases) {
      for (const [phrase, entry] of Object.entries(dict.phrases)) {
        this.insertPhrase(this.phraseTrie, phrase.toLowerCase(), entry);
      }
    }
  }

  /**
   * 插入单词到 Trie 树
   */
  private insertWord(root: TrieNode, word: string, entry: DictEntry): void {
    let node = root;
    for (const char of word) {
      if (!node.children.has(char)) {
        node.children.set(char, new TrieNode());
      }
      node = node.children.get(char)!;
    }
    node.isEnd = true;
    node.entry = entry;
  }

  /**
   * 插入短语到 Trie 树
   */
  private insertPhrase(root: TrieNode, phrase: string, entry: DictEntry): void {
    let node = root;
    for (const char of phrase) {
      if (!node.children.has(char)) {
        node.children.set(char, new TrieNode());
      }
      node = node.children.get(char)!;
    }
    node.isEnd = true;
    node.entry = entry;
  }

  /**
   * 解析单词（支持形态归一）
   */
  resolveWord(word: string): DictEntry | null {
    const lower = word.toLowerCase();
    
    // 直接查找
    if (this.wordMap.has(word)) {
      return this.wordMap.get(word)!;
    }
    if (this.wordMap.has(lower)) {
      return this.wordMap.get(lower)!;
    }

    // 形态归一后查找
    const normalized = normalizeForm(word);
    if (this.normalizedMap.has(normalized)) {
      const originalWord = this.normalizedMap.get(normalized)!;
      return this.wordMap.get(originalWord)!;
    }

    return null;
  }

  /**
   * 最长短语匹配
   * @param tokens 词元数组
   * @param startIndex 起始索引
   * @returns [匹配的条目, 匹配的词元数量]
   */
  matchPhrase(tokens: string[], startIndex: number): [DictEntry | null, number] {
    if (startIndex >= tokens.length) {
      return [null, 0];
    }

    // 拼接短语（用空格分隔）
    const phraseTokens: string[] = [];
    let node = this.phraseTrie;
    let lastMatch: [DictEntry | null, number] = [null, 0];

    for (let i = startIndex; i < tokens.length; i++) {
      const token = tokens[i].toLowerCase();
      phraseTokens.push(token);
      const phrase = phraseTokens.join(' ');

      // 遍历短语的每个字符
      let tempNode = node;
      let failed = false;
      for (const char of (i === startIndex ? phrase : (' ' + token))) {
        if (!tempNode.children.has(char)) {
          failed = true;
          break;
        }
        tempNode = tempNode.children.get(char)!;
      }

      if (failed) {
        break;
      }

      node = tempNode;

      // 如果是完整短语，记录匹配
      if (node.isEnd && node.entry) {
        lastMatch = [node.entry, i - startIndex + 1];
      }
    }

    return lastMatch;
  }

  /**
   * 获取所有已加载的单词（用于调试）
   */
  getAllWords(): string[] {
    return Array.from(this.wordMap.keys());
  }

  /**
   * 获取统计信息
   */
  getStats(): { wordCount: number; phraseCount: number } {
    let phraseCount = 0;
    const countPhrases = (node: TrieNode) => {
      if (node.isEnd) phraseCount++;
      for (const child of node.children.values()) {
        countPhrases(child);
      }
    };
    countPhrases(this.phraseTrie);

    return {
      wordCount: this.wordMap.size,
      phraseCount
    };
  }
}
