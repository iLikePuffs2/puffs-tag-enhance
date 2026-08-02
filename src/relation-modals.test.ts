import { describe, expect, it } from "vitest";
import {
  getDirectionalInputSide,
  getNoteRelationEnterAction,
  getNoteRelationSubmitError,
} from "./relation-modals";

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

describe('新增父子笔记弹窗 Enter 保存校验', () => {
  it('候选存在时优先选择候选，否则执行保存', () => {
    expect(getNoteRelationEnterAction({ key: 'Enter' }, false, true)).toBe('select-candidate');
    expect(getNoteRelationEnterAction({ key: 'Enter' }, false, false)).toBe('submit');
  });

  it('输入法组词、IME 处理事件和带修饰键的 Enter 均不响应', () => {
    expect(getNoteRelationEnterAction({ key: 'Enter' }, true)).toBeNull();
    expect(getNoteRelationEnterAction({ key: 'Enter', isComposing: true }, false)).toBeNull();
    expect(getNoteRelationEnterAction({ key: 'Enter', keyCode: 229 }, false)).toBeNull();
    expect(getNoteRelationEnterAction({ key: 'Enter', ctrlKey: true }, false)).toBeNull();
    expect(getNoteRelationEnterAction({ key: 'Escape' }, false)).toBeNull();
  });

  it('父级或子级未选择时返回明确提示', () => {
    expect(getNoteRelationSubmitError(0, 1)).toBe('请分别选择父笔记和子笔记');
    expect(getNoteRelationSubmitError(1, 0)).toBe('请分别选择父笔记和子笔记');
    expect(getNoteRelationSubmitError(0, 0)).toBe('请分别选择父笔记和子笔记');
  });

  it('拒绝多父对多子', () => {
    expect(getNoteRelationSubmitError(2, 2)).toBe('批量关系仅支持一父多子或多父一子');
  });

  it('允许单条、一父多子和多父一子', () => {
    expect(getNoteRelationSubmitError(1, 1)).toBe('');
    expect(getNoteRelationSubmitError(1, 3)).toBe('');
    expect(getNoteRelationSubmitError(3, 1)).toBe('');
  });
});
