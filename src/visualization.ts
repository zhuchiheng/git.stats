import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import { AuthorStats, GitContributionAnalyzer, ContributionResult, FileChangeStats, OwnershipEntry } from './gitAnalyzer';
import moment from 'moment';
import { SimpleGit } from 'simple-git';

interface ChartData {
    labels: string[];
    datasets: {
        label: string;
        data: number[];
        borderColor?: string;
        backgroundColor?: string | string[];
        fill?: boolean;
        tension?: number;
        cubicInterpolationMode?: string;
        stack?: string;
    }[];
}

interface CalendarDay {
    date: string;
    totalCommits: number;
    colorIntensity: number;
}

interface AuthorStatRow {
    author: string;
    totalCommits: number;
    totalInsertions: number;
    totalDeletions: number;
    totalFiles: number;
    currentStreak: number;
    longestStreak: number;
}

export class ContributionVisualization {
    private panel: vscode.WebviewPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    private webview: vscode.Webview | undefined;
    private gitRepos: {path: string, git: SimpleGit}[] = [];
    private currentRepoIndex: number = 0;
    private analyzer: GitContributionAnalyzer;
    private globalCache: { [author: string]: AuthorStats } = {};
    private selectedDeveloper: string = 'all';
    private fileStatsCache: FileChangeStats[] = [];
    private ownershipCache: OwnershipEntry[] = [];
    private wordFreqCache: { [word: string]: number } = {};
    private commitDetailsCache: { [date: string]: { t: string; a: string; m: string }[] } = {};
    private heatmapDetailsCache: { [dayHour: string]: { d: string; t: string; a: string; m: string }[] } = {};
    private autoRangeActive: boolean = true;
    private selectedBranch: string = '--all';
    private branchList: string[] = [];
    private lastRangeDays: number = 0;
    private lastRangeStart?: string;
    private lastRangeEnd?: string;

    constructor(
        private context: vscode.ExtensionContext,
        private analyzers: GitContributionAnalyzer[],
        gitRepos: {path: string, git: SimpleGit}[]
    ) {
        this.gitRepos = gitRepos;
        this.analyzer = analyzers[0];
    }

    public dispose() {
        this.panel?.dispose();
        this.disposables.forEach(d => d.dispose());
    }

    public async update(stats: { [author: string]: AuthorStats }) {
        if (!this.panel) {
            return;
        }
        await this.updateVisualization(stats);
    }

    public async updateStats(stats: { [author: string]: AuthorStats }) {
        if (!this.panel) {
            return;
        }

        const authors = Object.values(stats);
        const dates = this.getAllDates(stats);
        const hours = this.getHoursArray();

        const commitData = this.prepareCommitData(authors, dates);
        const changeData = this.prepareChangeData(authors, dates);
        const hourlyCommitData = this.prepareHourlyCommitData(authors, hours);
        const hourlyChangeData = this.prepareHourlyChangeData(authors, hours);

        const weeklyHourlyData = this.prepareWeeklyHourlyData(authors);
        const weeklyHourlyGrid = weeklyHourlyData.grid;
        const weeklyHourlyMax = weeklyHourlyData.max;
        const dirOwnership = this.prepareDirectoryOwnership(this.ownershipCache);

        if (this.panel?.webview) {
            this.panel.webview.postMessage({
                command: 'updateData',
                commitData,
                changeData,
                hourlyCommitData,
                hourlyChangeData,
                fileStats: this.fileStatsCache,
                ownership: this.ownershipCache,
                dirOwnership,
                weeklyHourlyGrid,
                weeklyHourlyMax,
                wordFreq: this.wordFreqCache,
                commitDetails: this.commitDetailsCache,
                heatmapDetails: this.heatmapDetailsCache,
                isAuto: this.autoRangeActive,
                startDateVal: authors.length > 0 ? authors[0].startDate.format('YYYY-MM-DD') : '',
                endDateVal: authors.length > 0 ? authors[0].endDate.format('YYYY-MM-DD') : ''
            });
        }
    }

