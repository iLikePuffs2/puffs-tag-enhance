import { PluginSettingTab, Setting } from "obsidian";
import {
  DEFAULT_MOVE_NOTE_DOWN_HOTKEY,
  DEFAULT_MOVE_NOTE_UP_HOTKEY,
  DEFAULT_QUICK_SEARCH_HOTKEY,
  DEFAULT_NOTE_HIERARCHY_SEARCH_KEYWORD,
  DEFAULT_SCROLL_TOP_BUTTON_THRESHOLD
} from "./models";
import {
  getSidebarToolbarButtonLabel,
  moveSidebarToolbarButton,
  normalizeSidebarToolbarButtons,
} from "./sidebar-toolbar";

class PuffsTagEnhanceSettingTab extends PluginSettingTab {
  plugin: any;
  constructor(app: any, plugin: any) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('自动切到大纲标签页')
      .setDesc('开启后，插件会按当前笔记的侧边栏偏好在标签列表和大纲之间自动切换')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.autoSwitchToOutlineEnabled)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ autoSwitchToOutlineEnabled: value });
          });
      });

    new Setting(containerEl)
      .setName('输入法组合期间保持搜索结果')
      .setDesc('开启后，使用中文输入法输入拼音时保持上一次搜索结果，确认候选字后再刷新')
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.freezeSearchWhileComposing)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ freezeSearchWhileComposing: value });
          });
      });

    new Setting(containerEl)
      .setName('默认打开标签面板的文件夹')
      .setDesc('相对 vault 的路径，一行一个，含子文件夹')
      .addTextArea((text) => {
        text
          .setValue((this.plugin.settings.tagSidebarDefaultFolders || []).join('\n'))
          .setPlaceholder('小说/情节')
          .onChange(async (value) => {
            autoGrow();
            await this.plugin.updateSettings({ tagSidebarDefaultFolders: value });
          });
        // 弹性高度：单行时与相邻的普通输入框等高等宽，多行时才向下伸展。
        // textarea 的默认尺寸由 cols/rows 决定，与主题给 input 的宽度不一致，
        // 因此这里量一个同栏的普通输入框作为基准，把宽高对齐过去。
        const inputEl = text.inputEl;
        const measureSiblingInput = () => {
          const probe = containerEl.querySelector(
            '.setting-item-control input[type="text"]'
          ) as HTMLInputElement | null;
          return { width: probe?.offsetWidth || 0, height: probe?.offsetHeight || 30 };
        };
        const autoGrow = () => {
          const base = measureSiblingInput();
          if (base.width) inputEl.style.width = `${base.width}px`;

          // 先还原自然行高再测量，否则上一轮撑高过的行高会污染 scrollHeight
          inputEl.style.lineHeight = '';
          inputEl.style.height = 'auto';
          const style = getComputedStyle(inputEl);
          // scrollHeight 不含边框，border-box 下要补回来，否则每次测量都少 2px
          const borderHeight = inputEl.offsetHeight - inputEl.clientHeight;
          const isSingleLine = inputEl.scrollHeight + borderHeight <= base.height;

          // 单行时把行高撑满内容区，文字才像 input 那样垂直居中 ——
          // textarea 的行高是固定值（约 16.9px），比 20px 的内容区矮，
          // 差出的约 3px 全落在文字下方，看起来就是偏上。
          // 换行后交还自然行高，否则各行之间会被拉开。
          if (isSingleLine) {
            const verticalPadding =
              parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
            inputEl.style.lineHeight = `${base.height - borderHeight - verticalPadding}px`;
            inputEl.style.height = 'auto';
          }
          inputEl.style.height = `${Math.max(base.height, inputEl.scrollHeight + borderHeight)}px`;
        };
        inputEl.rows = 1;
        inputEl.style.resize = 'none';
        inputEl.style.overflowY = 'hidden';
        // 面板首次渲染时 textarea 还没进文档、scrollHeight 为 0，排到下一个宏任务再量
        window.setTimeout(autoGrow, 0);
      });

    const keywordDescription = '固定语法：=；==（当前笔记关系）；=父笔记；==子笔记；=父笔记*子笔记';
    new Setting(containerEl)
      .setName('父子笔记搜索关键字')
      .setDesc(keywordDescription)
      .addText((text) => {
        text
          .setValue(DEFAULT_NOTE_HIERARCHY_SEARCH_KEYWORD)
          .setPlaceholder(DEFAULT_NOTE_HIERARCHY_SEARCH_KEYWORD)
          .setDisabled(true);
      });

    new Setting(containerEl)
      .setName('弹出/收起搜索栏快捷键')
      .addText((text) => {
        text
          .setValue(this.plugin.getQuickSearchHotkeyDisplay())
          .setPlaceholder(DEFAULT_QUICK_SEARCH_HOTKEY)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ toggleSearchHotkey: value });
          });
      });

    new Setting(containerEl)
      .setName('选中项上移快捷键')
      .setDesc('选中笔记或子标签的排序按钮后，使用该快捷键将当前项上移一格')
      .addText((text) => {
        text
          .setValue(this.plugin.getMoveNoteUpHotkeyDisplay())
          .setPlaceholder(DEFAULT_MOVE_NOTE_UP_HOTKEY)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ moveNoteUpHotkey: value });
          });
      });

    new Setting(containerEl)
      .setName('选中项下移快捷键')
      .setDesc('选中笔记或子标签的排序按钮后，使用该快捷键将当前项下移一格')
      .addText((text) => {
        text
          .setValue(this.plugin.getMoveNoteDownHotkeyDisplay())
          .setPlaceholder(DEFAULT_MOVE_NOTE_DOWN_HOTKEY)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ moveNoteDownHotkey: value });
          });
      });

    new Setting(containerEl)
      .setName('新笔记卡片位置')
      .setDesc('只决定之后新加入标签的笔记卡片位置，不会重排现有卡片')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('end', '放在最后')
          .addOption('start', '放在最前')
          .setValue(this.plugin.settings.newNotePosition)
          .onChange(async (value) => {
            await this.plugin.updateSettings({ newNotePosition: value });
          });
      });

    new Setting(containerEl)
      .setName('备份间隔')
      .setDesc('按分钟定时备份插件数据；输入 0 停止备份')
      .addText((text) => {
        text
          .setValue(String(this.plugin.settings.backupIntervalMinutes))
          .setPlaceholder('0')
          .onChange(async (value) => {
            await this.plugin.updateSettings({ backupIntervalMinutes: value });
          });
        text.inputEl.type = 'number';
        text.inputEl.min = '0';
        text.inputEl.step = '1';
      });

    new Setting(containerEl)
      .setName('备份路径')
      .setDesc('Vault 内的相对路径；可输入文件夹，也可输入包含文件名的完整路径，支持 \\ 或 /')
      .addText((text) => {
        text
          .setValue(this.plugin.settings.backupFolderPath)
          .setPlaceholder('其他\\备份\\tag-data.md')
          .onChange(async (value) => {
            await this.plugin.updateSettings({ backupFolderPath: value });
          });
      });

    new Setting(containerEl)
      .setName('回顶/回底按钮显示阈值')
      .setDesc('标签、继承分组、交集组展开后的笔记数达到该值时显示回顶与回底按钮；输入 0 不显示')
      .addText((text) => {
        text
          .setValue(String(this.plugin.settings.scrollTopButtonThreshold))
          .setPlaceholder(String(DEFAULT_SCROLL_TOP_BUTTON_THRESHOLD))
          .onChange(async (value) => {
            await this.plugin.updateSettings({ scrollTopButtonThreshold: value });
          });
        text.inputEl.type = 'number';
        text.inputEl.min = '0';
        text.inputEl.step = '1';
      });

    containerEl.createEl('h3', { text: '侧边栏顶栏按钮' });
    const toolbarButtons = normalizeSidebarToolbarButtons(this.plugin.settings.sidebarToolbarButtons);
    toolbarButtons.forEach((buttonSetting, index) => {
      const setting = new Setting(containerEl)
        .setName(getSidebarToolbarButtonLabel(buttonSetting.id))
        .addToggle((toggle) => {
          toggle.setValue(buttonSetting.visible).onChange(async (visible) => {
            const nextButtons = normalizeSidebarToolbarButtons(this.plugin.settings.sidebarToolbarButtons)
              .map((item) => item.id === buttonSetting.id ? { ...item, visible } : item);
            await this.plugin.updateSettings({ sidebarToolbarButtons: nextButtons });
          });
        });
      setting.addExtraButton((button) => {
        button
          .setIcon('arrow-up')
          .setTooltip('上移')
          .setDisabled(index === 0)
          .onClick(async () => {
            await this.plugin.updateSettings({
              sidebarToolbarButtons: moveSidebarToolbarButton(
                this.plugin.settings.sidebarToolbarButtons,
                buttonSetting.id,
                -1
              ),
            });
            this.display();
          });
      });
      setting.addExtraButton((button) => {
        button
          .setIcon('arrow-down')
          .setTooltip('下移')
          .setDisabled(index === toolbarButtons.length - 1)
          .onClick(async () => {
            await this.plugin.updateSettings({
              sidebarToolbarButtons: moveSidebarToolbarButton(
                this.plugin.settings.sidebarToolbarButtons,
                buttonSetting.id,
                1
              ),
            });
            this.display();
          });
      });
    });
  }
}

export { PuffsTagEnhanceSettingTab };
