module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint', 'import'],
    extends: [
        'eslint:recommended',
        '@typescript-eslint/recommended',
        'plugin:import/recommended',
        'plugin:import/typescript'
    ],
    parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: './tsconfig.json'
    },
    settings: {
        'import/resolver': {
            typescript: {
                alwaysTryTypes: true,
                project: './tsconfig.json'
            }
        }
    },
    rules: {
        // TypeScript 相关规则
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
        '@typescript-eslint/no-explicit-any': 'warn',
        '@typescript-eslint/explicit-function-return-type': 'off',
        '@typescript-eslint/explicit-module-boundary-types': 'off',
        '@typescript-eslint/no-non-null-assertion': 'warn',
        
        // Import 相关规则 - 模块边界控制
        'import/no-restricted-paths': ['error', {
            zones: [
                {
                    target: 'src/features/explorer-alias',
                    from: 'src/features/uml-canvas',
                    message: '禁止 explorer-alias 模块访问 uml-canvas 模块'
                },
                {
                    target: 'src/features/uml-canvas', 
                    from: 'src/features/explorer-alias',
                    message: '禁止 uml-canvas 模块访问 explorer-alias 模块'
                },
                {
                    target: 'src/core',
                    from: 'src/features',
                    message: '核心模块不应依赖功能模块'
                }
            ]
        }],
        'import/no-relative-packages': 'error',
        'import/order': ['error', {
            'groups': [
                'builtin',
                'external', 
                'internal',
                'parent',
                'sibling',
                'index'
            ],
            'pathGroups': [
                {
                    'pattern': '@core/**',
                    'group': 'internal',
                    'position': 'before'
                },
                {
                    'pattern': '@shared/**',
                    'group': 'internal'
                },
                {
                    'pattern': '@feat/**',
                    'group': 'internal',
                    'position': 'after'
                }
            ],
            'pathGroupsExcludedImportTypes': ['builtin'],
            'newlines-between': 'never'
        }],
        
        // 代码质量规则
        'no-console': 'warn',
        'no-debugger': 'error',
        'prefer-const': 'error',
        'no-var': 'error',
        
        // 注释规则 - 确保文件头注释
        'valid-jsdoc': 'off' // TypeScript 已提供类型信息
    },
    overrides: [
        {
            files: ['src/features/explorer-alias/**/*.ts'],
            rules: {
                // Explorer-Alias 模块特定规则
                'import/no-restricted-paths': ['error', {
                    zones: [{
                        target: 'src/features/explorer-alias',
                        from: 'src/features/uml-canvas',
                        message: 'Explorer-Alias 模块不能依赖 UML-Canvas 模块'
                    }]
                }]
            }
        },
        {
            files: ['src/features/uml-canvas/**/*.ts'], 
            rules: {
                // UML-Canvas 模块特定规则
                'import/no-restricted-paths': ['error', {
                    zones: [{
                        target: 'src/features/uml-canvas',
                        from: 'src/features/explorer-alias', 
                        message: 'UML-Canvas 模块不能依赖 Explorer-Alias 模块'
                    }]
                }]
            }
        },
        {
            files: ['**/*.test.ts', '**/*.spec.ts'],
            env: {
                jest: true
            },
            rules: {
                '@typescript-eslint/no-explicit-any': 'off'
            }
        }
    ],
    env: {
        node: true,
        es2022: true
    },
    ignorePatterns: [
        'out/**',
        'node_modules/**',
        'webview/dist/**',
        '*.js'
    ]
};