    private async updateVisualization(stats: { [author: string]: AuthorStats }) {
        if (!this.panel) {
            return;
        }

        const authors = Object.values(stats);
        const dates = this.getAllDates(stats);
        const hours = this.getHoursArray();

        const commitData = this.prepareCommitData(authors, dates);
        const changeData = this.prepareChangeData(authors, dates);
        const hourlyCommitData = this.prepareHourlyCommitData(authors, hours);
        const hourlyChangeData = this.prepareHourlyChangeData(authors, hours);
        const calendarData = this.prepareCalendarData(authors, dates);

        const weeklyHourlyData = this.prepareWeeklyHourlyData(authors);
        const weeklyHourlyGrid = weeklyHourlyData.grid;
        const weeklyHourlyMax = weeklyHourlyData.max;

        const authorStats: AuthorStatRow[] = authors.map(author => ({
            author: author.author,
            totalCommits: author.totalCommits || 0,
            totalInsertions: author.totalInsertions || 0,
            totalDeletions: author.totalDeletions || 0,
            totalFiles: author.totalFiles || 0,
            currentStreak: author.currentStreak || 0,
            longestStreak: author.longestStreak || 0
        }));

        const dirOwnership = this.prepareDirectoryOwnership(this.ownershipCache);

        if (this.panel) {
            await this.panel.webview.postMessage({
                command: 'updateData',
                commitData: commitData,
                changeData: changeData,
                hourlyCommitData: hourlyCommitData,
                hourlyChangeData: hourlyChangeData,
                authorStats: authorStats,
                calendarData,
                fileStats: this.fileStatsCache,
                ownership: this.ownershipCache,
                dirOwnership,
                weeklyHourlyGrid,
                weeklyHourlyMax,
                wordFreq: this.wordFreqCache,
                commitDetails: this.commitDetailsCache,
                heatmapDetails: this.heatmapDetailsCache,
                isAuto: this.autoRangeActive,
                startDateVal: authors.length > 0 ? authors[0].startDate.format('YYYY-MM-DD') : '',
                endDateVal: authors.length > 0 ? authors[0].endDate.format('YYYY-MM-DD') : ''
            });
        }
    }

    public async handleTimeRangeChange(days: number, startDate?: string, endDate?: string) {
        try {
            this.autoRangeActive = (days === 0);
            this.lastRangeDays = days;
            this.lastRangeStart = startDate;
            this.lastRangeEnd = endDate;
            this.analyzer = this.analyzers[this.currentRepoIndex];

            const result = await this.analyzer.getContributionStats(days, startDate, endDate, undefined, undefined, this.selectedBranch);
            this.globalCache = result.authorStats;
            this.fileStatsCache = result.fileStats;
            this.ownershipCache = result.ownership;
            this.wordFreqCache = result.wordFreq || {};
            this.commitDetailsCache = result.commitDetails || {};
            this.heatmapDetailsCache = result.heatmapDetails || {};

            if (this.panel?.webview) {
                const authors = Object.keys(this.globalCache).filter(a => !a.toLowerCase().includes('stash'));
                this.panel.webview.postMessage({
                    command: 'updateDevelopers',
                    developers: authors
                });
            }

            await this.applyDeveloperFilter(this.selectedDeveloper);
        } catch (error) {
            console.error('Error updating time range:', error);
        }
    }

    private async loadBranches() {
        try {
            const repoPath = this.gitRepos[this.currentRepoIndex]?.path;
            const branches = await this.analyzers[this.currentRepoIndex].getBranches(repoPath);
            this.branchList = branches;
            if (this.panel?.webview) {
                this.panel.webview.postMessage({ command: 'updateBranches', branches });
            }
        } catch { }
    }

    private async applyDeveloperFilter(developer?: string) {
        try {
            const filteredStats = developer && developer !== 'all'
                ? { [developer]: this.globalCache[developer] }
                : this.globalCache;

            await this.update(filteredStats);
        } catch (error) {
            console.error('Error applying developer filter:', error);
        }
    }

    public async show(result: ContributionResult) {
        this.globalCache = result.authorStats;
        this.fileStatsCache = result.fileStats;
        this.ownershipCache = result.ownership;
            this.wordFreqCache = result.wordFreq || {};
            this.commitDetailsCache = result.commitDetails || {};
            this.heatmapDetailsCache = result.heatmapDetails || {};

            if (this.panel) {
            this.webview = this.panel.webview;
            this.panel.reveal();

            const authors = Object.keys(result.authorStats);
            this.panel.webview.postMessage({
                command: 'updateDevelopers',
                developers: authors
            });
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'codeActivityStats',
                'Git Stats',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [this.context.extensionUri]
                }
            );
            this.webview = this.panel.webview;

            this.panel.onDidDispose(() => {
                this.panel = undefined;
            }, null, this.disposables);

