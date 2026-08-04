// @ts-nocheck
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
  constructor(app, plugin) {
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
      .setName('回顶按钮显示阈值')
      .setDesc('标签的笔记卡片数量达到该值时显示回顶按钮；输入 0 不显示')
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
