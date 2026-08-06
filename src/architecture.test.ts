// 分层守卫。
//
// 分层写在文档里一定会腐化，所以用测试钉住。这条测试同时是重构完成度的客观度量：
// 它对 data/ 与 core/ 全绿，才说明渲染代码真的搬走了，而不是换个文件名继续混着。

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.join(__dirname);

function collectSources(dir: string): Array<{ file: string; text: string }> {
  const target = path.join(SRC, dir);
  if (!fs.existsSync(target)) return [];
  return fs
    .readdirSync(target)
    .filter((name: string) => name.endsWith('.ts') && !name.endsWith('.test.ts'))
    .map((name: string) => ({
      file: `${dir}/${name}`,
      text: fs.readFileSync(path.join(target, name), 'utf8'),
    }));
}

/** 去掉注释与字符串字面量，避免注释里提到 document 就误判。 */
function stripCommentsAndStrings(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``');
}

const DOM_PATTERNS: Array<[string, RegExp]> = [
  ['document.', /\bdocument\s*\./],
  ['window.', /\bwindow\s*\./],
  ['createDiv/createEl/createSpan', /\.(?:createDiv|createEl|createSpan)\s*\(/],
  ['HTMLElement', /\bHTMLElement\b/],
  ['setIcon', /\bsetIcon\s*\(/],
  ['addEventListener', /\.addEventListener\s*\(/],
  ['querySelector', /\.querySelector(?:All)?\s*\(/],
  ['classList', /\.classList\b/],
  ['requestAnimationFrame', /\brequestAnimationFrame\s*\(/],
];

describe('分层守卫 · 数据层与业务层不得触碰 DOM', () => {
  for (const dir of ['data', 'core']) {
    const sources = collectSources(dir);

    it(`${dir}/ 下存在源文件（守卫本身没有失效）`, () => {
      expect(sources.length).toBeGreaterThan(0);
    });

    for (const { file, text } of sources) {
      it(`${file} 不含 DOM 操作`, () => {
        const code = stripCommentsAndStrings(text);
        const found = DOM_PATTERNS.filter(([, pattern]) => pattern.test(code)).map(([label]) => label);
        expect(found, `${file} 出现了 DOM 相关用法：${found.join(', ')}`).toEqual([]);
      });
    }
  }
});

describe('分层守卫 · 依赖方向单向', () => {
  for (const dir of ['data', 'core']) {
    for (const { file, text } of collectSources(dir)) {
      it(`${file} 不 import 渲染层`, () => {
        const code = stripCommentsAndStrings(text);
        expect(/from\s+['"][^'"]*\/view\//.test(code), `${file} 反向依赖了 view/`).toBe(false);
        expect(/from\s+['"][^'"]*(?:tag-pane|views|relation-modals|modals|settings)['"]/.test(code),
          `${file} 依赖了渲染层模块`).toBe(false);
      });
    }
  }

  it('core/ 不 import data/ —— 业务层只接收数据，不自己去取', () => {
    for (const { file, text } of collectSources('core')) {
      const code = stripCommentsAndStrings(text);
      expect(/from\s+['"][^'"]*\/data\//.test(code), `${file} 依赖了 data/`).toBe(false);
    }
  });

  it('core/ 与 data/ 不直接依赖 obsidian 的 UI 类', () => {
    const UI_CLASSES = /\b(?:ItemView|Modal|Menu|Setting|PluginSettingTab|SearchComponent|Notice)\b/;
    for (const dir of ['data', 'core']) {
      for (const { file, text } of collectSources(dir)) {
        const code = stripCommentsAndStrings(text);
        const importsObsidian = /from\s+['"]obsidian['"]/.test(code);
        if (!importsObsidian) continue;
        expect(UI_CLASSES.test(code), `${file} 用到了 obsidian 的 UI 类`).toBe(false);
      }
    }
  });
});
