// 测试用的 obsidian 模块替身（通过 vitest.config.ts 的 alias 注入）。
//
// 两条原则：
// 1. 只替身被测代码真正用到的 API，宁缺毋滥 —— 凭空捏造的 mock 会给出虚假信心。
// 2. 在无 DOM 的 node 环境下必须安全降级，这样纯逻辑测试不必切到 happy-dom。

export class TAbstractFile {
  path: string;
  name: string;

  constructor(path: string) {
    this.path = path;
    this.name = path.split('/').pop() || path;
  }
}

export class TFile extends TAbstractFile {
  extension: string;
  basename: string;

  constructor(path: string) {
    super(path);
    this.extension = path.split('.').pop() || '';
    this.basename = path.split('/').pop()?.replace(/\.[^.]+$/, '') || path;
  }
}

export class TFolder extends TAbstractFile {
  children: TAbstractFile[] = [];
}

export class Modal {}

export class Notice {
  static messages: unknown[] = [];

  constructor(message: unknown) {
    Notice.messages.push(message);
  }
}

export const normalizePath = (value: string) => value;

/** 记录一次菜单项，便于断言右键菜单的构成与点击行为。 */
export type MockMenuItem = {
  title: string;
  icon: string;
  disabled: boolean;
  click: () => unknown;
};

class MenuItemBuilder {
  item: MockMenuItem = { title: '', icon: '', disabled: false, click: () => undefined };

  setTitle(title: string): this {
    this.item.title = String(title);
    return this;
  }

  setIcon(icon: string): this {
    this.item.icon = String(icon ?? '');
    return this;
  }

  setDisabled(disabled: boolean): this {
    this.item.disabled = !!disabled;
    return this;
  }

  setSection(): this {
    return this;
  }

  onClick(handler: () => unknown): this {
    this.item.click = handler;
    return this;
  }
}

export class Menu {
  /** 最近一次创建的实例，方便测试在不注入依赖的情况下取到菜单。 */
  static last: Menu | null = null;

  items: MockMenuItem[] = [];
  shownAt: unknown = null;

  constructor() {
    Menu.last = this;
  }

  addItem(callback: (item: MenuItemBuilder) => void): this {
    const builder = new MenuItemBuilder();
    callback(builder);
    this.items.push(builder.item);
    return this;
  }

  addSeparator(): this {
    return this;
  }

  showAtPosition(position: unknown): this {
    this.shownAt = position;
    return this;
  }

  showAtMouseEvent(event: unknown): this {
    this.shownAt = event;
    return this;
  }

  /** 按标题触发某一项，模拟用户点击菜单。 */
  clickItem(title: string): unknown {
    const item = this.items.find((entry) => entry.title === title);
    if (!item) throw new Error(`菜单中没有「${title}」，实际项：${this.items.map((i) => i.title).join(' / ')}`);
    return item.click();
  }
}

export class Scope {
  handlers: Array<{ modifiers: string[]; key: string; handler: (evt: unknown) => unknown }> = [];

  register(modifiers: string[], key: string, handler: (evt: unknown) => unknown) {
    const registration = { modifiers: modifiers || [], key, handler };
    this.handlers.push(registration);
    return registration;
  }

  unregister(registration: unknown) {
    this.handlers = this.handlers.filter((entry) => entry !== registration);
  }
}

export const Platform = { isMacOS: false, isDesktop: true, isMobile: false };

/**
 * 真实 setIcon 会插入 <svg class="svg-icon lucide-xxx">。
 * 这里落到真实 DOM 上，让渲染测试能断言图标；无 DOM 时静默跳过。
 */
export const setIcon = (element: unknown, iconId?: string) => {
  const el = element as { empty?: () => void; ownerDocument?: Document; appendChild?: (n: unknown) => void };
  if (!el || typeof el.ownerDocument === 'undefined' || !el.ownerDocument) return;
  const doc = el.ownerDocument;
  // 与真实行为一致：重复调用会替换已有图标
  const existing = (el as unknown as Element).querySelector?.('svg.svg-icon');
  if (existing) existing.remove();
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', `svg-icon lucide-${iconId ?? ''}`);
  (el as unknown as Element).appendChild(svg);
};

