"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContributionVisualization = void 0;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs/promises"));
const moment_1 = __importDefault(require("moment"));
class ContributionVisualization {
    constructor(context, analyzers, gitRepos) {
        this.context = context;
        this.analyzers = analyzers;
        this.disposables = [];
        this.gitRepos = [];
        this.currentRepoIndex = 0;
        this.globalCache = {};
        this.gitRepos = gitRepos;
        this.analyzer = analyzers[0];
    }
    dispose() {
        var _a;
        (_a = this.panel) === null || _a === void 0 ? void 0 : _a.dispose();
        this.disposables.forEach(d => d.dispose());
    }
    update(stats) {
        return __awaiter(this, void 0, void 0, function* () {
            if (!this.panel) {
                return;
            }
            yield this.updateVisualization(stats);
        });
    }
    updateStats(stats) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
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
            if ((_a = this.panel) === null || _a === void 0 ? void 0 : _a.webview) {
                this.panel.webview.postMessage({
                    command: 'updateData',
                    commitData,
                    changeData,
                    hourlyCommitData,
                    hourlyChangeData
                });
            }
        });
    }
    updateVisualization(stats) {
        return __awaiter(this, void 0, void 0, function* () {
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
            const authorStats = authors.map(author => ({
                author: author.author,
                totalCommits: author.totalCommits || 0,
                totalInsertions: author.totalInsertions || 0,
                totalDeletions: author.totalDeletions || 0,
                totalFiles: author.totalFiles || 0
            }));
            if (this.panel) {
                yield this.panel.webview.postMessage({
                    command: 'updateData',
                    commitData: commitData,
                    changeData: changeData,
                    hourlyCommitData: hourlyCommitData,
                    hourlyChangeData: hourlyChangeData,
                    authorStats: authorStats,
                    calendarData
                });
            }
        });
    }
    handleTimeRangeChange(days, startDate, endDate) {
        return __awaiter(this, void 0, void 0, function* () {
            var _a;
            try {
                this.analyzer = this.analyzers[this.currentRepoIndex];
                this.globalCache = yield this.analyzer.getContributionStats(days, startDate, endDate);
                if ((_a = this.panel) === null || _a === void 0 ? void 0 : _a.webview) {
                    const authors = Object.keys(this.globalCache).filter(a => !a.toLowerCase().includes('stash'));
                    this.panel.webview.postMessage({
                        command: 'updateDevelopers',
                        developers: authors
                    });
                }
                yield this.applyDeveloperFilter();
            }
            catch (error) {
                console.error('Error updating time range:', error);
            }
        });
    }
    applyDeveloperFilter(developer) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                const filteredStats = developer && developer !== 'all'
                    ? { [developer]: this.globalCache[developer] }
                    : this.globalCache;
                yield this.update(filteredStats);
            }
            catch (error) {
                console.error('Error applying developer filter:', error);
            }
        });
    }
    show(stats) {
        return __awaiter(this, void 0, void 0, function* () {
            this.globalCache = stats;
            if (this.panel) {
                this.webview = this.panel.webview;
                this.panel.reveal();
                const authors = Object.keys(stats);
                this.panel.webview.postMessage({
                    command: 'updateDevelopers',
                    developers: authors
                });
            }
            else {
                this.panel = vscode.window.createWebviewPanel('codeActivityStats', 'Git Stats', vscode.ViewColumn.One, {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [this.context.extensionUri]
                });
                this.webview = this.panel.webview;
                this.panel.onDidDispose(() => {
                    this.panel = undefined;
                }, null, this.disposables);
                this.panel.webview.onDidReceiveMessage((message) => __awaiter(this, void 0, void 0, function* () {
                    switch (message.command) {
                        case 'timeRangeChanged':
                            yield this.handleTimeRangeChange(message.days, message.startDate, message.endDate);
                            break;
                        case 'developerChanged':
                            yield this.handleDeveloperChange(message.developer);
                            break;
                        case 'repoChanged':
                            this.currentRepoIndex = message.repoIndex;
                            yield this.handleTimeRangeChange(7);
                            break;
                    }
                }), undefined, this.disposables);
            }
            const dates = this.getAllDates(stats);
            const commitData = this.prepareCommitData(Object.values(stats), dates);
            const changeData = this.prepareChangeData(Object.values(stats), dates);
            const hourlyCommitData = this.prepareHourlyCommitData(Object.values(stats), this.getHoursArray());
            const hourlyChangeData = this.prepareHourlyChangeData(Object.values(stats), this.getHoursArray());
            if (this.panel) {
                this.panel.webview.html = yield this.getWebviewContent(stats, commitData, changeData, hourlyCommitData, hourlyChangeData);
            }
        });
    }
    handleDeveloperChange(developer) {
        return __awaiter(this, void 0, void 0, function* () {
            try {
                yield this.applyDeveloperFilter(developer);
            }
            catch (error) {
                console.error('Error updating developer:', error);
            }
        });
    }
    getWebviewContent(stats, commitData, changeData, hourlyCommitData, hourlyChangeData) {
        return __awaiter(this, void 0, void 0, function* () {
            const authors = Object.values(stats);
            const dates = this.getAllDates(stats);
            const firstAuthor = authors[0];
            const startDate = (firstAuthor === null || firstAuthor === void 0 ? void 0 : firstAuthor.startDate.format('YYYY-MM-DD')) || (0, moment_1.default)().subtract(6, 'days').format('YYYY-MM-DD');
            const endDate = (firstAuthor === null || firstAuthor === void 0 ? void 0 : firstAuthor.endDate.format('YYYY-MM-DD')) || (0, moment_1.default)().format('YYYY-MM-DD');
            const calendarData = this.prepareCalendarData(authors, dates);
            try {
                const htmlPath = path.join(this.context.extensionPath, 'resources', 'visualization.html');
                let htmlContent = yield fs.readFile(htmlPath, 'utf-8');
                const chartJsUri = this.webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'node_modules', 'chart.js', 'dist', 'chart.umd.js'));
                const repoOptions = this.gitRepos.map((repo, index) => `<option value="${index}">${path.basename(repo.path)}</option>`).join('');
                const authorOptions = authors.map(author => `<option value="${author.author}">${author.author}</option>`).join('');
                const authorRows = authors.map(author => `
                <tr>
                    <td>${author.author}</td>
                    <td>${author.totalCommits}</td>
                    <td>${author.totalInsertions}</td>
                    <td>${author.totalDeletions}</td>
                    <td>${author.totalFiles}</td>
                </tr>
            `).join('');
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
                    .replace('{{CALENDAR_DATA}}', JSON.stringify(calendarData));
                return htmlContent;
            }
            catch (error) {
                console.error('Error loading visualization template:', error);
                return 'Error loading visualization content';
            }
        });
    }
    getAllDates(stats) {
        var _a, _b;
        const startDate = (0, moment_1.default)((_a = Object.values(stats)[0]) === null || _a === void 0 ? void 0 : _a.startDate).startOf('day');
        const endDate = (0, moment_1.default)((_b = Object.values(stats)[0]) === null || _b === void 0 ? void 0 : _b.endDate).endOf('day');
        const dates = [];
        let currentDate = startDate.clone();
        while (currentDate.isSameOrBefore(endDate, 'day')) {
            dates.push(currentDate.format('YYYY-MM-DD'));
            currentDate.add(1, 'day');
        }
        return dates;
    }
    getHoursArray() {
        return Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
    }
    prepareCommitData(authors, dates) {
        authors = authors.filter(author => !author.author.toLowerCase().includes('stash'));
        const datasets = authors.map((author, index) => ({
            label: author.author,
            data: dates.map(date => { var _a; return ((_a = author.dailyStats[date]) === null || _a === void 0 ? void 0 : _a.commits) || 0; }),
            borderColor: this.getColor(index),
            backgroundColor: this.getColor(index),
            fill: false,
            tension: 0.4,
            cubicInterpolationMode: 'monotone'
        }));
        return {
            labels: dates,
            datasets
        };
    }
    prepareChangeData(authors, dates) {
        authors = authors.filter(author => !author.author.toLowerCase().includes('stash'));
        const datasets = authors.map((author, index) => ({
            label: author.author,
            data: dates.map(date => {
                const stats = author.dailyStats[date];
                return stats ? stats.insertions + stats.deletions : 0;
            }),
            backgroundColor: this.getColor(index),
            stack: 'combined'
        }));
        return {
            labels: dates,
            datasets
        };
    }
    prepareHourlyCommitData(authors, hours) {
        return {
            labels: hours.map(h => `${h}:00`),
            datasets: authors.filter(a => !a.author.toLowerCase().includes('stash')).map((author, i) => ({
                label: author.author,
                data: hours.map(h => { var _a; return ((_a = author.hourlyStats[h]) === null || _a === void 0 ? void 0 : _a.commits) || 0; }),
                borderColor: this.getColor(i),
                backgroundColor: this.getColor(i),
                fill: false,
                tension: 0.4
            }))
        };
    }
    prepareHourlyChangeData(authors, hours) {
        return {
            labels: hours.map(h => `${h}:00`),
            datasets: authors.filter(a => !a.author.toLowerCase().includes('stash')).map((author, i) => ({
                label: author.author,
                data: hours.map(h => {
                    const s = author.hourlyStats[h];
                    return ((s === null || s === void 0 ? void 0 : s.insertions) || 0) + ((s === null || s === void 0 ? void 0 : s.deletions) || 0);
                }),
                backgroundColor: this.getColor(i),
                stack: 'combined'
            }))
        };
    }
    prepareCalendarData(authors, dates) {
        const maxCommits = dates.reduce((max, date) => {
            const dailyCommits = authors.reduce((sum, author) => { var _a; return sum + (((_a = author.dailyStats[date]) === null || _a === void 0 ? void 0 : _a.commits) || 0); }, 0);
            return Math.max(max, dailyCommits);
        }, 1);
        return dates.map(date => {
            const totalCommits = authors.reduce((sum, author) => { var _a; return sum + (((_a = author.dailyStats[date]) === null || _a === void 0 ? void 0 : _a.commits) || 0); }, 0);
            const logValue = Math.log1p(totalCommits) / Math.log1p(maxCommits);
            return {
                date,
                totalCommits,
                colorIntensity: logValue
            };
        });
    }
    getColor(index) {
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
exports.ContributionVisualization = ContributionVisualization;
//# sourceMappingURL=visualization.js.map