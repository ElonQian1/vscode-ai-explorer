// src/shared/naming/NameTokenizer.ts
/**
 * 统一文件名分词器
 * 支持：kebab-case、snake_case、dot.case、camelCase、PascalCase
 * 识别：普通单词、缩写（API/HTML/ID）、数字
 */

export type Token = {
    /** 原始字符串 */
    raw: string;
    /** 小写形式 */
    lower: string;
    /** 类型：普通单词 | 缩写 | 数字 */
    type: 'word' | 'acronym' | 'num';
};

/**
 * 分离文件名和扩展名
 */
export function stripExt(name: string): { base: string; ext: string } {
    const i = name.lastIndexOf('.');
    if (i <= 0) {
        return { base: name, ext: '' };
    }
    return { 
        base: name.slice(0, i), 
        ext: name.slice(i + 1).toLowerCase() 
    };
}

/**
 * 统一文件名分词
 * 
 * @example
 * tokenizeFileName('analyze_hierarchy_simple.cjs')
 * // => { tokens: [{raw:'analyze',...}, {raw:'hierarchy',...}, ...], ext: 'cjs' }
 * 
 * tokenizeFileName('universal-analysis-status-section.tsx')
 * // => { tokens: [...], ext: 'tsx' }
 * 
 * tokenizeFileName('StepCard.tsx')
 * // => { tokens: [{raw:'Step',...}, {raw:'Card',...}], ext: 'tsx' }
 */
export function tokenizeFileName(name: string): {
    tokens: Token[];
    ext: string;
} {
    const { base, ext } = stripExt(name);
    
    // 第一步：按分隔符拆分（- _ .）
    const primaryParts = base.split(/[\-_.]+/g).filter(Boolean);
    
    // 第二步：每个部分再按驼峰拆分
    let allParts = primaryParts.flatMap(splitCamelLike);
    
    // 第三步：对连续大写字母（>2个）的部分再拆分
    // 例如：UIAPI → UI, API
    allParts = allParts.flatMap(part => {
        if (/^[A-Z]{4,}$/.test(part)) {
            // 4个或更多大写字母，按2字母一组拆分
            return splitConsecutiveUppercase(part);
        }
        return [part];
    });
    
    // 第四步：识别词类型
    const tokens: Token[] = allParts.map((part) => {
        // 纯数字
        if (/^\d+$/.test(part)) {
            return { raw: part, lower: part, type: 'num' };
        }
        
        // 连续大写字母（2个或以上）= 缩写
        // 例如：API, HTML, ID, UI, URL
        if (/^[A-Z]{2,}$/.test(part)) {
            return { 
                raw: part, 
                lower: part.toLowerCase(), 
                type: 'acronym' 
            };
        }
        
        // 普通单词
        return { 
            raw: part, 
            lower: part.toLowerCase(), 
            type: 'word' 
        };
    });
    
    return { tokens, ext };
}

/**
 * 拆分连续大写字母（4个或更多）
 * 例如：UIAPI → UI, API
 *       HTMLDOM → HT, ML, DO, M（不理想，但简单）
 */
function splitConsecutiveUppercase(s: string): string[] {
    const result: string[] = [];
    for (let i = 0; i < s.length; i += 2) {
        if (i + 2 <= s.length) {
            result.push(s.slice(i, i + 2));
        } else {
            // 剩余单个字母，合并到前一个（如果有）
            if (result.length > 0) {
                result[result.length - 1] += s.slice(i);
            } else {
                result.push(s.slice(i));
            }
        }
    }
    return result.filter(Boolean);
}

/**
 * 拆分驼峰命名（支持 camelCase 和 PascalCase）
 * 
 * 规则：
 * - 在 小写字母+大写字母 边界拆分（aB → a|B）
 * - 在 连续大写+小写字母 边界拆分（ABc → AB|c）
 * - 过滤非字母数字字符
 * 
 * @example
 * splitCamelLike('StepCard') => ['Step', 'Card']
 * splitCamelLike('APIController') => ['API', 'Controller']
 * splitCamelLike('getUserById') => ['get', 'User', 'By', 'Id']
 * splitCamelLike('UniversalUIAPI') => ['Universal', 'UIAPI']  // UIAPI will be split later
 */
function splitCamelLike(s: string): string[] {
    return s
        // 在 小写+大写 边界插入空格
        .replace(/(?<=[a-z0-9])(?=[A-Z])/g, ' ')
        // 在 大写+大写小写 边界插入空格（处理 APIController）
        .replace(/(?<=[A-Z])(?=[A-Z][a-z])/g, ' ')
        // 按非字母数字字符拆分
        .split(/[^A-Za-z0-9]+/g)
        .filter(Boolean);
}

/**
 * 工具函数：检测命名风格
 */
export function detectNamingStyle(name: string): 
    | 'kebab-case'   // my-component
    | 'snake_case'   // my_component
    | 'dot.case'     // my.component
    | 'camelCase'    // myComponent
    | 'PascalCase'   // MyComponent
    | 'UPPER_CASE'   // MY_COMPONENT
    | 'mixed'        // my-component_name
{
    const { base } = stripExt(name);
    
    if (/^[A-Z_]+$/.test(base)) return 'UPPER_CASE';
    if (/^[a-z][a-z0-9]*([A-Z][a-z0-9]*)+$/.test(base)) return 'camelCase';
    if (/^[A-Z][a-z0-9]*([A-Z][a-z0-9]*)*$/.test(base)) return 'PascalCase';
    if (base.includes('-') && !base.includes('_') && !base.includes('.')) return 'kebab-case';
    if (base.includes('_') && !base.includes('-') && !base.includes('.')) return 'snake_case';
    if (base.includes('.') && !base.includes('-') && !base.includes('_')) return 'dot.case';
    
    return 'mixed';
}
