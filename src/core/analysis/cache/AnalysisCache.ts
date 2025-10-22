// src/core/analysis/cache/AnalysisCache.ts
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { AnalysisResult } from '../AnalysisOrchestrator';

interface CacheEntry {
  result: AnalysisResult;
  fileHash: string;
  cachedAt: number;
  ttlHours: number;
}

/**
 * 🗄️ 分析缓存系统 - 支持JSONL持久化存储
 * 
 * 特性：
 * - JSONL格式便于查看和调试
 * - 基于文件哈希的失效检测
 * - TTL过期机制
 * - 版本管理支持批量失效
 */
export class AnalysisCache {
  private memoryCache = new Map<string, CacheEntry>();
  private cacheDir: string;
  private cacheFile: string;
  private maxMemoryEntries = 1000;
  private defaultTtlHours = 24 * 7; // 7天

  constructor(workspaceRoot: string) {
    this.cacheDir = path.join(workspaceRoot, 'analysis', '.ai');
    this.cacheFile = path.join(this.cacheDir, 'cache.jsonl');
    this.loadFromDisk();
  }

  /**
   * 📥 获取缓存结果
   */
  async get(filePath: string): Promise<AnalysisResult | null> {
    const key = this.getKey(filePath);
    
    // 1. 检查内存缓存
    let entry = this.memoryCache.get(key);
    if (!entry) {
      // 2. 从磁盘加载（如果内存中没有）
      await this.loadFromDisk();
      entry = this.memoryCache.get(key);
    }

    if (!entry) {
      return null;
    }

    // 3. 检查TTL过期
    const now = Date.now();
    const ageHours = (now - entry.cachedAt) / (1000 * 60 * 60);
    if (ageHours > entry.ttlHours) {
      await this.delete(filePath);
      return null;
    }

    // 4. 检查文件是否变更
    try {
      const currentHash = await this.getFileHash(filePath);
      if (currentHash !== entry.fileHash) {
        await this.delete(filePath);
        return null;
      }
    } catch {
      // 文件不存在或无法访问，删除缓存
      await this.delete(filePath);
      return null;
    }

    return entry.result;
  }

  /**
   * 💾 设置缓存结果
   */
  async set(result: AnalysisResult, ttlHours?: number): Promise<void> {
    const key = this.getKey(result.path);
    const fileHash = await this.getFileHash(result.path).catch(() => '');
    
    const entry: CacheEntry = {
      result,
      fileHash,
      cachedAt: Date.now(),
      ttlHours: ttlHours || this.defaultTtlHours
    };

    // 更新内存缓存
    this.memoryCache.set(key, entry);

    // 限制内存缓存大小
    if (this.memoryCache.size > this.maxMemoryEntries) {
      const oldestKey = this.memoryCache.keys().next().value;
      if (oldestKey) {
        this.memoryCache.delete(oldestKey);
      }
    }

    // 异步写入磁盘
    this.saveToDiskAsync();
  }

  /**
   * 🗑️ 删除缓存项
   */
  async delete(filePath: string): Promise<void> {
    const key = this.getKey(filePath);
    this.memoryCache.delete(key);
    
    // 异步更新磁盘
    this.saveToDiskAsync();
  }

  /**
   * 🧹 清理过期缓存
   */
  async cleanup(): Promise<void> {
    const now = Date.now();
    const toDelete: string[] = [];

    for (const [key, entry] of this.memoryCache.entries()) {
      const ageHours = (now - entry.cachedAt) / (1000 * 60 * 60);
      if (ageHours > entry.ttlHours) {
        toDelete.push(key);
      }
    }

    for (const key of toDelete) {
      this.memoryCache.delete(key);
    }

    if (toDelete.length > 0) {
      await this.saveToDisk();
    }
  }

  /**
   * 🔄 清空所有缓存
   */
  async clear(): Promise<void> {
    this.memoryCache.clear();
    try {
      await fs.unlink(this.cacheFile);
    } catch {
      // 文件不存在，忽略错误
    }
  }

