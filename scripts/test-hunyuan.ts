// 测试腾讯混元 API 连接
import * as vscode from 'vscode';
import { OpenAI } from 'openai';

async function testHunyuan() {
    console.log('🔍 开始测试腾讯混元 API...\n');
    
    // 读取配置
    const config = vscode.workspace.getConfiguration('aiExplorer');
    const apiKey = config.get<string>('hunyuanApiKey');
    const baseUrl = config.get<string>('hunyuanBaseUrl', 'https://api.hunyuan.cloud.tencent.com/v1');
    const model = config.get<string>('hunyuanModel', 'hunyuan-turbo');
    
    console.log('📋 当前配置:');
    console.log(`  - API Key: ${apiKey ? `${apiKey.substring(0, 10)}...` : '❌ 未配置'}`);
    console.log(`  - Base URL: ${baseUrl}`);
    console.log(`  - Model: ${model}\n`);
    
    if (!apiKey) {
        console.error('❌ 未配置腾讯混元 API Key');
        console.log('\n💡 请先设置 API Key:');
        console.log('   1. Ctrl+Shift+P（Mac: Cmd+Shift+P）');
        console.log('   2. 输入 "AI 资源管理器：设置腾讯混元 API Key"');
        return;
    }
    
    try {
        const client = new OpenAI({
            apiKey,
            baseURL: baseUrl,
            defaultHeaders: {
                'Content-Type': 'application/json'
            }
        });
        
        console.log('🚀 发送测试请求...');
        console.log(`   请求: 将 "UserProfile" 翻译成中文\n`);
        
        const startTime = Date.now();
        
        const response = await client.chat.completions.create({
            model,
            messages: [
                { role: 'user', content: '将以下英文翻译成中文，只返回翻译结果：UserProfile' }
            ],
            max_tokens: 50,
            temperature: 0.3
        });
        
        const elapsed = Date.now() - startTime;
        
        const result = response.choices[0]?.message?.content;
        
        console.log('✅ 测试成功！\n');
        console.log('📊 响应信息:');
        console.log(`  - 翻译结果: ${result}`);
        console.log(`  - 模型: ${response.model}`);
        console.log(`  - Token 使用: ${response.usage?.total_tokens || 0} (输入: ${response.usage?.prompt_tokens || 0}, 输出: ${response.usage?.completion_tokens || 0})`);
        console.log(`  - 耗时: ${elapsed}ms\n`);
        
        console.log('🎉 腾讯混元 API 工作正常！');
        
    } catch (error: any) {
        console.error('❌ 测试失败！\n');
        console.error('错误信息:');
        console.error(`  类型: ${error.name || 'Unknown'}`);
        console.error(`  消息: ${error.message}`);
        
        if (error.response) {
            console.error(`  HTTP 状态: ${error.response.status}`);
            console.error(`  响应数据:`, JSON.stringify(error.response.data, null, 2));
        }
        
        if (error.stack) {
            console.error('\n堆栈跟踪:');
            console.error(error.stack);
        }
        
        console.log('\n🔍 可能的原因:');
        console.log('  1. API Key 无效或已过期');
        console.log('  2. 网络连接问题（防火墙、代理等）');
        console.log('  3. API 配额已用完');
        console.log('  4. 服务端暂时不可用');
        console.log('\n💡 建议:');
        console.log('  1. 检查 API Key 是否正确（登录腾讯云混元控制台）');
        console.log('  2. 检查网络连接（ping api.hunyuan.cloud.tencent.com）');
        console.log('  3. 查看 VS Code 输出面板（AI Explorer）的日志');
    }
}

// Node.js 环境下直接运行
if (require.main === module) {
    // 模拟 VS Code 配置
    const mockConfig = {
        get: <T>(key: string, defaultValue?: T): T | undefined => {
            const settings: any = {
                'hunyuanApiKey': process.env.HUNYUAN_API_KEY || '',
                'hunyuanBaseUrl': 'https://api.hunyuan.cloud.tencent.com/v1',
                'hunyuanModel': 'hunyuan-turbo'
            };
            return settings[key] ?? defaultValue;
        }
    };
    
    // @ts-ignore
    global.vscode = {
        workspace: {
            getConfiguration: () => mockConfig
        }
    };
    
    testHunyuan().catch(console.error);
}

export { testHunyuan };
