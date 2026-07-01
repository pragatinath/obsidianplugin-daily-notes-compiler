import {
	App,
	Modal,
	Notice,
	Plugin,
	TFile,
	TFolder,
} from 'obsidian';
import {
	DEFAULT_SETTINGS,
	NotesCompilerPluginSettings,
	NotesCompilerSettingTab,
} from './settings';

export default class NotesCompilerPlugin extends Plugin {
	settings!: NotesCompilerPluginSettings;

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon('rows-4', 'Compile daily notes', (_evt: MouseEvent) => {
			new DateRangeCompileModal(this.app, this).open();
		});

		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Daily notes');

		this.addCommand({
			id: 'open-compile-modal',
			name: 'Compile daily notes',
			callback: () => {
				new DateRangeCompileModal(this.app, this).open();
			},
		});

		this.addSettingTab(new NotesCompilerSettingTab(this.app, this));
	}

	onunload() { }

	async loadSettings() {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			(await this.loadData()) as Partial<NotesCompilerPluginSettings>,
		);
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}

	async compileNotesInRange(startDate: string, endDate: string) {
		const targetFolder = this.getTargetFolder();
		if (!targetFolder) {
			new Notice('Select a daily notes folder in settings first.');
			return;
		}

		const notes = this.app.vault
			.getMarkdownFiles()
			.filter((file) => this.isCandidateFile(file, targetFolder))
			.filter((file) => this.isDateFilename(file.basename))
			.filter((file) => this.isDateInRange(file.basename, startDate, endDate))
			.sort((a, b) => a.basename.localeCompare(b.basename));

		if (notes.length === 0) {
			new Notice('No notes were found for the selected date range.');
			return;
		}

		const compiledParts: string[] = [];
		for (const note of notes) {
			const content = await this.app.vault.cachedRead(note);
			const cleaned = this.removeEmptyLines(content);
			if (cleaned) {
				compiledParts.push(cleaned);
			}
		}

		if (compiledParts.length === 0) {
			new Notice('No content was found in the selected notes.');
			return;
		}

		const compiledContent = compiledParts.join('\n\n');
		const outputName = `compiled-${startDate}-to-${endDate}.md`;
		const outputFolder = this.getOutputFolder(targetFolder);
		const outputPath = outputFolder.path
			? `${outputFolder.path}/${outputName}`
			: outputName;

		const existingFile = this.app.vault.getAbstractFileByPath(outputPath);
		if (existingFile instanceof TFile) {
			await this.app.vault.modify(existingFile, compiledContent);
		} else {
			await this.app.vault.create(outputPath, compiledContent);
		}

		const createdFile = this.app.vault.getAbstractFileByPath(outputPath);
		if (createdFile instanceof TFile) {
			new Notice(`Compiled ${notes.length} notes into ${outputName}`);
			await this.app.workspace.getLeaf().openFile(createdFile);
		}
	}

	private getTargetFolder(): TFolder | null {
		const folderPath = this.settings.dailyNotesFolder?.trim() ?? '';
		if (!folderPath) {
			return this.app.vault.getRoot();
		}

		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		return folder instanceof TFolder ? folder : null;
	}

	private getOutputFolder(sourceFolder: TFolder): TFolder {
		const folderPath = this.settings.compiledOutputFolder?.trim() ?? '';
		if (!folderPath) {
			return sourceFolder;
		}

		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		return folder instanceof TFolder ? folder : sourceFolder;
	}

	private isCandidateFile(file: TFile, folder: TFolder): boolean {
		const folderPath = folder.path ? `${folder.path}/` : '';
		return folder.path ? file.path.startsWith(folderPath) : true;
	}

	private isDateFilename(value: string): boolean {
		return /^\d{4}-\d{2}-\d{2}$/.test(value);
	}

	private parseDate(value: string): Date {
		const [yearText, monthText, dayText] = value.split('-');
		if (!yearText || !monthText || !dayText) {
			return new Date(NaN);
		}

		const year = Number(yearText);
		const month = Number(monthText);
		const day = Number(dayText);
		if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) {
			return new Date(NaN);
		}

		return new Date(year, month - 1, day);
	}

	private isDateInRange(value: string, startDate: string, endDate: string): boolean {
		const candidate = this.parseDate(value);
		const start = this.parseDate(startDate);
		const end = this.parseDate(endDate);
		return candidate >= start && candidate <= end;
	}

	private removeEmptyLines(content: string): string {
		return content
			.split(/\r?\n/)
			.filter((line) => line.trim() !== '')
			.join('\n');
	}
}