            this.panel.webview.onDidReceiveMessage(
                async message => {
                    switch (message.command) {
                        case 'timeRangeChanged':
                            await this.handleTimeRangeChange(
                                message.days,
                                message.startDate,
                                message.endDate
                            );
                            break;
                        case 'developerChanged':
                            await this.handleDeveloperChange(
                                message.developer
                            );
                            break;
                        case 'repoChanged':
                            this.currentRepoIndex = message.repoIndex;
                            this.selectedBranch = '--all';
                            await this.loadBranches();
                            await this.handleTimeRangeChange(this.lastRangeDays, this.lastRangeStart, this.lastRangeEnd);
                            break;
                        case 'branchChanged':
                            this.selectedBranch = message.branch;
                            await this.handleTimeRangeChange(this.lastRangeDays, this.lastRangeStart, this.lastRangeEnd);
                            break;
                        case 'exportPng':
                            await this.handleExportPng(message.dataUrl, message.defaultFilename);
                            break;
                        case 'exportCsv':
                            await this.handleExportCsv(message.csvContent, message.defaultFilename);
                            break;
                    }
                },
                undefined,
                this.disposables
            );
        }

        const authors = Object.values(result.authorStats);
        const dates = this.getAllDates(result.authorStats);

        const commitData = this.prepareCommitData(authors, dates);
        const changeData = this.prepareChangeData(authors, dates);
        const hourlyCommitData = this.prepareHourlyCommitData(authors, this.getHoursArray());
        const hourlyChangeData = this.prepareHourlyChangeData(authors, this.getHoursArray());

        if (this.panel) {
            this.panel.webview.html = await this.getWebviewContent(result, commitData, changeData, hourlyCommitData, hourlyChangeData);
        }
        await this.loadBranches();
    }

    private async handleDeveloperChange(developer: string) {
        try {
            this.selectedDeveloper = developer;
            await this.applyDeveloperFilter(developer);
        } catch (error) {
            console.error('Error updating developer:', error);
        }
    }

    private async getWebviewContent(
        result: ContributionResult,
        commitData: ChartData,
        changeData: ChartData,
        hourlyCommitData: ChartData,
        hourlyChangeData: ChartData
    ): Promise<string> {
        const authors = Object.values(result.authorStats);
        const dates = this.getAllDates(result.authorStats);

        const firstAuthor = authors[0];
        const startDate = firstAuthor?.startDate.format('YYYY-MM-DD') || moment().subtract(6, 'days').format('YYYY-MM-DD');
        const endDate = firstAuthor?.endDate.format('YYYY-MM-DD') || moment().format('YYYY-MM-DD');

        const calendarData = this.prepareCalendarData(authors, dates);

        const weeklyHourlyData = this.prepareWeeklyHourlyData(authors);
        const weeklyHourlyGrid = weeklyHourlyData.grid;
        const weeklyHourlyMax = weeklyHourlyData.max;

        const dirOwnership = this.prepareDirectoryOwnership(result.ownership);

        try {
            const htmlPath = path.join(this.context.extensionPath, 'resources', 'visualization.html');
            let htmlContent = await fs.readFile(htmlPath, 'utf-8');

            const chartJsUri = this.webview!.asWebviewUri(
                vscode.Uri.joinPath(this.context!.extensionUri, 'node_modules', 'chart.js', 'dist', 'chart.umd.js')
            );

            const repoOptions = this.gitRepos.map((repo, index) =>
                `<option value="${index}">${path.basename(repo.path)}</option>`
            ).join('');

            const authorOptions = authors.map(author =>
                `<option value="${author.author}">${author.author}</option>`
            ).join('');

            const authorRows = authors.map(author => {
                const cur = author.currentStreak || 0;
                const longest = author.longestStreak || 0;
                return `
                <tr>
                    <td>${author.author}</td>
                    <td>${author.totalCommits}</td>
                    <td>${author.totalInsertions}</td>
                    <td>${author.totalDeletions}</td>
                    <td>${author.totalFiles}</td>
                    <td>${cur > 1 ? '<span class="streak-badge ' + (cur >= 7 ? 'streak-hot' : cur >= 3 ? 'streak-warm' : 'streak-cold') + '">' + cur + ' days</span>' : (cur === 1 ? '1 day' : '-')}</td>
                    <td>${longest > 1 ? '<span class="streak-badge streak-cold">' + longest + ' days</span>' : (longest === 1 ? '1 day' : '-')}</td>
                </tr>`;
            }).join('');

            htmlContent = htmlContent
                .replace('{{CHART_JS_URI}}', chartJsUri.toString())
                .replace('{{REPO_OPTIONS}}', repoOptions)
                .replace('{{AUTHOR_OPTIONS}}', authorOptions)
                .replace('{{COMMIT_DATA}}', JSON.stringify(commitData))
                .replace('{{CHANGE_DATA}}', JSON.stringify(changeData))
                .replace('{{HOURLY_COMMIT_DATA}}', JSON.stringify(hourlyCommitData))
                .replace('{{HOURLY_CHANGE_DATA}}', JSON.stringify(hourlyChangeData))
                .replace('{{START_DATE}}', startDate)
                .replace('{{END_DATE}}', endDate)
                .replace('{{AUTHOR_ROWS}}', authorRows)
                .replace('{{CALENDAR_DATA}}', JSON.stringify(calendarData))
                .replace('{{FILE_STATS}}', JSON.stringify(result.fileStats.slice(0, 100)))
                .replace('{{OWNERSHIP}}', JSON.stringify(result.ownership.slice(0, 100)))
                .replace('{{DIR_OWNERSHIP}}', JSON.stringify(dirOwnership.slice(0, 50)))
                .replace('{{WEEKLY_HOURLY_GRID}}', JSON.stringify(weeklyHourlyGrid))
                .replace('{{WEEKLY_HOURLY_MAX}}', String(weeklyHourlyMax))
                .replace('{{WORD_FREQ}}', JSON.stringify(result.wordFreq || {}))
                .replace('{{IS_AUTO}}', this.autoRangeActive ? 'true' : 'false')
                .replace('{{COMMIT_DETAILS}}', JSON.stringify(result.commitDetails || {}))
                .replace('{{HEATMAP_DETAILS}}', JSON.stringify(result.heatmapDetails || {}));

            return htmlContent;
        } catch (error) {
            console.error('Error loading visualization template:', error);
            return 'Error loading visualization content';
        }
    }

    private getAllDates(stats: { [author: string]: AuthorStats }): string[] {
        const startDate = moment(Object.values(stats)[0]?.startDate).startOf('day');
        const endDate = moment(Object.values(stats)[0]?.endDate).endOf('day');
        const dates: string[] = [];

        let currentDate = startDate.clone();
        while (currentDate.isSameOrBefore(endDate, 'day')) {
            dates.push(currentDate.format('YYYY-MM-DD'));
            currentDate.add(1, 'day');
        }

        return dates;
    }

    private getHoursArray(): string[] {
        return Array.from({length: 24}, (_, i) => i.toString().padStart(2, '0'));
    }

    private prepareCommitData(authors: AuthorStats[], dates: string[]): ChartData {
        authors = authors.filter(author =>
            !author.author.toLowerCase().includes('stash')
        );

        const datasets = authors.map((author, index) => ({
            label: author.author,
            data: dates.map(date => author.dailyStats[date]?.commits || 0),
            borderColor: this.getColor(index),
            backgroundColor: this.getColor(index),
            fill: false,
            tension: 0.4,
            cubicInterpolationMode: 'monotone' as const
        }));

        return {
            labels: dates,
            datasets
        };
    }

    private prepareChangeData(authors: AuthorStats[], dates: string[]): ChartData {
        authors = authors.filter(author =>
            !author.author.toLowerCase().includes('stash')
        );

        const datasets = authors.map((author, index) => ({
            label: author.author,
            data: dates.map(date => {
                const stats = author.dailyStats[date];
                return stats ? stats.insertions + stats.deletions : 0;
            }),
            backgroundColor: this.getColor(index),
            stack: 'combined' as const
        }));

        return {
            labels: dates,
            datasets
        };
    }

    private prepareHourlyCommitData(authors: AuthorStats[], hours: string[]): ChartData {
        return {
            labels: hours.map(h => `${h}:00`),
            datasets: authors.filter(a => !a.author.toLowerCase().includes('stash')).map((author, i) => ({
                label: author.author,
                data: hours.map(h => author.hourlyStats[h]?.commits || 0),
                borderColor: this.getColor(i),
                backgroundColor: this.getColor(i),
                fill: false,
                tension: 0.4
            }))
        };
    }

    private prepareHourlyChangeData(authors: AuthorStats[], hours: string[]): ChartData {
        return {
            labels: hours.map(h => `${h}:00`),
            datasets: authors.filter(a => !a.author.toLowerCase().includes('stash')).map((author, i) => ({
                label: author.author,
                data: hours.map(h => {
                    const s = author.hourlyStats[h];
                    return (s?.insertions || 0) + (s?.deletions || 0);
                }),
                backgroundColor: this.getColor(i),
                stack: 'combined'
            }))
        };
    }

    private prepareCalendarData(authors: AuthorStats[], dates: string[]): CalendarDay[] {
        const maxCommits = dates.reduce((max, date) => {
            const dailyCommits = authors.reduce((sum, author) => sum + (author.dailyStats[date]?.commits || 0), 0);
            return Math.max(max, dailyCommits);
        }, 1);

        return dates.map(date => {
            const totalCommits = authors.reduce((sum, author) => sum + (author.dailyStats[date]?.commits || 0), 0);
            const logValue = Math.log1p(totalCommits) / Math.log1p(maxCommits);
            return {
                date,
                totalCommits,
                colorIntensity: logValue
            };
        });
    }

    private prepareWeeklyHourlyData(authors: AuthorStats[]): { grid: number[][]; max: number } {
        const grid = Array.from({ length: 7 }, () => new Array(24).fill(0));
        let max = 1;
        for (const author of authors) {
            const wh = author.weeklyHourly;
            if (!wh) continue;
            for (let d = 0; d < 7; d++) {
                for (let h = 0; h < 24; h++) {
                    const v = wh[d]?.[h] || 0;
                    grid[d][h] += v;
                    if (grid[d][h] > max) max = grid[d][h];
                }
            }
        }
        return { grid, max };
    }

    private prepareDirectoryOwnership(ownership: OwnershipEntry[]): { directory: string; primaryAuthor: string; primaryAuthorPercentage: number; totalLines: number }[] {
        const dirMap = new Map<string, { linesByAuthor: { [author: string]: number }; totalLines: number }>();

        for (const entry of ownership) {
            const dir = entry.directory;
            if (!dirMap.has(dir)) {
                dirMap.set(dir, { linesByAuthor: {}, totalLines: 0 });
            }
            const d = dirMap.get(dir)!;
            d.totalLines += entry.totalLines;
            for (const [author, lines] of Object.entries(entry.linesByAuthor)) {
                d.linesByAuthor[author] = (d.linesByAuthor[author] || 0) + lines;
            }
        }

        return Array.from(dirMap.entries())
            .map(([dir, data]) => {
                let maxLines = 0;
                let primaryAuthor = '';
                for (const [author, lines] of Object.entries(data.linesByAuthor)) {
                    if (lines > maxLines) {
                        maxLines = lines;
                        primaryAuthor = author;
                    }
                }
                return {
                    directory: dir,
                    primaryAuthor,
                    primaryAuthorPercentage: data.totalLines > 0 ? Math.round((maxLines / data.totalLines) * 100) : 0,
                    totalLines: data.totalLines
                };
            })
            .sort((a, b) => b.totalLines - a.totalLines);
    }

    private async handleExportPng(dataUrl: string, defaultFilename: string) {
        try {
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(defaultFilename),
                filters: { 'PNG Images': ['png'] }
            });
            if (uri) {
                const base64 = dataUrl.split(',')[1];
                const buffer = Buffer.from(base64, 'base64');
                await vscode.workspace.fs.writeFile(uri, buffer);
                vscode.window.showInformationMessage(`Chart saved to ${path.basename(uri.fsPath)}`);
            }
        } catch (error) {
            console.error('Error exporting PNG:', error);
        }
    }

    private async handleExportCsv(csvContent: string, defaultFilename: string) {
        try {
            const uri = await vscode.window.showSaveDialog({
                defaultUri: vscode.Uri.file(defaultFilename),
                filters: { 'CSV Files': ['csv'] }
            });
            if (uri) {
                const buffer = Buffer.from('\uFEFF' + csvContent, 'utf-8');
                await vscode.workspace.fs.writeFile(uri, buffer);
                vscode.window.showInformationMessage(`Data saved to ${path.basename(uri.fsPath)}`);
            }
        } catch (error) {
            console.error('Error exporting CSV:', error);
        }
    }

    private getColor(index: number): string {
        const colors = [
            '#2196F3',
            '#4CAF50',
            '#F44336',
            '#FFC107',
            '#9C27B0',
            '#00BCD4',
            '#FF9800',
            '#795548',
            '#607D8B',
            '#E91E63'
        ];
        return colors[index % colors.length];
    }
}
