import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as path from 'path';
import * as fs from 'fs/promises';
import { AuthorStats, GitContributionAnalyzer, ContributionResult, FileChangeStats, OwnershipEntry } from './gitAnalyzer';
import moment from 'moment';
import { SimpleGit } from 'simple-git';
import { escapeHtml, formatError, mergeResults, toSafeJson } from './mergeStats';

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
    private currentRepoIndex: number | 'all' = 'all';
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
        gitRepos: {path: string, git: SimpleGit}[],
        initialBranch: string = '--all',
        branchList: string[] = []
    ) {
        this.gitRepos = gitRepos;
        this.selectedBranch = initialBranch;
        this.branchList = branchList;
    }

    public dispose() {
        this.panel?.dispose();
        this.disposables.forEach(d => d.dispose());
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
        const fc2: { [key: string]: number } = {};
        for (let _i = 0; _i < this.fileStatsCache.length; _i++) { fc2[this.fileStatsCache[_i].file] = this.fileStatsCache[_i].totalCommits; }
        const dirOwnership = this.prepareOwnershipTree(this.ownershipCache, fc2);

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

            const results = this.currentRepoIndex === 'all'
                ? await Promise.all(this.analyzers.map(analyzer =>
                    analyzer.getContributionStats(days, startDate, endDate, undefined, this.selectedBranch)
                ))
                : [await this.analyzers[this.currentRepoIndex].getContributionStats(days, startDate, endDate, undefined, this.selectedBranch)];
            const result = mergeResults(results);

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
            vscode.window.showErrorMessage('Git Stats: failed to update time range — ' + formatError(error));
        }
    }

    private async loadBranches() {
        try {
            const analyzer = this.currentRepoIndex === 'all'
                ? this.analyzers[0]
                : this.analyzers[this.currentRepoIndex];
            const branches = await analyzer.getBranches();
            this.branchList = branches;
            const hasMain = branches.includes('main');
            this.selectedBranch = hasMain ? 'main' : '--all';
            if (this.panel?.webview) {
                this.panel.webview.postMessage({ command: 'updateBranches', branches, defaultBranch: this.selectedBranch });
            }
        } catch { }
    }

    private async applyDeveloperFilter(developer?: string) {
        try {
            const filteredStats = developer && developer !== 'all'
                ? { [developer]: this.globalCache[developer] }
                : this.globalCache;

            await this.updateVisualization(filteredStats);
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
            this.panel.webview.postMessage({
                command: 'updateBranches',
                branches: this.branchList,
                defaultBranch: this.selectedBranch
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
                        case 'repoChanged': {
                            const repoKey = String(message.repoIndex);
                            this.currentRepoIndex = repoKey === 'all' ? 'all' : parseInt(repoKey, 10);
                            this.selectedBranch = '--all';
                            if (this.currentRepoIndex !== 'all') {
                                await this.loadBranches();
                            } else {
                                this.branchList = [];
                                if (this.panel?.webview) {
                                    this.panel.webview.postMessage({
                                        command: 'updateBranches',
                                        branches: [],
                                        defaultBranch: '--all'
                                    });
                                }
                            }
                            await this.handleTimeRangeChange(this.lastRangeDays, this.lastRangeStart, this.lastRangeEnd);
                            break;
                        }
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

        try {
            const htmlPath = path.join(this.context.extensionPath, 'resources', 'visualization.html');
            let htmlContent = await fs.readFile(htmlPath, 'utf-8');

            const nonce = crypto.randomBytes(16).toString('hex');
            const cspSource = this.webview!.cspSource;
            const chartJsUri = this.webview!.asWebviewUri(
                vscode.Uri.joinPath(this.context!.extensionUri, 'node_modules', 'chart.js', 'dist', 'chart.umd.js')
            );

            const repoOptions = '<option value="all">All repositories</option>' + this.gitRepos.map((repo, index) =>
                `<option value="${index}">${escapeHtml(path.basename(repo.path))}</option>`
            ).join('');

            const branchOptions = [
                `<option value="--all"${this.selectedBranch === '--all' ? ' selected' : ''}>All branches</option>`,
                ...this.branchList.map(b =>
                    `<option value="${escapeHtml(b)}"${b === this.selectedBranch ? ' selected' : ''}>${escapeHtml(b)}</option>`
                )
            ].join('');

            const authorOptions = authors.map(author =>
                `<option value="${escapeHtml(author.author)}">${escapeHtml(author.author)}</option>`
            ).join('');

            const authorRows = authors.map(author => {
                const cur = author.currentStreak || 0;
                const longest = author.longestStreak || 0;
                const curBadge = cur > 1
                    ? '<span class="streak-badge ' + (cur >= 7 ? 'streak-hot' : cur >= 3 ? 'streak-warm' : 'streak-cold') + '">' + cur + ' days</span>'
                    : (cur === 1 ? '1 day' : '-');
                const longestBadge = longest > 1
                    ? '<span class="streak-badge streak-cold">' + longest + ' days</span>'
                    : (longest === 1 ? '1 day' : '-');
                return `
                <tr>
                    <td>${escapeHtml(author.author)}</td>
                    <td>${author.totalCommits}</td>
                    <td>${author.totalInsertions}</td>
                    <td>${author.totalDeletions}</td>
                    <td>${author.totalFiles}</td>
                    <td>${curBadge}</td>
                    <td>${longestBadge}</td>
                </tr>`;
            }).join('');

            const replacements: [string | RegExp, string][] = [
                [/\{\{NONCE\}\}/g, nonce],
                [/\{\{CSP_SOURCE\}\}/g, cspSource],
                ['{{CHART_JS_URI}}', chartJsUri.toString()],
                ['{{REPO_OPTIONS}}', repoOptions],
                ['{{BRANCH_OPTIONS}}', branchOptions],
                ['{{AUTHOR_OPTIONS}}', authorOptions],
                ['{{COMMIT_DATA}}', toSafeJson(commitData)],
                ['{{CHANGE_DATA}}', toSafeJson(changeData)],
                ['{{HOURLY_COMMIT_DATA}}', toSafeJson(hourlyCommitData)],
                ['{{HOURLY_CHANGE_DATA}}', toSafeJson(hourlyChangeData)],
                [/\{\{START_DATE\}\}/g, startDate],
                [/\{\{END_DATE\}\}/g, endDate],
                ['{{AUTHOR_ROWS}}', authorRows],
                ['{{CALENDAR_DATA}}', toSafeJson(calendarData)],
                ['{{FILE_STATS}}', toSafeJson(result.fileStats.slice(0, 100))],
                ['{{OWNERSHIP}}', toSafeJson(result.ownership.slice(0, 100))],
                ['{{WEEKLY_HOURLY_GRID}}', toSafeJson(weeklyHourlyGrid)],
                ['{{WEEKLY_HOURLY_MAX}}', String(weeklyHourlyMax)],
                ['{{WORD_FREQ}}', toSafeJson(result.wordFreq || {})],
                ['{{IS_AUTO}}', this.autoRangeActive ? 'true' : 'false'],
                ['{{COMMIT_DETAILS}}', toSafeJson(result.commitDetails || {})],
                ['{{HEATMAP_DETAILS}}', toSafeJson(result.heatmapDetails || {})]
            ];

            for (const [pattern, value] of replacements) {
                // Function-form replacement: a literal value can never be
                // mangled by special `$` sequences in the substituted text.
                htmlContent = htmlContent.replace(pattern, () => value);
            }

            return htmlContent;
        } catch (error) {
            console.error('Error loading visualization template:', error);
            vscode.window.showErrorMessage('Git Stats: failed to load visualization template — ' + formatError(error));
            return '<!DOCTYPE html><html><body><h3>Git Stats</h3><p>Failed to load the visualization template. Check the developer console for details.</p></body></html>';
        }
    }

    private getAllDates(stats: { [author: string]: AuthorStats }): string[] {
        const startDate = moment(Object.values(stats)[0]?.startDate).startOf('day');
        const endDate = moment(Object.values(stats)[0]?.endDate).endOf('day');
        const dates: string[] = [];

        const currentDate = startDate.clone();
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

    private prepareOwnershipTree(ownership: OwnershipEntry[], fileCommits: { [path: string]: number }): any[] {
        // normalize paths: replace backslashes, strip drive letters
        const norm = (p: string) => p.replace(/\\/g, '/').replace(/^[A-Za-z]:\//, '');
        const rootMap = new Map<string, any>();
        const all = new Map<string, any>();
        for (const o of ownership) {
            const np = norm(o.path);
            const leaf: any = { n: np.includes('/') ? np.split('/').pop()! : np, p: np, t: 'f', l: o.totalLines, c: fileCommits[o.path] || 0, ac: Object.keys(o.linesByAuthor).length, pa: o.primaryAuthor, pp: o.primaryAuthorPercentage, lb: o.linesByAuthor, ch: [] };
            all.set(np, leaf);
        }
        const sorted = [...ownership].sort((a, b) => a.path.length - b.path.length);
        for (const o of sorted) {
            const np = norm(o.path);
            const leaf = all.get(np)!;
            if (!np.includes('/')) { rootMap.set(np, leaf); continue; }
            const parts = np.split('/');
            const dirPath = parts.slice(0, -1).join('/');
            let parent = all.get(dirPath);
            if (!parent) {
                parent = { n: dirPath.split('/').pop()!, p: dirPath, t: 'd', l: 0, c: 0, ac: 0, pa: '', pp: 0, lb: {} as any, ch: [] };
                all.set(dirPath, parent);
                const gpIdx = dirPath.lastIndexOf('/');
                if (gpIdx > 0) {
                    const gp = dirPath.substring(0, gpIdx);
                    if (gp && !all.has(gp)) {
                        all.set(gp, { n: gp.substring(gp.lastIndexOf('/') + 1), p: gp, t: 'd', l: 0, c: 0, ac: 0, pa: '', pp: 0, lb: {} as any, ch: [] });
                    }
                }
            }
            parent.ch.push(leaf);
            parent.l += leaf.l; parent.c += leaf.c;
            for (const entry of Object.entries(leaf.lb)) {
                const a = entry[0], ln = entry[1] as number;
                parent.lb[a] = (parent.lb[a] || 0) + ln;
            }
            parent.ac = Object.keys(parent.lb).length;
            let ml = 0; let mp = '';
            for (const entry of Object.entries(parent.lb)) { const a = entry[0], ln = entry[1] as number; if (ln > ml) { ml = ln; mp = a; } }
            parent.pa = mp; parent.pp = parent.l > 0 ? Math.round(ml / parent.l * 100) : 0;
        }
        for (const entry of all) {
            const n = entry[1];
            if (n.t === 'd') {
                const toRemove: number[] = [];
                for (let i = 0; i < n.ch.length; i++) {
                    const m = n.ch[i];
                    const mNorm = norm(m.p);
                    if (all.has(mNorm) && all.get(mNorm) !== m) {
                        const parentOfM = all.get(mNorm);
                        if (parentOfM && parentOfM.t === 'd') {
                            const mp = mNorm;
                            const hasDC = ownership.some(o2 => norm(o2.path).startsWith(mp + '/') && norm(o2.path).split('/').length === mp.split('/').length + 2);
                            if (!hasDC) toRemove.push(i);
                        }
                    }
                }
                for (let i = toRemove.length - 1; i >= 0; i--) n.ch.splice(toRemove[i], 1);
                n.ch.sort((a: any, b: any) => b.l - a.l);
            }
        }
        const roots: any[] = [];
        const seen = new Set<string>();
        for (const o of ownership) {
            const np = norm(o.path);
            if (!np.includes('/')) { if (rootMap.has(np)) { roots.push(rootMap.get(np)); rootMap.delete(np); } continue; }
            const top = np.split('/')[0];
            if (!seen.has(top)) {
                seen.add(top);
                const tn = all.get(top);
                if (tn) roots.push(tn);
            }
        }
        for (const entry of all) { const n = entry[1]; if (n.t === 'd' && !entry[0].includes('/') && !roots.find((r: any) => r.p === n.p)) roots.push(n); }
        return roots.sort((a: any, b: any) => b.l - a.l);
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
            vscode.window.showErrorMessage('Git Stats: failed to export chart image — ' + formatError(error));
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
            vscode.window.showErrorMessage('Git Stats: failed to export CSV — ' + formatError(error));
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