/** 与 obsidian 的 getAllTags 一致：合并正文标签与 frontmatter tags，返回带 # 前缀的数组。 */
export const getAllTags = (cache: unknown): string[] | null => {
  if (!cache || typeof cache !== 'object') return null;
  const meta = cache as { tags?: Array<{ tag?: unknown }>; frontmatter?: { tags?: unknown } };
  const result: string[] = [];
  const push = (raw: unknown) => {
    const text = String(raw ?? '').trim();
    if (!text) return;
    result.push(text.startsWith('#') ? text : `#${text}`);
  };

  if (Array.isArray(meta.tags)) {
    for (const entry of meta.tags) push(entry?.tag);
  }

  const flatten = (value: unknown) => {
    if (!value) return;
    if (Array.isArray(value)) {
      for (const item of value) flatten(item);
      return;
    }
    if (typeof value === 'string') {
      for (const part of value.split(/[\s,]+/)) push(part);
      return;
    }
    push(value);
  };
  flatten(meta.frontmatter?.tags);

  return result;
};

export class Component {
  registerEvent(): void {}
  register(): void {}
  registerDomEvent(): void {}
  addChild<T>(child: T): T {
    return child;
  }
}

/**
 * 视图基类的最小替身。
 *
 * 只提供 class extends 所需的骨架与 containerEl/contentEl/scope，不模拟 Obsidian
 * 的生命周期（onOpen/onClose 由被测代码自己定义）。无 DOM 环境下退化为空对象，
 * 这样纯逻辑测试用 Object.create(prototype) 时不受影响。
 */
export class View extends Component {
  containerEl: HTMLElement;
  contentEl: HTMLElement;
  scope = new Scope();
  app: unknown;
  leaf: unknown;

  constructor(leaf?: unknown) {
    super();
    this.leaf = leaf;
    this.app = (leaf as { app?: unknown })?.app;
    if (typeof document === 'undefined') {
      this.containerEl = {} as HTMLElement;
      this.contentEl = {} as HTMLElement;
      return;
    }
    this.containerEl = document.createElement('div');
    this.contentEl = document.createElement('div');
    this.containerEl.appendChild(this.contentEl);
  }
}

export class ItemView extends View {}

export class SearchComponent {
  containerEl: HTMLElement;
  inputEl: HTMLInputElement;
  private changeHandler: ((value: string) => void) | null = null;

  constructor(containerEl: HTMLElement) {
    const doc = containerEl.ownerDocument;
    this.containerEl = doc.createElement('div');
    this.containerEl.className = 'search-input-container';
    this.inputEl = doc.createElement('input');
    this.inputEl.type = 'search';
    this.containerEl.appendChild(this.inputEl);
    containerEl.appendChild(this.containerEl);

    this.inputEl.addEventListener('input', () => {
      this.changeHandler?.(this.inputEl.value);
    });
  }

  setValue(value: string): this {
    this.inputEl.value = value ?? '';
    return this;
  }

  getValue(): string {
    return this.inputEl.value;
  }

  setPlaceholder(placeholder: string): this {
    this.inputEl.placeholder = placeholder ?? '';
    return this;
  }

  onChange(handler: (value: string) => void): this {
    this.changeHandler = handler;
    return this;
  }

  /** 模拟用户输入，触发 onChange。 */
  typeValue(value: string): void {
    this.inputEl.value = value;
    this.inputEl.dispatchEvent(new (this.inputEl.ownerDocument.defaultView as Window & typeof globalThis).Event('input', { bubbles: true }));
  }
}

// ---------------------------------------------------------------------------
// Obsidian 给 HTMLElement / Document 加的原型扩展。
// 被测代码里 createDiv 用了 78 处、createEl 27 处、createSpan 19 处、empty 23 处，
// 不 polyfill 则渲染层完全无法测试。
// ---------------------------------------------------------------------------

type DomElementInfo = {
  cls?: string | string[];
  text?: string;
  attr?: Record<string, string | number | boolean | null>;
  title?: string;
  value?: string;
  type?: string;
  placeholder?: string;
  href?: string;
  prepend?: boolean;
  parent?: Node;
};