class DateRangeCompileModal extends Modal {
	private plugin: NotesCompilerPlugin;

	constructor(app: App, plugin: NotesCompilerPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('daily-notes-compile-modal');

		contentEl.createEl('h2', { text: 'Compile daily notes' });
		contentEl.createEl('p', {
			text: `Source folder: ${this.plugin.settings.dailyNotesFolder || 'Root'}`,
		});

		const presetsEl = contentEl.createDiv({ cls: 'daily-notes-card' });
		presetsEl.createEl('strong', { text: 'Quick ranges' });
		const presetButtons = presetsEl.createDiv({ cls: 'daily-notes-preset-row' });
		this.createPresetButton(presetButtons, 'Last week', () => {
			this.applyPreset('week');
		});
		this.createPresetButton(presetButtons, 'Last month', () => {
			this.applyPreset('month');
		});

		const formEl = contentEl.createDiv({ cls: 'daily-notes-card' });
		formEl.createEl('strong', { text: 'Date range' });
		const dateFields = formEl.createDiv({ cls: 'daily-notes-date-grid' });

		const startField = dateFields.createDiv({ cls: 'daily-notes-field' });
		startField.createEl('label', { text: 'Start date' });
		const startInput = startField.createEl('input', { type: 'date' });

		const endField = dateFields.createDiv({ cls: 'daily-notes-field' });
		endField.createEl('label', { text: 'End date' });
		const endInput = endField.createEl('input', { type: 'date' });

		const today = new Date();
		const lastWeekStart = new Date(today);
		lastWeekStart.setDate(today.getDate() - 7);
		startInput.value = this.formatDate(lastWeekStart);
		endInput.value = this.formatDate(today);

		const buttonRow = contentEl.createDiv({ cls: 'daily-notes-actions' });
		const compileButton = buttonRow.createEl('button', { text: 'Compile' });
		compileButton.addEventListener('click', () => {
			const startValue = startInput.value;
			const endValue = endInput.value;
			if (!startValue || !endValue) {
				new Notice('Please choose both dates.');
				return;
			}

			const start = this.plugin['parseDate'](startValue);
			const end = this.plugin['parseDate'](endValue);
			if (start > end) {
				new Notice('Start date must be before the end date.');
				return;
			}

			this.close();
			// Fire-and-forget the async operation safely
			(async () => {
				try {
					await this.plugin.compileNotesInRange(startValue, endValue);
				} catch (error) {
					console.error("Failed to compile notes:", error);
					new Notice("An error occurred during compilation.");
				}
			})().catch(console.error);
		});
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	private createPresetButton(
		container: HTMLElement,
		label: string,
		handler: () => void,
	) {
		const button = container.createEl('button', { text: label });
		button.type = 'button';
		button.addEventListener('click', handler);
	}

	private applyPreset(range: 'week' | 'month') {
		const today = new Date();
		let startDate = new Date(today);
		let endDate = new Date(today);

		if (range === 'week') {
			startDate.setDate(today.getDate() - 7);
		} else {
			startDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
			endDate = new Date(today.getFullYear(), today.getMonth(), 0);
		}

		const startInput = this.contentEl.querySelector('input[type="date"]') as HTMLInputElement;
		const endInput = this.contentEl.querySelectorAll('input[type="date"]')[1] as HTMLInputElement;
		if (startInput) {
			startInput.value = this.formatDate(startDate);
		}
		if (endInput) {
			endInput.value = this.formatDate(endDate);
		}
	}

	private formatDate(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}
}
