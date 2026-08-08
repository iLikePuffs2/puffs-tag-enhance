// @vitest-environment happy-dom
//
// 增量重绘测试。这套机制存在的唯一理由就是"刷新时不打断用户"，
// 所以断言重点不是"渲染结果对不对"，而是节点是否被复用、焦点滚动选区是否还在。

import { beforeEach, describe, expect, it } from 'vitest';
import {
  capturePreservedState,
  collectKeyedChildren,
  markRenderKey,
  reconcileOrder,
  restorePreservedState,
  tagRowSignature,
} from './reconcile';

function row(key: string, text = key): HTMLElement {
  const el = document.createElement('div');
  el.className = 'tree-item puffs-tag-list-item';
  el.textContent = text;
  return markRenderKey(el, key);
}

function container(...keys: string[]): HTMLElement {
  const el = document.createElement('div');
  for (const key of keys) el.appendChild(row(key));
  return el;
}

describe('keyed 子节点收集', () => {
  it('按 key 索引直接子节点', () => {
    const el = container('#a', '#b');
    const map = collectKeyedChildren(el);
    expect(Array.from(map.keys())).toEqual(['#a', '#b']);
    expect(map.get('#a')).toBe(el.children[0]);
  });

  it('忽略没有 key 的节点', () => {
    const el = container('#a');
    el.appendChild(document.createElement('span'));
    expect(collectKeyedChildren(el).size).toBe(1);
  });

  it('重复 key 只取第一个', () => {
    const el = document.createElement('div');
    el.appendChild(row('#a', 'первый'));
    el.appendChild(row('#a', 'second'));
    expect(collectKeyedChildren(el).size).toBe(1);
  });
});

describe('顺序对账', () => {
  let current: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    current = container('#a', '#b', '#c');
    document.body.appendChild(current);
  });

  it('复用的节点是同一实例，不会被重建', () => {
    const originalA = current.children[0];
    const originalC = current.children[2];

    reconcileOrder(current, [originalA, originalC]);

    expect(current.children.length).toBe(2);
    expect(current.children[0]).toBe(originalA); // 同一对象，非等值副本
    expect(current.children[1]).toBe(originalC);
  });

  it('删除不再出现的节点', () => {
    reconcileOrder(current, [current.children[1]]);

    expect(Array.from(current.children).map((el) => (el as HTMLElement).dataset.puffsRenderKey))
      .toEqual(['#b']);
  });

  it('调整顺序时仍复用原节点', () => {
    const [a, b, c] = Array.from(current.children);
    reconcileOrder(current, [c, a, b]);

    expect(Array.from(current.children)).toEqual([c, a, b]);
  });

  it('插入新节点，旧节点保持实例不变', () => {
    const [a, b, c] = Array.from(current.children);
    const fresh = row('#new');
    reconcileOrder(current, [a, fresh, b, c]);

    expect(current.children.length).toBe(4);
    expect(current.children[0]).toBe(a);
    expect(current.children[1]).toBe(fresh);
    expect(current.children[3]).toBe(c);
  });

  it('全部替换时清空旧节点', () => {
    const staging = container('#x', '#y');
    reconcileOrder(current, Array.from(staging.childNodes));
    expect(Array.from(current.children).map((el) => (el as HTMLElement).dataset.puffsRenderKey))
      .toEqual(['#x', '#y']);
  });

  it('内容完全一致时不产生任何移动', () => {
    const before = Array.from(current.children);
    reconcileOrder(current, before);
    expect(Array.from(current.children)).toEqual(before);
  });
});

