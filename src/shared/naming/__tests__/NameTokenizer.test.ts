// src/shared/naming/__tests__/NameTokenizer.test.ts
/**
 * 文件名分词器单元测试
 */

import { tokenizeFileName, stripExt, detectNamingStyle } from '../NameTokenizer';

describe('NameTokenizer', () => {
    describe('stripExt', () => {
        it('应该分离文件名和扩展名', () => {
            expect(stripExt('file.txt')).toEqual({ base: 'file', ext: 'txt' });
            expect(stripExt('component.tsx')).toEqual({ base: 'component', ext: 'tsx' });
        });

        it('应该处理多个点的情况', () => {
            expect(stripExt('file.test.ts')).toEqual({ base: 'file.test', ext: 'ts' });
            expect(stripExt('app.config.json')).toEqual({ base: 'app.config', ext: 'json' });
        });

        it('应该处理无扩展名的情况', () => {
            expect(stripExt('Makefile')).toEqual({ base: 'Makefile', ext: '' });
            expect(stripExt('README')).toEqual({ base: 'README', ext: '' });
        });

        it('应该处理隐藏文件', () => {
            expect(stripExt('.gitignore')).toEqual({ base: '', ext: 'gitignore' });
        });

        it('扩展名应该转小写', () => {
            expect(stripExt('File.TXT')).toEqual({ base: 'File', ext: 'txt' });
            expect(stripExt('Component.TSX')).toEqual({ base: 'Component', ext: 'tsx' });
        });
    });

    describe('tokenizeFileName', () => {
        describe('snake_case', () => {
            it('应该分词 analyze_hierarchy_simple.cjs', () => {
                const result = tokenizeFileName('analyze_hierarchy_simple.cjs');
                
                expect(result.ext).toBe('cjs');
                expect(result.tokens).toHaveLength(3);
                expect(result.tokens[0]).toEqual({ raw: 'analyze', lower: 'analyze', type: 'word' });
                expect(result.tokens[1]).toEqual({ raw: 'hierarchy', lower: 'hierarchy', type: 'word' });
                expect(result.tokens[2]).toEqual({ raw: 'simple', lower: 'simple', type: 'word' });
            });

            it('应该分词 user_manager.ts', () => {
                const result = tokenizeFileName('user_manager.ts');
                
                expect(result.ext).toBe('ts');
                expect(result.tokens).toHaveLength(2);
                expect(result.tokens.map(t => t.lower)).toEqual(['user', 'manager']);
            });
        });

        describe('kebab-case', () => {
            it('应该分词 universal-analysis-status-section.tsx', () => {
                const result = tokenizeFileName('universal-analysis-status-section.tsx');
                
                expect(result.ext).toBe('tsx');
                expect(result.tokens).toHaveLength(4);
                expect(result.tokens.map(t => t.lower)).toEqual([
                    'universal', 'analysis', 'status', 'section'
                ]);
            });

            it('应该分词 my-component.tsx', () => {
                const result = tokenizeFileName('my-component.tsx');
                
                expect(result.tokens.map(t => t.lower)).toEqual(['my', 'component']);
            });
        });

        describe('PascalCase', () => {
            it('应该分词 StepCard.tsx', () => {
                const result = tokenizeFileName('StepCard.tsx');
                
                expect(result.ext).toBe('tsx');
                expect(result.tokens).toHaveLength(2);
                expect(result.tokens[0]).toEqual({ raw: 'Step', lower: 'step', type: 'word' });
                expect(result.tokens[1]).toEqual({ raw: 'Card', lower: 'card', type: 'word' });
            });

            it('应该分词 UserProfileCard.tsx', () => {
                const result = tokenizeFileName('UserProfileCard.tsx');
                
                expect(result.tokens.map(t => t.lower)).toEqual(['user', 'profile', 'card']);
            });
        });

        describe('camelCase', () => {
            it('应该分词 userManager.ts', () => {
                const result = tokenizeFileName('userManager.ts');
                
                expect(result.tokens.map(t => t.lower)).toEqual(['user', 'manager']);
            });

            it('应该分词 getUserById.ts', () => {
                const result = tokenizeFileName('getUserById.ts');
                
                expect(result.tokens.map(t => t.lower)).toEqual(['get', 'user', 'by', 'id']);
            });
        });

        describe('缩写识别', () => {
            it('应该识别 API', () => {
                const result = tokenizeFileName('APIController.ts');
                
                expect(result.tokens[0]).toEqual({ raw: 'API', lower: 'api', type: 'acronym' });
                expect(result.tokens[1]).toEqual({ raw: 'Controller', lower: 'controller', type: 'word' });
            });

            it('应该识别 HTML', () => {
                const result = tokenizeFileName('HTMLParser.ts');
                
                expect(result.tokens[0].type).toBe('acronym');
                expect(result.tokens[0].lower).toBe('html');
            });

            it('应该识别 UI', () => {
                const result = tokenizeFileName('UIComponent.tsx');
                
                expect(result.tokens[0].type).toBe('acronym');
                expect(result.tokens[0].lower).toBe('ui');
            });

            it('应该正确处理 getUserByID', () => {
                const result = tokenizeFileName('getUserByID.ts');
                
                const types = result.tokens.map(t => t.type);
                const lowers = result.tokens.map(t => t.lower);
                
                expect(lowers).toContain('id');
                expect(types[types.length - 1]).toBe('acronym'); // ID 应该被识别为缩写
            });
        });

        describe('数字识别', () => {
            it('应该识别数字', () => {
                const result = tokenizeFileName('file123.ts');
                
                const numToken = result.tokens.find(t => t.type === 'num');
                expect(numToken).toBeDefined();
                expect(numToken?.raw).toBe('123');
            });

            it('应该分词 test_v2.ts', () => {
                const result = tokenizeFileName('test_v2.ts');
                
                expect(result.tokens).toHaveLength(2);
                expect(result.tokens[1].type).toBe('num');
            });
        });

        describe('混合格式', () => {
            it('应该处理 kebab + camel 混合', () => {
                const result = tokenizeFileName('my-component-UserCard.tsx');
                
                expect(result.tokens.map(t => t.lower)).toEqual([
                    'my', 'component', 'user', 'card'
                ]);
            });

            it('应该处理 snake + pascal 混合', () => {
                const result = tokenizeFileName('api_UserService.ts');
                
                expect(result.tokens.map(t => t.lower)).toEqual(['api', 'user', 'service']);
            });

            it('应该处理点分隔', () => {
                const result = tokenizeFileName('app.config.service.ts');
                
                expect(result.tokens.map(t => t.lower)).toEqual(['app', 'config', 'service']);
            });
        });

        describe('边界情况', () => {
            it('应该处理空字符串', () => {
                const result = tokenizeFileName('');
                expect(result.tokens).toHaveLength(0);
                expect(result.ext).toBe('');
            });

            it('应该处理只有扩展名', () => {
                const result = tokenizeFileName('.ts');
                expect(result.ext).toBe('ts');
            });

            it('应该处理无扩展名', () => {
                const result = tokenizeFileName('Makefile');
                expect(result.ext).toBe('');
                expect(result.tokens.length).toBeGreaterThan(0);
            });

            it('应该过滤空 token', () => {
                const result = tokenizeFileName('__file__.ts');
                // 不应该有空字符串 token
                expect(result.tokens.every(t => t.raw.length > 0)).toBe(true);
            });
        });
    });

    describe('detectNamingStyle', () => {
        it('应该检测 kebab-case', () => {
            expect(detectNamingStyle('my-component.tsx')).toBe('kebab-case');
            expect(detectNamingStyle('user-list-view.tsx')).toBe('kebab-case');
        });

        it('应该检测 snake_case', () => {
            expect(detectNamingStyle('my_component.ts')).toBe('snake_case');
            expect(detectNamingStyle('user_manager.ts')).toBe('snake_case');
        });

        it('应该检测 dot.case', () => {
            expect(detectNamingStyle('app.config.ts')).toBe('dot.case');
            expect(detectNamingStyle('user.service.ts')).toBe('dot.case');
        });

        it('应该检测 camelCase', () => {
            expect(detectNamingStyle('myComponent.tsx')).toBe('camelCase');
            expect(detectNamingStyle('getUserById.ts')).toBe('camelCase');
        });

        it('应该检测 PascalCase', () => {
            expect(detectNamingStyle('MyComponent.tsx')).toBe('PascalCase');
            expect(detectNamingStyle('UserCard.tsx')).toBe('PascalCase');
        });

        it('应该检测 UPPER_CASE', () => {
            expect(detectNamingStyle('MY_CONSTANT.ts')).toBe('UPPER_CASE');
            expect(detectNamingStyle('API_KEY')).toBe('UPPER_CASE');
        });

        it('应该检测混合风格', () => {
            expect(detectNamingStyle('my-component_name.ts')).toBe('mixed');
            expect(detectNamingStyle('user.list-view.tsx')).toBe('mixed');
        });
    });
});
