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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContributionVisualization = void 0;
const vscode = __importStar(require("vscode"));
class ContributionVisualization {
    constructor(context) {
        this.context = context;
    }
    showContributionStats(stats) {
        if (this.panel) {
            this.panel.reveal();
        }
        else {
            this.panel = vscode.window.createWebviewPanel('codeActivityStats', 'Code Activity Statistics', vscode.ViewColumn.One, {
                enableScripts: true,
                retainContextWhenHidden: true
            });
            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });
        }
        this.panel.webview.html = this.getWebviewContent(stats);
    }
    getWebviewContent(stats) {
        const authors = Object.values(stats);
        const dates = this.getAllDates(stats);
        // 准备图表数据
        const commitData = this.prepareCommitData(authors, dates);
        const changeData = this.prepareChangeData(authors, dates);
        return `<!DOCTYPE html>
        <html>
        <head>
            <title>Code Activity Statistics</title>
            <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
            <style>
                .container {
                    padding: 20px;
                    max-width: 1200px;
                    margin: 0 auto;
                }
                .chart-container {
                    margin-bottom: 30px;
                }
                .summary-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 20px;
                }
                .summary-table th, .summary-table td {
                    border: 1px solid #ddd;
                    padding: 8px;
                    text-align: left;
                }
                .summary-table th {
                    background-color: #f5f5f5;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Code Activity Statistics</h1>
                
                <div class="chart-container">
                    <h2>Daily Commits</h2>
                    <canvas id="commitChart"></canvas>
                </div>
                
                <div class="chart-container">
                    <h2>Code Changes</h2>
                    <canvas id="changeChart"></canvas>
                </div>

                <h2>Summary</h2>
                <table class="summary-table">
                    <tr>
                        <th>Author</th>
                        <th>Total Commits</th>
                        <th>Lines Added</th>
                        <th>Lines Deleted</th>
                        <th>Files Changed</th>
                    </tr>
                    ${authors.map(author => `
                        <tr>
                            <td>${author.author}</td>
                            <td>${author.totalCommits}</td>
                            <td>${author.totalInsertions}</td>
                            <td>${author.totalDeletions}</td>
                            <td>${author.totalFiles}</td>
                        </tr>
                    `).join('')}
                </table>
            </div>

            <script>
                const commitCtx = document.getElementById('commitChart').getContext('2d');
                new Chart(commitCtx, {
                    type: 'line',
                    data: ${JSON.stringify(commitData)},
                    options: {
                        responsive: true,
                        scales: {
                            y: {
                                beginAtZero: true
                            }
                        }
                    }
                });

                const changeCtx = document.getElementById('changeChart').getContext('2d');
                new Chart(changeCtx, {
                    type: 'bar',
                    data: ${JSON.stringify(changeData)},
                    options: {
                        responsive: true,
                        scales: {
                            y: {
                                beginAtZero: true
                            }
                        }
                    }
                });
            </script>
        </body>
        </html>`;
    }
    getAllDates(stats) {
        const dateSet = new Set();
        Object.values(stats).forEach(authorStats => {
            Object.keys(authorStats.dailyStats).forEach(date => dateSet.add(date));
        });
        return Array.from(dateSet).sort();
    }
    prepareCommitData(authors, dates) {
        const datasets = authors.map((author, index) => ({
            label: author.author,
            data: dates.map(date => author.dailyStats[date]?.commits || 0),
            borderColor: this.getColor(index),
            fill: false
        }));
        return {
            labels: dates,
            datasets
        };
    }
    prepareChangeData(authors, dates) {
        const datasets = authors.map((author, index) => ({
            label: author.author,
            data: dates.map(date => {
                const stats = author.dailyStats[date];
                return stats ? stats.insertions + stats.deletions : 0;
            }),
            backgroundColor: this.getColor(index),
        }));
        return {
            labels: dates,
            datasets
        };
    }
    getColor(index) {
        const colors = [
            '#FF6384',
            '#36A2EB',
            '#FFCE56',
            '#4BC0C0',
            '#9966FF',
            '#FF9F40'
        ];
        return colors[index % colors.length];
    }
}
exports.ContributionVisualization = ContributionVisualization;
//# sourceMappingURL=visualization.js.map