describe('用户状态保持', () => {
  let scrollEl: HTMLElement;
  let listEl: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    scrollEl = document.createElement('div');
    listEl = document.createElement('div');
    scrollEl.appendChild(listEl);
    document.body.appendChild(scrollEl);
  });

  it('复用节点时焦点天然不丢 —— 这是增量重绘相对整体重建的核心收益', () => {
    const rowEl = row('#a');
    const input = document.createElement('input');
    input.type = 'text';
    rowEl.appendChild(input);
    listEl.appendChild(rowEl);
    input.focus();
    expect(document.activeElement).toBe(input);

    const preserved = capturePreservedState(scrollEl, listEl);
    reconcileOrder(listEl, [rowEl]); // 整棵复用：节点始终留在文档内
    restorePreservedState(scrollEl, listEl, preserved);

    expect(document.activeElement).toBe(input); // 仍是原来那个输入框
  });

  it('焦点所在节点被替换时按位置找回', () => {
    const rowEl = row('#a');
    const input = document.createElement('input');
    input.type = 'text';
    rowEl.appendChild(input);
    listEl.appendChild(rowEl);
    input.focus();

    const preserved = capturePreservedState(scrollEl, listEl);

    // 模拟该行签名变化被整行重建
    const rebuilt = row('#a');
    const freshInput = document.createElement('input');
    freshInput.type = 'text';
    rebuilt.appendChild(freshInput);
    reconcileOrder(listEl, [rebuilt]);
    restorePreservedState(scrollEl, listEl, preserved);

    expect(document.activeElement).toBe(freshInput); // 找回到同位置的新输入框
  });

  it('恢复文本选区', () => {
    const input = document.createElement('input');
    input.type = 'text';
    input.value = '读书笔记';
    const rowEl = row('#a');
    rowEl.appendChild(input);
    listEl.appendChild(rowEl);
    input.focus();
    input.setSelectionRange(1, 3);

    const preserved = capturePreservedState(scrollEl, listEl);
    expect(preserved.selection).toEqual({ start: 1, end: 3 });

    const rebuilt = row('#a');
    const freshInput = document.createElement('input');
    freshInput.type = 'text';
    freshInput.value = '读书笔记';
    rebuilt.appendChild(freshInput);
    reconcileOrder(listEl, [rebuilt]);
    restorePreservedState(scrollEl, listEl, preserved);

    expect(freshInput.selectionStart).toBe(1);
    expect(freshInput.selectionEnd).toBe(3);
  });

  it('保持滚动位置', () => {
    Object.defineProperty(scrollEl, 'scrollTop', { value: 240, writable: true });
    const preserved = capturePreservedState(scrollEl, listEl);
    scrollEl.scrollTop = 0;
    restorePreservedState(scrollEl, listEl, preserved);
    expect(scrollEl.scrollTop).toBe(240);
  });

  it('焦点不在列表内时不干预', () => {
    const outside = document.createElement('input');
    document.body.appendChild(outside);
    outside.focus();

    const preserved = capturePreservedState(scrollEl, listEl);
    expect(preserved.focusPath).toBeNull();

    restorePreservedState(scrollEl, listEl, preserved);
    expect(document.activeElement).toBe(outside);
  });
});

describe('标签行签名', () => {
  const base = {
    tag: '#读书',
    displayName: '读书',
    isVirtual: false,
    files: [{ path: 'a.md' }, { path: 'b.md' }],
    exactCount: 2,
    inheritedCount: 0,
    hasInheritance: false,
    hasActiveInheritance: false,
    fixedSearchTags: [],
  };
  const context = {
    expanded: false,
    pinned: false,
    targetPath: '',
    relationVersion: 0,
  };

  it('相同输入得到相同签名', () => {
    expect(tagRowSignature(base, context)).toBe(tagRowSignature({ ...base }, { ...context }));
  });

  it.each([
    ['显示名', { displayName: '读书笔记' }, {}],
    ['笔记数量', { files: [{ path: 'a.md' }] }, {}],
    ['精确计数', { exactCount: 3 }, {}],
    ['继承计数', { inheritedCount: 5 }, {}],
    ['生效的继承分支', { hasActiveInheritance: true }, {}],
    ['固定子标签命中', { fixedSearchTags: ['#升温'] }, {}],
    ['虚拟标签标记', { isVirtual: true }, {}],
  ])('%s 变化会改变签名', (_label, itemPatch, contextPatch) => {
    expect(tagRowSignature({ ...base, ...itemPatch }, { ...context, ...contextPatch }))
      .not.toBe(tagRowSignature(base, context));
  });

  it.each([
    ['展开态', { expanded: true }],
    ['置顶态', { pinned: true }],
    ['定位目标', { targetPath: 'a.md' }],
    ['关系结构版本', { relationVersion: 1 }],
  ])('%s 变化会改变签名', (_label, contextPatch) => {
    expect(tagRowSignature(base, { ...context, ...contextPatch }))
      .not.toBe(tagRowSignature(base, context));
  });

  it('折叠时笔记路径不参与签名 —— 省去大量字符串拼接', () => {
    const other = { ...base, files: [{ path: 'x.md' }, { path: 'y.md' }] };
    expect(tagRowSignature(other, context)).toBe(tagRowSignature(base, context));
  });

  it('展开时笔记路径参与签名', () => {
    const expanded = { ...context, expanded: true };
    const other = { ...base, files: [{ path: 'x.md' }, { path: 'y.md' }] };
    expect(tagRowSignature(other, expanded)).not.toBe(tagRowSignature(base, expanded));
  });

  it('不使用 JSON 序列化，签名是紧凑分隔串', () => {
    const signature = tagRowSignature(base, context);
    expect(signature).not.toContain('{');
    expect(signature).not.toContain('"');
    expect(signature.includes('\x1f')).toBe(true);
  });
});

