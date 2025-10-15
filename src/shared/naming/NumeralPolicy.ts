/**
 * NumeralPolicy.ts
 * 
 * 数值策略：根据配置把"纯数字 token"转换为目标表示：
 * - keep: 保持阿拉伯数字
 * - cn:   转中文数字（支持到万/亿/兆，够日常文件名）
 * - roman: 简单罗马数字（1-3999）
 * 
 * 注意：这里只处理"纯数字字符串"，带字母的如 v2/sha256 不改，由上层决定。
 */
import * as vscode from 'vscode';

export function renderNumericToken(numStr: string): string {
    const mode = vscode.workspace.getConfiguration('aiExplorer').get<'keep' | 'cn' | 'roman'>('alias.numberMode', 'keep');
    if (mode === 'keep') return numStr;
    const n = Number(numStr);
    if (!Number.isFinite(n) || n < 0) return numStr;

    if (mode === 'cn') return toChineseNumber(n);
    if (mode === 'roman') return toRoman(n) || numStr;
    return numStr;
}

// —— 中文数字（简体）——
const CN_DIG = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const CN_UNIT = ['', '十', '百', '千'];
const CN_BIG = ['', '万', '亿', '兆']; // 可继续扩展 京 垓…

function toChineseNumber(n: number): string {
    if (n === 0) return '零';
    let s = '';
    let bigIdx = 0;
    while (n > 0) {
        const part = n % 10000;
        if (part !== 0) {
            const block = fourDigitsToCn(part);
            s = block + CN_BIG[bigIdx] + (s ? (s.startsWith('零') ? s.slice(1) : s) : '');
        } else if (!s.startsWith('零')) {
            s = '零' + s;
        }
        n = Math.floor(n / 10000);
        bigIdx++;
    }
    // 处理"一十X"→"十X"
    s = s.replace(/^一十/, '十');
    // 去尾部多余"零"
    s = s.replace(/零+$/, '');
    // 合并多零
    s = s.replace(/零零+/g, '零');
    return s;
}

function fourDigitsToCn(n: number): string {
    const d = [
        Math.floor(n / 1000) % 10,
        Math.floor(n / 100) % 10,
        Math.floor(n / 10) % 10,
        n % 10,
    ];
    let s = '';
    for (let i = 0; i < 4; i++) {
        if (d[i] === 0) {
            if (!s.endsWith('零') && s !== '') s += '零';
        } else {
            s += CN_DIG[d[i]] + CN_UNIT[3 - i];
        }
    }
    s = s.replace(/零+$/, '').replace(/零零+/g, '零');
    return s;
}

// —— 罗马数字（1~3999）——
const ROMAN_TABLE: Array<[number, string]> = [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
];

function toRoman(n: number): string | undefined {
    if (n <= 0 || n >= 4000) return;
    let s = '';
    for (const [v, sym] of ROMAN_TABLE) {
        while (n >= v) {
            s += sym;
            n -= v;
        }
    }
    return s;
}

/** 简单判断"纯数字" */
export function isPureNumericToken(s: string): boolean {
    return /^\d+$/.test(s);
}
