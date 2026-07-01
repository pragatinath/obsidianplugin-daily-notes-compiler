import { App, PluginSettingTab, Setting, TFolder } from 'obsidian';
import NotesCompilerPlugin from './main';

export interface NotesCompilerPluginSettings {
	mySetting: string;
	dailyNotesFolder: string;
	compiledOutputFolder: string;
}

export const DEFAULT_SETTINGS: NotesCompilerPluginSettings = {
	mySetting: 'default',
	dailyNotesFolder: '',
	compiledOutputFolder: '',
};

export class SampleSettingTab extends PluginSettingTab {
	plugin: NotesCompilerPlugin;

	constructor(app: App, plugin: NotesCompilerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		// new Setting(containerEl)
		// 	.setName('Settings #1')
		// 	.setDesc("It's a secret")
		// 	.addText((text) =>
		// 		text
		// 			.setPlaceholder('Enter your secret')
		// 			.setValue(this.plugin.settings.mySetting)
		// 			.onChange(async (value) => {
		// 				this.plugin.settings.mySetting = value;
		// 				await this.plugin.saveSettings();
		// 			}),
		// 	);

		// Get all folders in the vault for the dropdown
		const folders = this.getFolders();

		new Setting(containerEl)
			.setName('Daily Notes folder')
			.setDesc('Select the folder where daily notes are stored')
			.addDropdown((dropdown) => {
				dropdown.addOption('', 'Root (no folder)');
				folders.forEach((folder) => {
					dropdown.addOption(folder.path, folder.path);
				});
				dropdown
					.setValue(this.plugin.settings.dailyNotesFolder)
					.onChange(async (value) => {
						this.plugin.settings.dailyNotesFolder = value;
						if (!this.plugin.settings.compiledOutputFolder) {
							this.plugin.settings.compiledOutputFolder = value;
						}
						await this.plugin.saveSettings();
						// this.display();
					});
			});

		new Setting(containerEl)
			.setName('Compiled output folder')
			.setDesc('Choose where newly generated compiled files should be saved. Defaults to the daily notes folder.')
			.addDropdown((dropdown) => {
				dropdown.addOption('', 'Same as daily notes folder');
				folders.forEach((folder) => {
					dropdown.addOption(folder.path, folder.path);
				});
				dropdown
					.setValue(this.plugin.settings.compiledOutputFolder || this.plugin.settings.dailyNotesFolder)
					.onChange(async (value) => {
						this.plugin.settings.compiledOutputFolder = value;
						await this.plugin.saveSettings();
					});
			});
	}

	private getFolders(): TFolder[] {
		const folders: TFolder[] = [];
		const addFolders = (folder: TFolder) => {
			folders.push(folder);
			folder.children.forEach((child) => {
				if (child instanceof TFolder) {
					addFolders(child);
				}
			});
		};
		this.app.vault.getAllLoadedFiles().forEach((file) => {
			if (file instanceof TFolder && file.parent === null) {
				addFolders(file);
			}
		});
		return folders;
	}
}