// 移除笔记标签后侧边栏不实时反馈的回归网。
//
// 症状：删掉某篇笔记的标签后，必须把标签折叠再展开才看到卡片消失。
// 根因是签名覆盖不全 —— 折叠态刻意丢弃路径列表（性能优化），
// 而继承分组内部的结构变化又只有交集组进签名。browseSignature 由
// computeTagBrowseData 预先算好，长度可控，因此折叠时也能参与。
describe('标签行签名 · 移除笔记的实时反馈', () => {
  const base = {
    tag: '#读书',
    displayName: '读书',
    isVirtual: false,
    files: [{ path: 'a.md' }, { path: 'b.md' }],
    exactCount: 2,
    inheritedCount: 0,
    hasInheritance: false,
    hasActiveInheritance: false,
    fixedSearchTags: [],
    browseSignature: '#读书:a.md|b.md',
  };
  const collapsed = { expanded: false, pinned: false, targetPath: '', relationVersion: 0 };
  const expanded = { ...collapsed, expanded: true };

  it('展开态下移除一篇笔记会改变签名', () => {
    const after = { ...base, files: [{ path: 'a.md' }], exactCount: 1, browseSignature: '#读书:a.md' };
    expect(tagRowSignature(after, expanded)).not.toBe(tagRowSignature(base, expanded));
  });

  it('折叠态下移除一篇笔记同样改变签名 —— 此前只有展开时才带路径，折叠行会被原样复用', () => {
    const after = { ...base, files: [{ path: 'a.md' }], exactCount: 1, browseSignature: '#读书:a.md' };
    expect(tagRowSignature(after, collapsed)).not.toBe(tagRowSignature(base, collapsed));
  });

  it('笔记总数不变但成员换了人，折叠态也能识别', () => {
    // 例如一篇笔记被移出该标签、同时另一篇被移入：length 与各项计数都不变
    const after = { ...base, browseSignature: '#读书:a.md|c.md' };
    expect(tagRowSignature(after, collapsed)).not.toBe(tagRowSignature(base, collapsed));
  });

  it('继承来源的分组内容变化会改变父标签的签名', () => {
    // 父标签自身的 files/计数不变，只是子标签分组里少了一篇
    const parent = {
      ...base,
      hasActiveInheritance: true,
      browseSignature: '#爱情>#升温:x.md|y.md',
    };
    const after = { ...parent, browseSignature: '#爱情>#升温:x.md' };
    expect(tagRowSignature(after, expanded)).not.toBe(tagRowSignature(parent, expanded));
    expect(tagRowSignature(after, collapsed)).not.toBe(tagRowSignature(parent, collapsed));
  });

  it('browseSignature 缺失时不报错，退回原有判据', () => {
    const withoutSignature = { ...base, browseSignature: undefined };
    expect(() => tagRowSignature(withoutSignature, collapsed)).not.toThrow();
    expect(tagRowSignature(withoutSignature, collapsed))
      .toBe(tagRowSignature({ ...withoutSignature }, collapsed));
  });

  it('仍不使用 JSON 序列化', () => {
    const signature = tagRowSignature(base, expanded);
    expect(signature).not.toContain('{');
    expect(signature).not.toContain('"');
  });
});
