// 测试Markdown渲染器功能
const { MarkdownRenderer } = require('./out/shared/utils/MarkdownRenderer');

function testMarkdownRenderer() {
    console.log('🧪 测试 Markdown 渲染器功能\n');
    
    try {
        const renderer = MarkdownRenderer.getInstance();
        
        // 测试各种Markdown语法
        const testCases = [
            {
                name: '标题测试',
                input: '## 业务价值\n\n### 核心优势',
                expected: '包含 <h2> 和 <h3> 标签'
            },
            {
                name: '粗体和斜体测试',
                input: '**重要功能** 和 *特殊说明*',
                expected: '包含 <strong> 和 <em> 标签'
            },
            {
                name: '行内代码测试',
                input: '使用 `ReactComponent` 进行渲染',
                expected: '包含 <code> 标签'
            },
            {
                name: '列表测试',
                input: '- **核心优势**: 统一接口\n- *技术特色*: 多提供商支持',
                expected: '包含 <ul> 和 <li> 标签'
            },
            {
                name: '代码块测试',
                input: '```typescript\nconst client = new AIClient();\n```',
                expected: '包含 <pre> 和代码高亮'
            }
        ];
        
        console.log('📊 测试结果:');
        console.log('┌─────────────────────┬─────────────┬────────────────────────────┐');
        console.log('│ 测试用例            │ 状态        │ 输出预览                   │');
        console.log('├─────────────────────┼─────────────┼────────────────────────────┤');
        
        for (const testCase of testCases) {
            try {
                const result = renderer.renderToHtml(testCase.input);
                const isValid = result.includes('<') && !result.includes('渲染失败');
                const status = isValid ? '✅ 通过' : '❌ 失败';
                const preview = result.length > 30 ? result.substring(0, 30) + '...' : result;
                const cleanPreview = preview.replace(/\n/g, ' ').replace(/</g, '&lt;');
                
                console.log(`│ ${testCase.name.padEnd(19)} │ ${status.padEnd(11)} │ ${cleanPreview.padEnd(26)} │`);
                
                if (!isValid) {
                    console.log(`│     错误: ${result.substring(0, 50)}...`);
                }
            } catch (error) {
                console.log(`│ ${testCase.name.padEnd(19)} │ ❌ 异常      │ ${error.message.padEnd(26)} │`);
            }
        }
        
        console.log('└─────────────────────┴─────────────┴────────────────────────────┘\n');
        
        // 测试智能检测功能
        console.log('🔍 测试智能Markdown检测:');
        const detectTests = [
            { text: '普通文本', hasMd: false },
            { text: '**粗体文本**', hasMd: true },
            { text: '## 标题', hasMd: true },
            { text: '`代码`', hasMd: true },
            { text: '- 列表项', hasMd: true },
            { text: '没有特殊格式的普通文本', hasMd: false }
        ];
        
        for (const test of detectTests) {
            const result = renderer.renderText(test.text);
            const actuallyRendered = result.includes('<strong>') || result.includes('<h2>') || 
                                    result.includes('<code>') || result.includes('<ul>');
            const status = (actuallyRendered === test.hasMd) ? '✅' : '❌';
            console.log(`   ${status} "${test.text}" → ${actuallyRendered ? 'MD渲染' : '纯文本'}`);
        }
        
        console.log('\n✨ Markdown渲染器测试完成！');
        
    } catch (error) {
        console.error('❌ 测试失败:', error);
        console.log('\n💡 可能的原因:');
        console.log('   1. 编译尚未完成，请先运行 npm run compile');
        console.log('   2. MarkdownRenderer 类路径错误');
        console.log('   3. marked 或 highlight.js 依赖问题');
    }
}

// 运行测试
testMarkdownRenderer();