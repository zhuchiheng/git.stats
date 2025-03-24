"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContributionVisualization = void 0;
var vscode = require("vscode");
var moment_1 = require("moment");
var ContributionVisualization = /** @class */ (function () {
    function ContributionVisualization(context, analyzer) {
        this.context = context;
        this.analyzer = analyzer;
        this.disposables = [];
    }
    ContributionVisualization.prototype.dispose = function () {
        var _a;
        (_a = this.panel) === null || _a === void 0 ? void 0 : _a.dispose();
        this.disposables.forEach(function (d) { return d.dispose(); });
    };
    ContributionVisualization.prototype.update = function (stats) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.panel) {
                            return [2 /*return*/];
                        }
                        // 更新图表数据
                        return [4 /*yield*/, this.updateVisualization(stats)];
                    case 1:
                        // 更新图表数据
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    ContributionVisualization.prototype.updateStats = function (stats) {
        return __awaiter(this, void 0, void 0, function () {
            var authors, dates, hours, commitData, changeData, hourlyCommitData, hourlyChangeData;
            var _a;
            return __generator(this, function (_b) {
                if (!this.panel) {
                    return [2 /*return*/];
                }
                authors = Object.values(stats);
                dates = this.getAllDates(stats);
                hours = this.getHoursArray();
                commitData = this.prepareCommitData(authors, dates);
                changeData = this.prepareChangeData(authors, dates);
                hourlyCommitData = this.prepareHourlyCommitData(authors, hours);
                hourlyChangeData = this.prepareHourlyChangeData(authors, hours);
                // 更新图表数据
                if ((_a = this.panel) === null || _a === void 0 ? void 0 : _a.webview) {
                    this.panel.webview.postMessage({
                        command: 'updateData',
                        commitData: commitData,
                        changeData: changeData,
                        hourlyCommitData: hourlyCommitData,
                        hourlyChangeData: hourlyChangeData
                    });
                }
                return [2 /*return*/];
            });
        });
    };
    ContributionVisualization.prototype.updateVisualization = function (stats) {
        return __awaiter(this, void 0, void 0, function () {
            var authors, dates, hours, commitData, changeData, hourlyCommitData, hourlyChangeData, calendarData, authorStats;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (!this.panel) {
                            return [2 /*return*/];
                        }
                        authors = Object.values(stats);
                        dates = this.getAllDates(stats);
                        hours = this.getHoursArray();
                        commitData = this.prepareCommitData(authors, dates);
                        changeData = this.prepareChangeData(authors, dates);
                        hourlyCommitData = this.prepareHourlyCommitData(authors, hours);
                        hourlyChangeData = this.prepareHourlyChangeData(authors, hours);
                        calendarData = this.prepareCalendarData(authors, dates);
                        authorStats = authors.map(function (author) { return ({
                            author: author.author,
                            totalCommits: author.totalCommits || 0,
                            totalInsertions: author.totalInsertions || 0,
                            totalDeletions: author.totalDeletions || 0,
                            totalFiles: author.totalFiles || 0
                        }); });
                        if (!this.panel) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.panel.webview.postMessage({
                                command: 'updateData',
                                commitData: commitData,
                                changeData: changeData,
                                hourlyCommitData: hourlyCommitData,
                                hourlyChangeData: hourlyChangeData,
                                authorStats: authorStats,
                                calendarData: calendarData // 新增日历数据
                            })];
                    case 1:
                        _a.sent();
                        _a.label = 2;
                    case 2: return [2 /*return*/];
                }
            });
        });
    };
    ContributionVisualization.prototype.handleTimeRangeChange = function (days, startDate, endDate) {
        return __awaiter(this, void 0, void 0, function () {
            var stats, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, this.analyzer.getContributionStats(days, startDate, endDate)];
                    case 1:
                        stats = _a.sent();
                        // 更新可视化
                        return [4 /*yield*/, this.update(stats)];
                    case 2:
                        // 更新可视化
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_1 = _a.sent();
                        console.error('Error updating time range:', error_1);
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    ContributionVisualization.prototype.show = function (stats) {
        return __awaiter(this, void 0, void 0, function () {
            var dates, commitData, changeData, hourlyCommitData, hourlyChangeData;
            var _this = this;
            return __generator(this, function (_a) {
                console.log('Showing contribution stats:', stats);
                if (this.panel) {
                    this.panel.reveal();
                }
                else {
                    this.panel = vscode.window.createWebviewPanel('codeActivityStats', 'Git Stats', vscode.ViewColumn.One, {
                        enableScripts: true,
                        retainContextWhenHidden: true,
                        localResourceRoots: [this.context.extensionUri]
                    });
                    this.panel.onDidDispose(function () {
                        _this.panel = undefined;
                    }, null, this.disposables);
                    // 添加消息监听器
                    this.panel.webview.onDidReceiveMessage(function (message) { return __awaiter(_this, void 0, void 0, function () {
                        var _a;
                        return __generator(this, function (_b) {
                            switch (_b.label) {
                                case 0:
                                    _a = message.command;
                                    switch (_a) {
                                        case 'timeRangeChanged': return [3 /*break*/, 1];
                                    }
                                    return [3 /*break*/, 3];
                                case 1: return [4 /*yield*/, this.handleTimeRangeChange(message.days, message.startDate, message.endDate)];
                                case 2:
                                    _b.sent();
                                    return [3 /*break*/, 3];
                                case 3: return [2 /*return*/];
                            }
                        });
                    }); }, undefined, this.disposables);
                }
                dates = this.getAllDates(stats);
                console.log('Generated dates:', dates);
                commitData = this.prepareCommitData(Object.values(stats), dates);
                console.log('Prepared commit data:', commitData);
                changeData = this.prepareChangeData(Object.values(stats), dates);
                console.log('Prepared change data:', changeData);
                hourlyCommitData = this.prepareHourlyCommitData(Object.values(stats), this.getHoursArray());
                console.log('Prepared hourly commit data:', hourlyCommitData);
                hourlyChangeData = this.prepareHourlyChangeData(Object.values(stats), this.getHoursArray());
                console.log('Prepared hourly change data:', hourlyChangeData);
                if (this.panel) {
                    this.panel.webview.html = this.getWebviewContent(stats, commitData, changeData, hourlyCommitData, hourlyChangeData);
                }
                return [2 /*return*/];
            });
        });
    };
    ContributionVisualization.prototype.getWebviewContent = function (stats, commitData, changeData, hourlyCommitData, hourlyChangeData) {
        var authors = Object.values(stats);
        var dates = this.getAllDates(stats);
        // 准备日历数据
        var calendarData = this.prepareCalendarData(authors, dates);
        return "<!DOCTYPE html>\n        <html>\n        <head>\n            <title>Git Stats</title>\n            <script src=\"https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js\"></script>\n            <style>\n                :root {\n                    --vscode-dropdown-background: var(--vscode-input-background);\n                    --vscode-dropdown-foreground: var(--vscode-input-foreground);\n                    --vscode-dropdown-border: var(--vscode-input-border);\n                }\n                .container {\n                    padding: 20px;\n                    max-width: 1200px;\n                    margin: 0 auto;\n                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;\n                }\n                .header {\n                    display: flex;\n                    justify-content: space-between;\n                    align-items: center;\n                    margin-bottom: 20px;\n                }\n                .time-range-selector {\n                    display: flex;\n                    align-items: center;\n                    gap: 10px;\n                    padding: 4px 8px;\n                    border-radius: 4px;\n                }\n                .date-picker {\n                    background-color: var(--vscode-dropdown-background);\n                    color: var(--vscode-dropdown-foreground);\n                    border: 1px solid var(--vscode-dropdown-border);\n                    padding: 4px 8px;\n                    border-radius: 4px;\n                    font-size: 13px;\n                }\n                .date-separator {\n                    color: var(--vscode-foreground);\n                    margin: 0 4px;\n                }\n                .chart-container {\n                    position: relative;\n                    height: 400px;\n                    margin-bottom: 20px;\n                    background-color: var(--vscode-editor-background);\n                    padding: 15px;\n                    border-radius: 8px;\n                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);\n                }\n                .chart-title {\n                    margin-bottom: 15px;\n                    color: var(--vscode-foreground);\n                    font-size: 18px;\n                    font-weight: 500;\n                }\n                .summary-table {\n                    width: 100%;\n                    border-collapse: collapse;\n                    margin-top: 20px;\n                    margin-bottom: 30px;\n                    background-color: var(--vscode-editor-background);\n                    border-radius: 8px;\n                    overflow: hidden;\n                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);\n                }\n                .summary-table th, .summary-table td {\n                    padding: 12px;\n                    text-align: left;\n                    border: 1px solid var(--vscode-dropdown-border);\n                }\n                .summary-table th {\n                    background-color: var(--vscode-dropdown-background);\n                    font-weight: 500;\n                }\n                .summary-table tr:hover {\n                    background-color: var(--vscode-list-hoverBackground);\n                }\n                .pie-chart-container {\n                    position: absolute;\n                    top: 100px;\n                    left: 100px;\n                    width: 150px;\n                    height: 150px;\n                    background-color: rgba(255, 255, 255, 0.05);\n                    border-radius: 8px;\n                    cursor: move;\n                    z-index: 1000;\n                    backdrop-filter: blur(3px);\n                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.08);\n                }\n                .pie-chart-container:hover {\n                    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);\n                }\n                select {\n                    background-color: var(--vscode-dropdown-background);\n                    color: var(--vscode-dropdown-foreground);\n                    border: 1px solid var(--vscode-dropdown-border);\n                    padding: 4px 8px;\n                    border-radius: 4px;\n                    font-size: 13px;\n                }\n                select:focus {\n                    outline: none;\n                    border-color: var(--vscode-focusBorder);\n                }\n                h1 {\n                    margin: 0;\n                    font-size: 24px;\n                    color: var(--vscode-foreground);\n                }\n            </style>\n        </head>\n        <body>\n            <div class=\"container\">\n                <div class=\"header\">\n                    <h1>Git Stats</h1>\n                    <div class=\"time-range-selector\">\n                        <input type=\"date\" id=\"startDate\" class=\"date-picker\" title=\"Start Date\">\n                        <span class=\"date-separator\">to</span>\n                        <input type=\"date\" id=\"endDate\" class=\"date-picker\" title=\"End Date\">\n                        <select id=\"timeRange\">\n                            <option value=\"custom\" selected>Custom Range</option>\n                            <option value=\"7\">Last Week</option>\n                            <option value=\"30\">Last Month</option>\n                            <option value=\"90\">Last 3 Months</option>\n                            <option value=\"180\">Last 6 Months</option>\n                            <option value=\"365\">Last Year</option>\n                        </select>\n                    </div>\n                </div>\n                <!-- Daily Charts -->\n                <div class=\"chart-container\">\n                    <div class=\"pie-chart-container\">\n                        <canvas id=\"pieChart\"></canvas>\n                    </div>\n                    <h2 class=\"chart-title\">Daily Commits</h2>\n                    <canvas id=\"commitChart\"></canvas>\n                </div>\n                <div class=\"chart-container\">\n                    <div class=\"pie-chart-container\">\n                        <canvas id=\"linesChangedPieChart\"></canvas>\n                    </div>\n                    <h2 class=\"chart-title\">Daily Lines Changed</h2>\n                    <canvas id=\"changeChart\"></canvas>\n                </div>\n\n                <!-- Hourly Charts -->\n                <div class=\"chart-container\">\n                    <h2 class=\"chart-title\">Hourly Commits</h2>\n                    <canvas id=\"hourlyCommitChart\"></canvas>\n                </div>\n                <div class=\"chart-container\">\n                    <h2 class=\"chart-title\">Hourly Lines Changes</h2>\n                    <canvas id=\"hourlyChangeChart\"></canvas>\n                </div>\n\n                <!-- \u65E5\u5386\u56FE\u8868 -->\n                <div class=\"chart-container\">\n                    <h2 class=\"chart-title\">Contribution Calendar</h2>\n                    <div id=\"calendar\" style=\"display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px;\"></div>\n                </div>\n\n                <h2>Summary</h2>\n                <table class=\"summary-table\">\n                    <tr>\n                        <th>Author</th>\n                        <th>Total Commits</th>\n                        <th>Lines Added</th>\n                        <th>Lines Deleted</th>\n                        <th>Files Changed</th>\n                    </tr>\n                    " + authors.map(function (author) { return "\n                        <tr>\n                            <td>" + author.author + "</td>\n                            <td>" + author.totalCommits + "</td>\n                            <td>" + author.totalInsertions + "</td>\n                            <td>" + author.totalDeletions + "</td>\n                            <td>" + author.totalFiles + "</td>\n                        </tr>\n                    "; }).join('') + "\n                </table>\n            </div>\n            <script>\n                // \u62D6\u52A8\u529F\u80FD\n                const pieChartContainers = document.querySelectorAll('.pie-chart-container');\n                let isDragging = false;\n                let currentX;\n                let currentY;\n                let initialX;\n                let initialY;\n                let activePieChart = null;\n\n                pieChartContainers.forEach(container => {\n                    container.addEventListener('mousedown', (e) => {\n                        activePieChart = container;\n                        dragStart(e);\n                    });\n                });\n                \n                document.addEventListener('mousemove', drag);\n                document.addEventListener('mouseup', dragEnd);\n\n                function dragStart(e) {\n                    if (!activePieChart) return;\n                    initialX = e.clientX - activePieChart.offsetLeft;\n                    initialY = e.clientY - activePieChart.offsetTop;\n                    isDragging = true;\n                }\n\n                function drag(e) {\n                    if (isDragging && activePieChart) {\n                        e.preventDefault();\n                        currentX = e.clientX - initialX;\n                        currentY = e.clientY - initialY;\n                        \n                        // \u9650\u5236\u5728\u56FE\u8868\u533A\u57DF\u5185\n                        const container = activePieChart.closest('.chart-container');\n                        const maxX = container.offsetWidth - activePieChart.offsetWidth;\n                        const maxY = container.offsetHeight - activePieChart.offsetHeight;\n                        \n                        currentX = Math.max(0, Math.min(currentX, maxX));\n                        currentY = Math.max(0, Math.min(currentY, maxY));\n\n                        activePieChart.style.left = currentX + 'px';\n                        activePieChart.style.top = currentY + 'px';\n                    }\n                }\n\n                function dragEnd() {\n                    isDragging = false;\n                    activePieChart = null;\n                }\n\n                const vscode = acquireVsCodeApi();\n                let commitChart, changeChart, pieChart, linesChangedPieChart;\n\n                // \u89E3\u6790\u6570\u636E\n                const commitData = ".concat(JSON.stringify(commitData), ";\n                const changeData = ").concat(JSON.stringify(changeData), ";\n                const hourlyCommitData = ").concat(JSON.stringify(hourlyCommitData), ";\n                const hourlyChangeData = ").concat(JSON.stringify(hourlyChangeData), ";\n\n                // \u8BBE\u7F6E\u521D\u59CB\u65E5\u671F\u8303\u56F4\n                const today = new Date();\n                today.setHours(0, 0, 0, 0);  // \u8BBE\u7F6E\u65F6\u95F4\u4E3A\u5F53\u5929\u76840\u70B9\n                const lastCommitDate = new Date(endDate);\n                lastCommitDate.setHours(0, 0, 0, 0);  // \u8BBE\u7F6E\u65F6\u95F4\u4E3A\u5F53\u5929\u76840\u70B9\n\n                document.getElementById('startDate').value = startDate;\n                document.getElementById('endDate').value = endDate;\n                \n                // \u5982\u679C\u6700\u540E\u4E00\u6B21\u63D0\u4EA4\u662F\u4ECA\u5929\uFF0C\u5219\u8BBE\u7F6E\u4E3A\"Last Week\"\n                if (lastCommitDate.getTime() === today.getTime()) {\n                    document.getElementById('timeRange').value = '7';  // Last Week\n                } else {\n                    document.getElementById('timeRange').value = 'custom';  // Custom Range\n                }\n\n                // \u521B\u5EFA\u63D0\u4EA4\u56FE\u8868\n                function createCommitChart(data) {\n                    const ctx = document.getElementById('commitChart');\n                    if (commitChart) {\n                        commitChart.destroy();\n                    }\n                    commitChart = new Chart(ctx, {\n                        type: 'line',\n                        data: data,\n                        options: {\n                            responsive: true,\n                            maintainAspectRatio: false,\n                            interaction: {\n                                intersect: false,\n                                mode: 'index'\n                            },\n                            plugins: {\n                                legend: {\n                                    position: 'top',\n                                },\n                                tooltip: {\n                                    callbacks: {\n                                        label: function(context) {\n                                            return context.dataset.label + ': ' + context.raw + ' commits';\n                                        }\n                                    }\n                                }\n                            },\n                            elements: {\n                                line: {\n                                    tension: 0.4,\n                                    cubicInterpolationMode: 'monotone'\n                                }\n                            },\n                            scales: {\n                                x: {\n                                    title: {\n                                        display: true,\n                                        text: 'Date'\n                                    },\n                                    ticks: {\n                                        maxRotation: 45,\n                                        minRotation: 45\n                                    }\n                                },\n                                y: {\n                                    beginAtZero: true,\n                                    title: {\n                                        display: true,\n                                        text: 'Number of Commits'\n                                    }\n                                }\n                            }\n                        }\n                    });\n                }\n\n                // \u521B\u5EFA\u53D8\u66F4\u56FE\u8868\n                function createChangeChart(data) {\n                    const ctx = document.getElementById('changeChart');\n                    if (changeChart) {\n                        changeChart.destroy();\n                    }\n                    changeChart = new Chart(ctx, {\n                        type: 'bar',\n                        data: data,\n                        options: {\n                            responsive: true,\n                            maintainAspectRatio: false,\n                            interaction: {\n                                intersect: false,\n                                mode: 'index'\n                            },\n                            plugins: {\n                                legend: {\n                                    position: 'top',\n                                },\n                                tooltip: {\n                                    callbacks: {\n                                        label: function(context) {\n                                            return context.dataset.label + ': ' + context.raw + ' lines changed';\n                                        }\n                                    }\n                                }\n                            },\n                            scales: {\n                                x: {\n                                    title: {\n                                        display: true,\n                                        text: 'Date'\n                                    },\n                                    ticks: {\n                                        maxRotation: 45,\n                                        minRotation: 45\n                                    }\n                                },\n                                y: {\n                                    beginAtZero: true,\n                                    title: {\n                                        display: true,\n                                        text: 'Lines Changed'\n                                    }\n                                }\n                            }\n                        }\n                    });\n                }\n\n                // \u521B\u5EFA\u997C\u56FE\n                function createPieChart(data) {\n                    const ctx = document.getElementById('pieChart');\n                    const totalCommits = data.datasets.reduce((acc, dataset) => {\n                        return acc + dataset.data.reduce((sum, val) => sum + val, 0);\n                    }, 0);\n                    \n                    const pieData = {\n                        labels: data.datasets.map(d => d.label),\n                        datasets: [{\n                            data: data.datasets.map(d => \n                                d.data.reduce((sum, val) => sum + val, 0)\n                            ),\n                            backgroundColor: data.datasets.map(d => d.backgroundColor),\n                            borderColor: 'rgba(0, 0, 0, 0.1)',\n                            borderWidth: 1\n                        }]\n                    };\n\n                    if (pieChart) {\n                        pieChart.destroy();\n                    }\n\n                    pieChart = new Chart(ctx, {\n                        type: 'pie',\n                        data: pieData,\n                        options: {\n                            responsive: true,\n                            maintainAspectRatio: false,\n                            plugins: {\n                                legend: {\n                                    display: false\n                                },\n                                tooltip: {\n                                    callbacks: {\n                                        label: function(context) {\n                                            const value = context.raw;\n                                            const percentage = ((value / totalCommits) * 100).toFixed(1);\n                                            return [\n                                                context.label,\n                                                'Commits: ' + value,\n                                                'Percentage: ' + percentage + '%'\n                                            ];\n                                        }\n                                    }\n                                }\n                            }\n                        }\n                    });\n                }\n\n                // \u521B\u5EFALines Changed\u997C\u56FE\n                function createLinesChangedPieChart(data) {\n                    const ctx = document.getElementById('linesChangedPieChart');\n                    const totalLines = data.datasets.reduce((acc, dataset) => {\n                        return acc + dataset.data.reduce((sum, val) => sum + val, 0);\n                    }, 0);\n                    \n                    const pieData = {\n                        labels: data.datasets.map(d => d.label),\n                        datasets: [{\n                            data: data.datasets.map(d => \n                                d.data.reduce((sum, val) => sum + val, 0)\n                            ),\n                            backgroundColor: data.datasets.map(d => d.backgroundColor),\n                            borderColor: 'rgba(0, 0, 0, 0.1)',\n                            borderWidth: 1\n                        }]\n                    };\n\n                    if (linesChangedPieChart) {\n                        linesChangedPieChart.destroy();\n                    }\n\n                    linesChangedPieChart = new Chart(ctx, {\n                        type: 'pie',\n                        data: pieData,\n                        options: {\n                            responsive: true,\n                            maintainAspectRatio: false,\n                            plugins: {\n                                legend: {\n                                    display: false\n                                },\n                                tooltip: {\n                                    callbacks: {\n                                        label: function(context) {\n                                            const value = context.raw;\n                                            const percentage = ((value / totalLines) * 100).toFixed(1);\n                                            return [\n                                                context.label,\n                                                'Lines Changed: ' + value,\n                                                'Percentage: ' + percentage + '%'\n                                            ];\n                                        }\n                                    }\n                                }\n                            }\n                        }\n                    });\n                }\n\n                function createHourlyCommitChart(data) {\n                    const ctx = document.getElementById('hourlyCommitChart');\n                    const existingChart = Chart.getChart(ctx);\n                    if (existingChart) {\n                        existingChart.destroy();\n                    }\n                    \n                    new Chart(ctx, {\n                        type: 'line',\n                        data: data,\n                        options: {\n                            responsive: true,\n                            maintainAspectRatio: false,\n                            interaction: {\n                                intersect: false,\n                                mode: 'index'\n                            },\n                            plugins: {\n                                legend: {\n                                    position: 'top',\n                                },\n                                tooltip: {\n                                    callbacks: {\n                                        label: function(context) {\n                                            return context.dataset.label + ': ' + context.raw + ' commits';\n                                        }\n                                    }\n                                }\n                            },\n                            scales: {\n                                x: {\n                                    title: {\n                                        display: true,\n                                        text: 'Hour'\n                                    }\n                                },\n                                y: {\n                                    beginAtZero: true,\n                                    title: {\n                                        display: true,\n                                        text: 'Number of Commits'\n                                    }\n                                }\n                            }\n                        }\n                    });\n                }\n\n                function createHourlyChangeChart(data) {\n                    const ctx = document.getElementById('hourlyChangeChart');\n                    const existingChart = Chart.getChart(ctx);\n                    if (existingChart) {\n                        existingChart.destroy();\n                    }\n                    \n                    new Chart(ctx, {\n                        type: 'bar',\n                        data: data,\n                        options: {\n                            responsive: true,\n                            maintainAspectRatio: false,\n                            interaction: {\n                                intersect: false,\n                                mode: 'index'\n                            },\n                            plugins: {\n                                legend: {\n                                    position: 'top',\n                                },\n                                tooltip: {\n                                    callbacks: {\n                                        label: function(context) {\n                                            return context.dataset.label + ': ' + context.raw + ' lines changed';\n                                        }\n                                    }\n                                }\n                            },\n                            scales: {\n                                x: {\n                                    title: {\n                                        display: true,\n                                        text: 'Hour'\n                                    }\n                                },\n                                y: {\n                                    beginAtZero: true,\n                                    title: {\n                                        display: true,\n                                        text: 'Lines Changed'\n                                    },\n                                    stacked: true  // \u542F\u7528\u5806\u53E0\u6548\u679C\n                                }\n                            }\n                        }\n                    });\n                }\n\n                // \u521D\u59CB\u5316\u6240\u6709\u56FE\u8868\n                createCommitChart(commitData);\n                createChangeChart(changeData);\n                createPieChart(commitData);\n                createLinesChangedPieChart(changeData);\n                createHourlyCommitChart(hourlyCommitData);  // \u521B\u5EFA\u6BCF\u5C0F\u65F6\u63D0\u4EA4\u6B21\u6570\u56FE\u8868\n                createHourlyChangeChart(hourlyChangeData);  // \u521B\u5EFA\u6BCF\u5C0F\u65F6\u4EE3\u7801\u53D8\u66F4\u884C\u6570\u56FE\u8868\n\n                // \u66F4\u65B0\u56FE\u8868\u6570\u636E\u7684\u6D88\u606F\u5904\u7406\n                window.addEventListener('message', event => {\n                    const message = event.data;\n                    switch (message.command) {\n                        case 'updateData':\n                            // \u66F4\u65B0\u6240\u6709\u56FE\u8868\n                            if (commitChart) {\n                                commitChart.data = message.commitData;\n                                commitChart.update();\n                                createPieChart(message.commitData);\n                            }\n                            if (changeChart) {\n                                changeChart.data = message.changeData;\n                                changeChart.update();\n                                createLinesChangedPieChart(message.changeData);\n                            }\n                            \n                            if (message.hourlyCommitData) {\n                                createHourlyCommitChart(message.hourlyCommitData);\n                            }\n                            if (message.hourlyChangeData) {\n                                createHourlyChangeChart(message.hourlyChangeData);\n                            }\n\n                            if (message.calendarData) {\n                                renderCalendar(message.calendarData);\n                            }\n\n                            // \u66F4\u65B0summary\u8868\u683C\n                            const summaryTable = document.querySelector('.summary-table');\n                            if (summaryTable && message.authorStats) {\n                                // \u4FDD\u7559\u8868\u5934\n                                const tableHeader = summaryTable.querySelector('tr');\n                                if (tableHeader) {\n                                    summaryTable.innerHTML = '';\n                                    summaryTable.appendChild(tableHeader);\n\n                                    // \u4F7F\u7528\u540E\u7AEF\u53D1\u9001\u7684\u51C6\u786E\u7EDF\u8BA1\u6570\u636E\n                                    message.authorStats.forEach(authorStat => {\n                                        const row = document.createElement('tr');\n                                        const cells = [\n                                            authorStat.author,\n                                            authorStat.totalCommits || 0,\n                                            authorStat.totalInsertions || 0,\n                                            authorStat.totalDeletions || 0,\n                                            authorStat.totalFiles || 0\n                                        ];\n                                        cells.forEach(value => {\n                                            const cell = document.createElement('td');\n                                            cell.textContent = value.toString();\n                                            row.appendChild(cell);\n                                        });\n                                        summaryTable.appendChild(row);\n                                    });\n                                }\n                            }\n                            break;\n                    }\n                });\n\n                // \u65F6\u95F4\u8303\u56F4\u9009\u62E9\u5904\u7406\n                const timeRangeSelect = document.getElementById('timeRange');\n                const startDateInput = document.getElementById('startDate');\n                const endDateInput = document.getElementById('endDate');\n\n                // \u65F6\u95F4\u8303\u56F4\u9009\u62E9\u53D8\u5316\u5904\u7406\n                timeRangeSelect.addEventListener('change', function(e) {\n                    const value = this.value;\n                    if (value === 'custom') {\n                        return; // \u4FDD\u6301\u5F53\u524D\u9009\u62E9\u7684\u65E5\u671F\u4E0D\u53D8\n                    }\n\n                    const days = parseInt(value);\n                    const end = new Date();\n                    const start = new Date();\n                    start.setDate(end.getDate() - (days - 1)); // -1\u662F\u56E0\u4E3A\u5305\u542B\u4ECA\u5929\n\n                    startDateInput.value = start.toISOString().split('T')[0];\n                    endDateInput.value = end.toISOString().split('T')[0];\n\n                    // \u901A\u77E5\u6269\u5C55\u65F6\u95F4\u8303\u56F4\u5DF2\u66F4\u6539\n                    vscode.postMessage({\n                        command: 'timeRangeChanged',\n                        days: days,\n                        startDate: startDateInput.value,\n                        endDate: endDateInput.value\n                    });\n                });\n\n                // \u65E5\u671F\u9009\u62E9\u53D8\u5316\u5904\u7406\n                function handleDateChange() {\n                    const start = new Date(startDateInput.value);\n                    const end = new Date(endDateInput.value);\n                    \n                    if (start && end && start <= end) {\n                        // \u8BA1\u7B97\u5929\u6570\u5DEE\u5F02\n                        const diffTime = Math.abs(end - start);\n                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 \u5305\u542B\u5F00\u59CB\u65E5\u671F\n                        \n                        // \u8BBE\u7F6E\u4E0B\u62C9\u6846\u4E3Acustom\n                        timeRangeSelect.value = 'custom';\n                        \n                        // \u901A\u77E5\u6269\u5C55\u65F6\u95F4\u8303\u56F4\u5DF2\u66F4\u6539\n                        vscode.postMessage({\n                            command: 'timeRangeChanged',\n                            days: diffDays,\n                            startDate: startDateInput.value,\n                            endDate: endDateInput.value\n                        });\n                    }\n                }\n\n                startDateInput.addEventListener('change', handleDateChange);\n                endDateInput.addEventListener('change', handleDateChange);\n\n                // \u6E32\u67D3\u65E5\u5386\n                function renderCalendar(calendarData) {\n                    const container = document.getElementById('calendar');\n                    if (!container) return;\n\n                    container.innerHTML = '';\n                    calendarData.forEach(day => {\n                        const cell = document.createElement('div');\n                        cell.style.backgroundColor = day.totalCommits > 0 \n                            ? `rgba(46, 204, 113, ${day.colorIntensity * 0.2}` \n                            : 'transparent';\n                        cell.style.width = '20px';\n                        cell.style.height = '20px';\n                        cell.style.borderRadius = '4px';\n                        cell.title = `Date: ${day.date}, Commits: ${day.totalCommits}`;\n                        container.appendChild(cell);\n                    });\n                }\n\n                // \u521D\u59CB\u5316\u65E5\u5386\n                const calendarData = ").concat(JSON.stringify(calendarData), ";\n                renderCalendar(calendarData);\n\n            </script>\n        </body>\n        </html>");
    };
    ContributionVisualization.prototype.getAllDates = function (stats) {
        var _a, _b;
        // 不使用 UTC，保持本地时间
        var startDate = (0, moment_1.default)((_a = Object.values(stats)[0]) === null || _a === void 0 ? void 0 : _a.startDate).startOf('day');
        var endDate = (0, moment_1.default)((_b = Object.values(stats)[0]) === null || _b === void 0 ? void 0 : _b.endDate).endOf('day');
        var dates = [];
        console.log('Date range:', startDate.format('YYYY-MM-DD HH:mm:ss'), 'to', endDate.format('YYYY-MM-DD HH:mm:ss'));
        var currentDate = startDate.clone();
        // 使用 isSameOrBefore 时指定比较单位为 'day'
        while (currentDate.isSameOrBefore(endDate, 'day')) {
            dates.push(currentDate.format('YYYY-MM-DD'));
            currentDate.add(1, 'day');
        }
        return dates;
    };
    ContributionVisualization.prototype.getHoursArray = function () {
        return Array.from({ length: 24 }, function (_, i) { return i.toString().padStart(2, '0'); });
    };
    ContributionVisualization.prototype.prepareCommitData = function (authors, dates) {
        var _this = this;
        // 过滤掉 stash 相关的作者
        authors = authors.filter(function (author) {
            return !author.author.toLowerCase().includes('stash');
        });
        var datasets = authors.map(function (author, index) { return ({
            label: author.author,
            data: dates.map(function (date) { var _a; return ((_a = author.dailyStats[date]) === null || _a === void 0 ? void 0 : _a.commits) || 0; }),
            borderColor: _this.getColor(index),
            backgroundColor: _this.getColor(index),
            fill: false,
            tension: 0.4, // 添加曲线张力
            cubicInterpolationMode: 'monotone' // 使用单调的三次插值
        }); });
        return {
            labels: dates,
            datasets: datasets
        };
    };
    ContributionVisualization.prototype.prepareChangeData = function (authors, dates) {
        var _this = this;
        // 过滤掉 stash 相关的作者
        authors = authors.filter(function (author) {
            return !author.author.toLowerCase().includes('stash');
        });
        var datasets = authors.map(function (author, index) { return ({
            label: author.author,
            data: dates.map(function (date) {
                var stats = author.dailyStats[date];
                return stats ? stats.insertions + stats.deletions : 0;
            }),
            backgroundColor: _this.getColor(index),
            stack: 'combined'
        }); });
        return {
            labels: dates,
            datasets: datasets
        };
    };
    ContributionVisualization.prototype.prepareHourlyCommitData = function (authors, hours) {
        var _this = this;
        return {
            labels: hours.map(function (h) { return "".concat(h, ":00"); }),
            datasets: authors.filter(function (a) { return !a.author.toLowerCase().includes('stash'); }).map(function (author, i) { return ({
                label: author.author,
                data: hours.map(function (h) { var _a; return ((_a = author.hourlyStats[h]) === null || _a === void 0 ? void 0 : _a.commits) || 0; }),
                borderColor: _this.getColor(i),
                backgroundColor: _this.getColor(i),
                fill: false,
                tension: 0.4
            }); })
        };
    };
    ContributionVisualization.prototype.prepareHourlyChangeData = function (authors, hours) {
        var _this = this;
        return {
            labels: hours.map(function (h) { return "".concat(h, ":00"); }),
            datasets: authors.filter(function (a) { return !a.author.toLowerCase().includes('stash'); }).map(function (author, i) { return ({
                label: author.author,
                data: hours.map(function (h) {
                    var s = author.hourlyStats[h];
                    return ((s === null || s === void 0 ? void 0 : s.insertions) || 0) + ((s === null || s === void 0 ? void 0 : s.deletions) || 0);
                }),
                backgroundColor: _this.getColor(i),
                stack: 'combined' // 添加堆叠效果
            }); })
        };
    };
    ContributionVisualization.prototype.prepareCalendarData = function (authors, dates) {
        var calendarData = dates.map(function (date) {
            var totalCommits = authors.reduce(function (sum, author) { var _a; return sum + (((_a = author.dailyStats[date]) === null || _a === void 0 ? void 0 : _a.commits) || 0); }, 0);
            return {
                date: date,
                totalCommits: totalCommits,
                colorIntensity: Math.min(4, Math.floor(totalCommits / 5)) // 将提交数量映射到颜色强度（0-4）
            };
        });
        return calendarData;
    };
    ContributionVisualization.prototype.getColor = function (index) {
        var colors = [
            '#2196F3', // Blue
            '#4CAF50', // Green
            '#F44336', // Red
            '#FFC107', // Amber
            '#9C27B0', // Purple
            '#00BCD4', // Cyan
            '#FF9800', // Orange
            '#795548', // Brown
            '#607D8B', // Blue Grey
            '#E91E63' // Pink
        ];
        return colors[index % colors.length];
    };
    return ContributionVisualization;
}());
exports.ContributionVisualization = ContributionVisualization;
