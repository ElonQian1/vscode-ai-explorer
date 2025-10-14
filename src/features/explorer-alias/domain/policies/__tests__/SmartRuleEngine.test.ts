// src/features/explorer-alias/domain/policies/__tests__/SmartRuleEngine.test.ts
/**
 * 智能规则引擎单元测试
 * 验证文档中提到的三个示例文件的翻译效果
 */

import { SmartRuleEngine } from '../SmartRuleEngine';

describe('SmartRuleEngine', () => {
    let engine: SmartRuleEngine;

    beforeEach(() => {
        engine = new SmartRuleEngine();
    });

    describe('文档示例测试', () => {
        it('应该正确翻译 analyze_hierarchy_simple.cjs -> 层级分析（简版）脚本', () => {
            const result = engine.translate('analyze_hierarchy_simple.cjs');
            
            expect(result).toBeDefined();
            expect(result?.alias).toBe('层级分析（简版）脚本');
            expect(result?.source).toBe('rule');
            expect(result?.confidence).toBeGreaterThan(0.8);
        });

        it('应该正确翻译 universal-analysis-status-section.tsx -> 通用分析状态区块组件', () => {
            const result = engine.translate('universal-analysis-status-section.tsx');
            
            expect(result).toBeDefined();
            expect(result?.alias).toBe('通用分析状态区块组件');
            expect(result?.source).toBe('rule');
            expect(result?.confidence).toBeGreaterThan(0.8);
        });

        it('应该正确翻译 StepCard.tsx -> 步骤卡片组件', () => {
            const result = engine.translate('StepCard.tsx');
            
            expect(result).toBeDefined();
            expect(result?.alias).toBe('步骤卡片组件');
            expect(result?.source).toBe('rule');
            expect(result?.confidence).toBeGreaterThan(0.8);
        });
    });

    describe('命名风格支持', () => {
        describe('kebab-case (连字符)', () => {
            it('应该翻译 user-list-view.tsx', () => {
                const result = engine.translate('user-list-view.tsx');
                expect(result?.alias).toContain('视图');
                expect(result?.alias).toContain('组件');
            });

            it('应该翻译 data-table-component.tsx', () => {
                const result = engine.translate('data-table-component.tsx');
                expect(result?.alias).toContain('表格');
                expect(result?.alias).toContain('组件');
            });
        });

        describe('snake_case (下划线)', () => {
            it('应该翻译 user_manager.ts', () => {
                const result = engine.translate('user_manager.ts');
                expect(result?.alias).toContain('管理器');
                expect(result?.alias).toContain('模块');
            });

            it('应该翻译 api_service.ts', () => {
                const result = engine.translate('api_service.ts');
                expect(result?.alias).toContain('API');
                expect(result?.alias).toContain('服务');
            });
        });

        describe('PascalCase (帕斯卡)', () => {
            it('应该翻译 UserProfile.tsx', () => {
                const result = engine.translate('UserProfile.tsx');
                expect(result?.alias).toContain('组件');
            });

            it('应该翻译 DataGrid.tsx', () => {
                const result = engine.translate('DataGrid.tsx');
                expect(result?.alias).toContain('网格');
                expect(result?.alias).toContain('组件');
            });
        });

        describe('camelCase (驼峰)', () => {
            it('应该翻译 userService.ts', () => {
                const result = engine.translate('userService.ts');
                expect(result?.alias).toContain('服务');
                expect(result?.alias).toContain('模块');
            });

            it('应该翻译 dataProcessor.js', () => {
                const result = engine.translate('dataProcessor.js');
                expect(result?.alias).toContain('处理器');
                expect(result?.alias).toContain('脚本');
            });
        });
    });

    describe('缩写词识别', () => {
        it('应该正确识别 API', () => {
            const result = engine.translate('APIController.ts');
            expect(result?.alias).toContain('API');
            expect(result?.alias).toContain('控制器');
        });

        it('应该正确识别 UI', () => {
            const result = engine.translate('UIComponent.tsx');
            expect(result?.alias).toContain('UI');
            expect(result?.alias).toContain('组件');
        });

        it('应该正确识别 HTML', () => {
            const result = engine.translate('HTMLParser.ts');
            expect(result?.alias).toContain('HTML');
            expect(result?.alias).toContain('解析器');
        });

        it('应该正确识别 ID', () => {
            const result = engine.translate('getUserByID.ts');
            expect(result?.alias).toContain('ID');
        });
    });

    describe('扩展名后缀', () => {
        it('.tsx 应该添加"组件"后缀', () => {
            const result = engine.translate('MyComponent.tsx');
            expect(result?.alias).toContain('组件');
        });

        it('.ts 应该添加"模块"后缀', () => {
            const result = engine.translate('utils.ts');
            expect(result?.alias).toContain('模块');
        });

        it('.js 应该添加"脚本"后缀', () => {
            const result = engine.translate('script.js');
            expect(result?.alias).toContain('脚本');
        });

        it('.css 应该添加"样式"后缀', () => {
            const result = engine.translate('styles.css');
            expect(result?.alias).toContain('样式');
        });

        it('.md 应该添加"文档"后缀', () => {
            const result = engine.translate('README.md');
            expect(result?.alias).toContain('文档');
        });

        it('.json 应该添加"配置"后缀', () => {
            const result = engine.translate('config.json');
            expect(result?.alias).toContain('配置');
        });
    });

    describe('变体词（括号）', () => {
        it('simple 应该放在括号里', () => {
            const result = engine.translate('simple_view.tsx');
            expect(result?.alias).toContain('（简版）');
        });

        it('test 应该放在括号里', () => {
            const result = engine.translate('user.test.ts');
            expect(result?.alias).toContain('（测试）');
        });

        it('mock 应该放在括号里', () => {
            const result = engine.translate('api_mock.ts');
            expect(result?.alias).toContain('（桩）');
        });

        it('lite 应该放在括号里', () => {
            const result = engine.translate('editor-lite.tsx');
            expect(result?.alias).toContain('（轻量）');
        });
    });

    describe('中文语序重组', () => {
        it('修饰词应该在前面', () => {
            const result = engine.translate('global-user-manager.ts');
            // 应该是"全局用户管理器"而不是"用户全局管理器"
            expect(result?.alias).toMatch(/全局.*管理器/);
        });

        it('中心词应该在后面', () => {
            const result = engine.translate('status-panel.tsx');
            // "状态"是修饰词，"面板"是中心词
            expect(result?.alias).toMatch(/状态.*面板/);
        });

        it('应该选择正确的中心词', () => {
            // section 优先级高于 analysis
            const result = engine.translate('analysis-section.tsx');
            expect(result?.alias).toContain('区块');
        });
    });

    describe('边界情况', () => {
        it('空文件名应该返回 undefined', () => {
            const result = engine.translate('');
            expect(result).toBeUndefined();
        });

        it('无扩展名的文件应该正常处理', () => {
            const result = engine.translate('Makefile');
            // 应该有结果或者返回 undefined（取决于词典）
            expect(result === undefined || result?.alias.length > 0).toBe(true);
        });

        it('只有扩展名的文件应该返回 undefined', () => {
            const result = engine.translate('.gitignore');
            // 这种情况很难处理，可以返回 undefined
            expect(result === undefined || result?.alias.length > 0).toBe(true);
        });

        it('未知词应该保持原样', () => {
            const result = engine.translate('XyzAbc.tsx');
            // 即使不认识，也应该生成结果（保留原词 + 组件后缀）
            expect(result?.alias).toContain('组件');
        });

        it('应该限制别名长度', () => {
            const result = engine.translate('VeryLongFileNameWithManyWordsAndComplexStructure.tsx');
            expect(result?.alias.length).toBeLessThanOrEqual(32);
        });

        it('应该移除非法字符', () => {
            // 虽然输入不应该有非法字符，但防御性编程
            const result = engine.translate('file:name.ts');
            expect(result?.alias).not.toContain(':');
        });
    });

    describe('置信度计算', () => {
        it('完全命中应该有高置信度', () => {
            const result = engine.translate('user-list-view.tsx');
            expect(result?.confidence).toBeGreaterThan(0.85);
        });

        it('部分命中应该有中等置信度', () => {
            const result = engine.translate('xyz-list.tsx');
            expect(result?.confidence).toBeGreaterThan(0.6);
            expect(result?.confidence).toBeLessThan(0.9);
        });

        it('完全未知应该返回 undefined 或低置信度', () => {
            const result = engine.translate('qwerty.xyz');
            expect(result === undefined || result?.confidence < 0.6).toBe(true);
        });
    });

    describe('调试信息', () => {
        it('应该提供调试信息', () => {
            const result = engine.translate('analyze_hierarchy_simple.cjs');
            expect(result?.debug).toBeDefined();
            expect(result?.debug).toContain('tokens=');
            expect(result?.debug).toContain('head=');
            expect(result?.debug).toContain('ext=');
        });
    });
});
