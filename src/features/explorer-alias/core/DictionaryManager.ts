// src/features/explorer-alias/core/DictionaryManager.ts
// [module: explorer-alias] [tags: Dictionary, Cache, Translation, Learning]
/**
 * 字典管理器
 * 负责内置词典和学习型词典的管理
 */

import * as vscode from 'vscode';
import { Logger } from '../../../core/logging/Logger';

interface DictionaryEntry {
    original: string;
    translated: string;
    frequency: number;
    lastUsed: number;
    source: 'builtin' | 'learned' | 'manual';
}

interface DictionaryData {
    entries: Record<string, DictionaryEntry>;
    version: number;
    lastUpdated: number;
}

export class DictionaryManager {
    private readonly STORAGE_KEY = 'aiExplorer.dictionary';
    private readonly VERSION = 1;
    
    private builtinDictionary: Record<string, string> = {};
    private learnedDictionary: Record<string, DictionaryEntry> = {};
    private isInitialized = false;

    constructor(
        private logger: Logger,
        private context: vscode.ExtensionContext
    ) {
        this.initializeBuiltinDictionary();
    }

    /**
     * 初始化字典管理器
     */
    async initialize(): Promise<void> {
        if (this.isInitialized) {
            return;
        }

        try {
            await this.loadLearnedDictionary();
            this.isInitialized = true;
            this.logger.info('字典管理器初始化完成');
        } catch (error) {
            this.logger.error('字典管理器初始化失败', error);
            throw error;
        }
    }

    /**
     * 翻译单个词汇（优先级：学习词典 > 内置词典）
     */
    translate(word: string): string | null {
        const normalizedWord = this.normalizeWord(word);
        
        // 1. 优先查找学习型词典
        const learnedEntry = this.learnedDictionary[normalizedWord];
        if (learnedEntry) {
            this.updateUsageStats(normalizedWord);
            return learnedEntry.translated;
        }

        // 2. 查找内置词典
        const builtinTranslation = this.builtinDictionary[normalizedWord];
        if (builtinTranslation) {
            return builtinTranslation;
        }

        return null;
    }

    /**
     * 添加学习词汇
     */
    async addLearnedEntry(original: string, translated: string, source: 'learned' | 'manual' = 'learned'): Promise<void> {
        const normalizedOriginal = this.normalizeWord(original);
        const now = Date.now();

        const existingEntry = this.learnedDictionary[normalizedOriginal];
        
        this.learnedDictionary[normalizedOriginal] = {
            original,
            translated,
            frequency: existingEntry ? existingEntry.frequency + 1 : 1,
            lastUsed: now,
            source
        };

        await this.saveLearnedDictionary();
        this.logger.debug(`添加学习词汇: ${original} -> ${translated}`);
    }

    /**
     * 批量翻译
     */
    translateBatch(words: string[]): Record<string, string> {
        const results: Record<string, string> = {};
        
        for (const word of words) {
            const translation = this.translate(word);
            if (translation) {
                results[word] = translation;
            }
        }

        return results;
    }

    /**
     * 获取翻译统计信息
     */
    getStats(): {
        builtinCount: number;
        learnedCount: number;
        totalUsage: number;
        lastUpdated: number;
    } {
        const learnedCount = Object.keys(this.learnedDictionary).length;
        const totalUsage = Object.values(this.learnedDictionary)
            .reduce((sum, entry) => sum + entry.frequency, 0);
        
        const lastUpdated = Object.values(this.learnedDictionary)
            .reduce((latest, entry) => Math.max(latest, entry.lastUsed), 0);

        return {
            builtinCount: Object.keys(this.builtinDictionary).length,
            learnedCount,
            totalUsage,
            lastUpdated
        };
    }

    /**
     * 清理低频词汇
     */
    async cleanupLowFrequencyEntries(minFrequency: number = 2): Promise<number> {
        const before = Object.keys(this.learnedDictionary).length;
        
        const filtered: Record<string, DictionaryEntry> = {};
        for (const [key, entry] of Object.entries(this.learnedDictionary)) {
            if (entry.frequency >= minFrequency || entry.source === 'manual') {
                filtered[key] = entry;
            }
        }

        this.learnedDictionary = filtered;
        await this.saveLearnedDictionary();

        const removed = before - Object.keys(this.learnedDictionary).length;
        this.logger.info(`清理低频词汇: 移除 ${removed} 个条目`);
        return removed;
    }