  /**
   * 📊 获取缓存统计
   */
  async getStats(): Promise<{ total: number; heuristic: number; ast: number; llm: number }> {
    const stats = { total: 0, heuristic: 0, ast: 0, llm: 0 };
    
    for (const entry of this.memoryCache.values()) {
      stats.total++;
      switch (entry.result.source) {
        case 'heuristic': stats.heuristic++; break;
        case 'ast': stats.ast++; break;
        case 'llm': stats.llm++; break;
      }
    }

    return stats;
  }

  /**
   * 💾 立即保存到磁盘
   */
  async saveToDisk(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });

      const lines: string[] = [];
      for (const [key, entry] of this.memoryCache.entries()) {
        const line = JSON.stringify({ key, ...entry });
        lines.push(line);
      }

      await fs.writeFile(this.cacheFile, lines.join('\n'), 'utf8');
    } catch (error) {
      console.warn('Failed to save cache to disk:', error);
    }
  }

  /**
   * 📥 从磁盘加载缓存
   */
  private async loadFromDisk(): Promise<void> {
    try {
      const content = await fs.readFile(this.cacheFile, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());

      this.memoryCache.clear();
      
      for (const line of lines) {
        try {
          const { key, result, fileHash, cachedAt, ttlHours } = JSON.parse(line);
          this.memoryCache.set(key, { result, fileHash, cachedAt, ttlHours });
        } catch (error) {
          console.warn('Failed to parse cache line:', line, error);
        }
      }
    } catch (error) {
      // 缓存文件不存在或损坏，从空开始
      this.memoryCache.clear();
    }
  }

  /**
   * 🔄 异步保存到磁盘（防抖）
   */
  private saveToDiskAsync = this.debounce(() => {
    this.saveToDisk().catch(console.warn);
  }, 5000);

  /**
   * 🔑 生成缓存键
   */
  private getKey(filePath: string): string {
    // 使用相对路径和规范化路径作为键
    const normalized = path.normalize(filePath).replace(/\\/g, '/');
    return crypto.createHash('md5').update(normalized).digest('hex');
  }

  /**
   * 🔐 计算文件哈希
   */
  private async getFileHash(filePath: string): Promise<string> {
    try {
      const stat = await fs.stat(filePath);
      if (stat.isDirectory()) {
        // 目录使用修改时间和大小
        return `dir_${stat.mtime.getTime()}_${stat.size}`;
      } else {
        // 文件使用内容哈希（小文件）或元数据哈希（大文件）
        if (stat.size < 1024 * 1024) { // 小于1MB，计算内容哈希
          const content = await fs.readFile(filePath);
          return crypto.createHash('md5').update(content).digest('hex');
        } else {
          // 大文件使用元数据
          return `file_${stat.mtime.getTime()}_${stat.size}`;
        }
      }
    } catch (error) {
      throw new Error(`无法访问文件: ${filePath}`);
    }
  }

  /**
   * ⏱️ 防抖函数
   */
  private debounce<T extends (...args: any[]) => any>(
    func: T,
    wait: number
  ): (...args: Parameters<T>) => void {
    let timeoutId: NodeJS.Timeout | undefined;
    
    return (...args: Parameters<T>) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), wait);
    };
  }

  /**
   * 📤 导出缓存数据（供调试使用）
   */
  async exportCache(): Promise<Record<string, AnalysisResult>> {
    const exported: Record<string, AnalysisResult> = {};
    
    for (const [key, entry] of this.memoryCache.entries()) {
      exported[entry.result.path] = entry.result;
    }

    return exported;
  }

  /**
   * 📊 获取缓存大小信息
   */
  getCacheInfo(): { memoryEntries: number; estimatedSizeKB: number; cacheFile: string } {
    const entries = this.memoryCache.size;
    const estimatedSize = entries * 2; // 粗略估算每条记录2KB
    
    return {
      memoryEntries: entries,
      estimatedSizeKB: estimatedSize,
      cacheFile: this.cacheFile
    };
  }
}