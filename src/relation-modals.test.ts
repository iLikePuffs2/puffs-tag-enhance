import { describe, expect, it } from "vitest";
import { getDirectionalInputSide } from "./relation-modals";

describe('新增父子笔记弹窗输入框方向键导航', () => {
  const sides = ['parent', 'child'];

  it('向下从父笔记输入框切到子笔记输入框', () => {
    expect(getDirectionalInputSide('parent', 'ArrowDown', sides)).toBe('child');
  });

  it('向上从子笔记输入框切到父笔记输入框', () => {
    expect(getDirectionalInputSide('child', 'ArrowUp', sides)).toBe('parent');
  });

  it('到达上下边界时不循环', () => {
    expect(getDirectionalInputSide('parent', 'ArrowUp', sides)).toBeNull();
    expect(getDirectionalInputSide('child', 'ArrowDown', sides)).toBeNull();
  });

  it('只显示一个输入框时不接管原有候选导航', () => {
    expect(getDirectionalInputSide('parent', 'ArrowDown', ['parent'])).toBeNull();
    expect(getDirectionalInputSide('child', 'ArrowUp', ['child'])).toBeNull();
  });
});