    private initializeBuiltinDictionary(): void {
        // 内置词典 - 常见编程术语和文件名
        this.builtinDictionary = {
            // 文件夹名称
            'src': '源码',
            'lib': '库',
            'libs': '库',
            'utils': '工具',
            'helpers': '助手',
            'components': '组件',
            'services': '服务',
            'models': '模型',
            'views': '视图',
            'controllers': '控制器',
            'middlewares': '中间件',
            'middleware': '中间件',
            'config': '配置',
            'configs': '配置',
            'assets': '资源',
            'static': '静态',
            'public': '公共',
            'private': '私有',
            'shared': '共享',
            'common': '通用',
            'core': '核心',
            'features': '功能',
            'modules': '模块',
            'plugins': '插件',
            'extensions': '扩展',
            'docs': '文档',
            'documentation': '文档',
            'examples': '示例',
            'samples': '样例',
            'templates': '模板',
            'scripts': '脚本',
            'build': '构建',
            'dist': '分发',
            'output': '输出',
            'bin': '二进制',
            'vendor': '第三方',
            'node_modules': '节点模块',
            'packages': '包',
            'resources': '资源',
            'data': '数据',
            'migrations': '迁移',
            'seeds': '种子',
            'fixtures': '固定数据',
            'mocks': '模拟',
            'tests': '测试',
            'test': '测试',
            'spec': '规范',
            'specs': '规范',
            
            // 文件名
            'readme': '自述',
            'license': '许可证',
            'changelog': '更新日志',
            'contributing': '贡献指南',
            'authors': '作者',
            'contributors': '贡献者',
            'maintainers': '维护者',
            'security': '安全',
            'privacy': '隐私',
            'terms': '条款',
            'support': '支持',
            'faq': '常见问题',
            'tutorial': '教程',
            'guide': '指南',
            'manual': '手册',
            'reference': '参考',
            'api': '接口',
            'sdk': '软件开发包',
            'cli': '命令行',
            'gui': '图形界面',
            'ui': '界面',
            'ux': '用户体验',
            'design': '设计',
            'mockup': '原型',
            'wireframe': '线框图',
            'prototype': '原型',
            'style': '样式',
            'theme': '主题',
            'layout': '布局',
            'responsive': '响应式',
            'mobile': '移动端',
            'desktop': '桌面端',
            'web': '网页',
            'server': '服务器',
            'client': '客户端',
            'frontend': '前端',
            'backend': '后端',
            'fullstack': '全栈',
            'database': '数据库',
            'cache': '缓存',
            'session': '会话',
            'cookie': 'Cookie',
            'auth': '认证',
            'authentication': '身份认证',
            'authorization': '授权',
            'permission': '权限',
            'role': '角色',
            'user': '用户',
            'admin': '管理员',
            'guest': '访客',
            'profile': '档案',
            'settings': '设置',
            'preferences': '首选项',
            'options': '选项',
            'configuration': '配置',
            'environment': '环境',
            'development': '开发',
            'production': '生产',
            'staging': '预发布',
            'testing': '测试',
            'debug': '调试',
            'logging': '日志',
            'monitoring': '监控',
            'analytics': '分析',
            'metrics': '指标',
            'performance': '性能',
            'optimization': '优化',
            'vulnerability': '漏洞',
            'backup': '备份',
            'recovery': '恢复',
            'migration': '迁移',
            'deployment': '部署',
            'release': '发布',
            'version': '版本',
            'update': '更新',
            'upgrade': '升级',
            'patch': '补丁',
            'hotfix': '热修复',
            'bugfix': '错误修复',
            'feature': '功能',
            'enhancement': '增强',
            'improvement': '改进',
            'refactor': '重构',
            'cleanup': '清理',
            'maintenance': '维护',
            'deprecated': '已弃用',
            'legacy': '旧版',
            'experimental': '实验性',
            'beta': '测试版',
            'alpha': '内测版',
            'stable': '稳定版',
            'latest': '最新版',
            'current': '当前版',
            'previous': '先前版',
            'next': '下一版'
        };

        this.logger.debug(`内置词典初始化完成，共 ${Object.keys(this.builtinDictionary).length} 个条目`);
    }

    private normalizeWord(word: string): string {
        return word.toLowerCase().trim();
    }

    private updateUsageStats(word: string): void {
        const entry = this.learnedDictionary[word];
        if (entry) {
            entry.frequency++;
            entry.lastUsed = Date.now();
        }
    }

    private async loadLearnedDictionary(): Promise<void> {
        try {
            const data = this.context.workspaceState.get<DictionaryData>(this.STORAGE_KEY);
            
            if (data && data.version === this.VERSION) {
                this.learnedDictionary = data.entries;
                this.logger.debug(`加载学习词典: ${Object.keys(this.learnedDictionary).length} 个条目`);
            } else {
                this.learnedDictionary = {};
                this.logger.debug('初始化空的学习词典');
            }
        } catch (error) {
            this.logger.error('加载学习词典失败', error);
            this.learnedDictionary = {};
        }
    }

    private async saveLearnedDictionary(): Promise<void> {
        try {
            const data: DictionaryData = {
                entries: this.learnedDictionary,
                version: this.VERSION,
                lastUpdated: Date.now()
            };

            await this.context.workspaceState.update(this.STORAGE_KEY, data);
        } catch (error) {
            this.logger.error('保存学习词典失败', error);
        }
    }
}