function applyElementInfo(el: HTMLElement, info?: DomElementInfo | string): void {
  if (!info) return;
  const options: DomElementInfo = typeof info === 'string' ? { cls: info } : info;

  if (options.cls) {
    const classes = Array.isArray(options.cls) ? options.cls : options.cls.split(/\s+/);
    for (const cls of classes) {
      if (cls) el.classList.add(cls);
    }
  }
  if (options.text !== undefined) el.textContent = String(options.text);
  if (options.title !== undefined) el.setAttribute('title', String(options.title));
  if (options.value !== undefined) (el as HTMLInputElement).value = String(options.value);
  if (options.type !== undefined) (el as HTMLInputElement).type = String(options.type);
  if (options.placeholder !== undefined) (el as HTMLInputElement).placeholder = String(options.placeholder);
  if (options.href !== undefined) el.setAttribute('href', String(options.href));
  if (options.attr) {
    for (const [key, value] of Object.entries(options.attr)) {
      if (value === null || value === false) continue;
      el.setAttribute(key, String(value));
    }
  }
}

function installDomExtensions(): void {
  if (typeof HTMLElement === 'undefined') return;

  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  const define = (name: string, value: (...args: never[]) => unknown) => {
    if (proto[name]) return; // 不覆盖已存在的实现
    Object.defineProperty(proto, name, { value, writable: true, configurable: true });
  };

  define('createEl', function (
    this: HTMLElement,
    tag: string,
    info?: DomElementInfo | string,
    callback?: (el: HTMLElement) => void
  ) {
    const el = this.ownerDocument.createElement(tag);
    applyElementInfo(el, info);
    const parent = (typeof info === 'object' && info?.parent) || this;
    if (typeof info === 'object' && info?.prepend) parent.insertBefore(el, parent.firstChild);
    else parent.appendChild(el);
    callback?.(el);
    return el;
  } as never);

  define('createDiv', function (this: HTMLElement, info?: DomElementInfo | string, callback?: (el: HTMLElement) => void) {
    return (this as unknown as { createEl: (t: string, i?: unknown, c?: unknown) => HTMLElement })
      .createEl('div', info, callback);
  } as never);

  define('createSpan', function (this: HTMLElement, info?: DomElementInfo | string, callback?: (el: HTMLElement) => void) {
    return (this as unknown as { createEl: (t: string, i?: unknown, c?: unknown) => HTMLElement })
      .createEl('span', info, callback);
  } as never);

  define('empty', function (this: HTMLElement) {
    while (this.firstChild) this.removeChild(this.firstChild);
    return this;
  } as never);

  define('detach', function (this: HTMLElement) {
    this.remove();
    return this;
  } as never);

  define('setText', function (this: HTMLElement, text: string) {
    this.textContent = String(text ?? '');
    return this;
  } as never);

  define('addClass', function (this: HTMLElement, ...classes: string[]) {
    this.classList.add(...classes.filter(Boolean));
    return this;
  } as never);

  define('removeClass', function (this: HTMLElement, ...classes: string[]) {
    this.classList.remove(...classes.filter(Boolean));
    return this;
  } as never);

  define('toggleClass', function (this: HTMLElement, classes: string | string[], value: boolean) {
    for (const cls of Array.isArray(classes) ? classes : [classes]) {
      this.classList.toggle(cls, value);
    }
    return this;
  } as never);

  define('setAttr', function (this: HTMLElement, key: string, value: string | number | boolean | null) {
    if (value === null || value === false) this.removeAttribute(key);
    else this.setAttribute(key, String(value));
    return this;
  } as never);

  define('isShown', function (this: HTMLElement) {
    return !!this.isConnected;
  } as never);

  if (typeof Document !== 'undefined') {
    const docProto = Document.prototype as unknown as Record<string, unknown>;
    if (!docProto.createDiv) {
      Object.defineProperty(docProto, 'createDiv', {
        value: function (this: Document, info?: DomElementInfo | string) {
          const el = this.createElement('div');
          applyElementInfo(el, info);
          return el;
        },
        writable: true,
        configurable: true,
      });
    }
  }
}

installDomExtensions();

/** 供 happy-dom 环境的测试在需要时手动重装扩展（例如切换了 window）。 */
export const __installDomExtensions = installDomExtensions;
