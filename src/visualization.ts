import * as vscode from 'vscode';
import * as path from 'path';
import { AuthorStats } from './gitAnalyzer';
import moment from 'moment';

export class ContributionVisualization {
    private panel: vscode.WebviewPanel | undefined;
    private extensionUri: vscode.Uri;
    private timeRangeChangeCallback?: (days: number) => void;
    private disposables: vscode.Disposable[] = [];

    constructor(extensionUri: vscode.Uri) {
        this.extensionUri = extensionUri;
    }

    public dispose() {
        this.panel?.dispose();
        this.disposables.forEach(d => d.dispose());
    }

    public onTimeRangeChange(callback: (days: number) => void) {
        this.timeRangeChangeCallback = callback;
    }

    public async updateStats(stats: { [author: string]: AuthorStats }) {
        if (!this.panel) {
            return;
        }

        const authors = Object.values(stats);
        const dates = this.getAllDates(stats);
        
        // 准备数据
        const commitData = this.prepareCommitData(authors, dates);
        const changeData = this.prepareChangeData(authors, dates);

        // 更新图表数据
        if (this.panel?.webview) {
            this.panel.webview.postMessage({
                command: 'updateData',
                commitData,
                changeData
            });
        }
    }

    public async show(stats: { [author: string]: AuthorStats }) {
        console.log('Showing contribution stats:', stats);
        
        if (this.panel) {
            this.panel.reveal();
        } else {
            this.panel = vscode.window.createWebviewPanel(
                'codeActivityStats',
                'Code Activity Statistics',
                vscode.ViewColumn.One,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true,
                    localResourceRoots: [this.extensionUri]
                }
            );

            this.panel.onDidDispose(() => {
                this.panel = undefined;
            }, null, this.disposables);
            
            // 添加消息监听器
            this.panel.webview.onDidReceiveMessage(
                message => {
                    switch (message.command) {
                        case 'timeRangeChanged':
                            const days = message.days;
                            const startDate = moment.utc(Object.values(stats)[0]?.startDate);
                            const endDate = moment.utc(startDate).add(days, 'days');
                            const newDates = [];
                            let currentDate = startDate.clone();
                            while (currentDate.isSameOrBefore(endDate)) {
                                newDates.push(currentDate.format('YYYY-MM-DD'));
                                currentDate.add(1, 'day');
                            }
                            const newCommitData = this.prepareCommitData(Object.values(stats), newDates);
                            const newChangeData = this.prepareChangeData(Object.values(stats), newDates);
                            if (this.panel?.webview) {
                                this.panel.webview.postMessage({
                                    command: 'updateData',
                                    commitData: newCommitData,
                                    changeData: newChangeData
                                });
                            }
                            if (this.timeRangeChangeCallback) {
                                this.timeRangeChangeCallback(message.days);
                            }
                            break;
                    }
                },
                undefined,
                this.disposables
            );
        }

        const dates = this.getAllDates(stats);
        console.log('Generated dates:', dates);
        
        const commitData = this.prepareCommitData(Object.values(stats), dates);
        console.log('Prepared commit data:', commitData);
        
        const changeData = this.prepareChangeData(Object.values(stats), dates);
        console.log('Prepared change data:', changeData);

        if (this.panel) {
            this.panel.webview.html = this.getWebviewContent(stats);
        }
    }

    private getWebviewContent(stats: { [author: string]: AuthorStats }): string {
        const authors = Object.values(stats);
        const dates = this.getAllDates(stats);
        
        // 准备数据
        const commitData = this.prepareCommitData(authors, dates);
        const changeData = this.prepareChangeData(authors, dates);

        return `<!DOCTYPE html>
        <html>
        <head>
            <title>Code Activity Statistics</title>
            <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
            <style>
                :root {
                    --vscode-dropdown-background: var(--vscode-input-background);
                    --vscode-dropdown-foreground: var(--vscode-input-foreground);
                    --vscode-dropdown-border: var(--vscode-input-border);
                }
                .container {
                    padding: 20px;
                    max-width: 1200px;
                    margin: 0 auto;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                }
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 20px;
                }
                .time-range-selector {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    background-color: var(--vscode-dropdown-background);
                    padding: 8px 12px;
                    border-radius: 4px;
                }
                .time-range-selector select {
                    padding: 4px 8px;
                    border: 1px solid var(--vscode-dropdown-border);
                    border-radius: 4px;
                    background-color: var(--vscode-dropdown-background);
                    color: var(--vscode-dropdown-foreground);
                    font-size: 14px;
                    cursor: pointer;
                }
                .time-range-selector select:hover {
                    border-color: var(--vscode-focusBorder);
                }
                .time-range-info {
                    background-color: var(--vscode-dropdown-background);
                    padding: 10px;
                    border-radius: 4px;
                    margin-bottom: 20px;
                    font-size: 14px;
                }
                .chart-container {
                    margin-bottom: 30px;
                    background-color: var(--vscode-editor-background);
                    padding: 15px;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    height: 400px;
                    position: relative;
                }
                .summary-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 20px;
                }
                .summary-table th, .summary-table td {
                    border: 1px solid var(--vscode-dropdown-border);
                    padding: 8px;
                    text-align: left;
                }
                .summary-table th {
                    background-color: var(--vscode-dropdown-background);
                }
                .chart-title {
                    margin-bottom: 15px;
                    color: var(--vscode-foreground);
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Code Activity Statistics</h1>
                    <div class="time-range-selector">
                        <label for="timeRange">Time Range:</label>
                        <select id="timeRange">
                            <option value="7">Last Week</option>
                            <option value="30">Last Month</option>
                            <option value="90">Last 3 Months</option>
                            <option value="180">Last 6 Months</option>
                            <option value="365">Last Year</option>
                        </select>
                    </div>
                </div>
                
                <div class="time-range-info">
                    <p>Statistics from ${authors[0]?.startDate?.format('YYYY-MM-DD')} to ${authors[0]?.endDate?.format('YYYY-MM-DD')}</p>
                </div>

                <div class="chart-container">
                    <h2 class="chart-title">Daily Commits</h2>
                    <canvas id="commitChart"></canvas>
                </div>
                
                <div class="chart-container">
                    <h2 class="chart-title">Code Changes</h2>
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
                (function() {
                    // 时间范围选择处理
                    const timeRangeSelect = document.getElementById('timeRange');
                    timeRangeSelect.addEventListener('change', (event) => {
                        const days = event.target.value;
                        // 发送消息到 VS Code
                        vscode.postMessage({
                            command: 'timeRangeChanged',
                            days: parseInt(days)
                        });
                    });

                    // 获取 vscode API
                    const vscode = acquireVsCodeApi();

                    // 解析数据
                    const commitData = ${JSON.stringify(commitData)};
                    const changeData = ${JSON.stringify(changeData)};

                    console.log('Commit data:', commitData);
                    console.log('Change data:', changeData);

                    // 创建提交图表
                    const commitCtx = document.getElementById('commitChart');
                    if (commitCtx) {
                        console.log('Creating commit chart...');
                        new Chart(commitCtx, {
                            type: 'line',
                            data: commitData,
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                interaction: {
                                    intersect: false,
                                    mode: 'index'
                                },
                                plugins: {
                                    legend: {
                                        position: 'top',
                                    },
                                    tooltip: {
                                        callbacks: {
                                            label: function(context) {
                                                return \`\${context.dataset.label}: \${context.raw} commits\`;
                                            }
                                        }
                                    }
                                },
                                scales: {
                                    x: {
                                        title: {
                                            display: true,
                                            text: 'Date'
                                        },
                                        ticks: {
                                            maxRotation: 45,
                                            minRotation: 45
                                        }
                                    },
                                    y: {
                                        beginAtZero: true,
                                        title: {
                                            display: true,
                                            text: 'Number of Commits'
                                        }
                                    }
                                }
                            }
                        });
                    } else {
                        console.error('Could not find commit chart canvas');
                    }

                    // 创建变更图表
                    const changeCtx = document.getElementById('changeChart');
                    if (changeCtx) {
                        console.log('Creating change chart...');
                        new Chart(changeCtx, {
                            type: 'bar',
                            data: changeData,
                            options: {
                                responsive: true,
                                maintainAspectRatio: false,
                                interaction: {
                                    intersect: false,
                                    mode: 'index'
                                },
                                plugins: {
                                    legend: {
                                        position: 'top',
                                    },
                                    tooltip: {
                                        callbacks: {
                                            label: function(context) {
                                                return \`\${context.dataset.label}: \${context.raw} lines changed\`;
                                            }
                                        }
                                    }
                                },
                                scales: {
                                    x: {
                                        title: {
                                            display: true,
                                            text: 'Date'
                                        },
                                        ticks: {
                                            maxRotation: 45,
                                            minRotation: 45
                                        }
                                    },
                                    y: {
                                        beginAtZero: true,
                                        title: {
                                            display: true,
                                            text: 'Lines Changed'
                                        }
                                    }
                                }
                            }
                        });
                    } else {
                        console.error('Could not find change chart canvas');
                    }

                    // 监听来自 VS Code 的消息
                    window.addEventListener('message', (event) => {
                        if (event.data.command === 'updateData') {
                            commitData.labels = event.data.commitData.labels;
                            commitData.datasets = event.data.commitData.datasets;
                            changeData.labels = event.data.changeData.labels;
                            changeData.datasets = event.data.changeData.datasets;

                            // 更新图表
                            const commitChart = Chart.getChart('commitChart');
                            if (commitChart) {
                                commitChart.data = commitData;
                                commitChart.update();
                            }

                            const changeChart = Chart.getChart('changeChart');
                            if (changeChart) {
                                changeChart.data = changeData;
                                changeChart.update();
                            }
                        }
                    });
                })();
            </script>
        </body>
        </html>`;
    }

    private getAllDates(stats: { [author: string]: AuthorStats }): string[] {
        const startDate = moment.utc(Object.values(stats)[0]?.startDate);
        const endDate = moment.utc(Object.values(stats)[0]?.endDate);
        const dates: string[] = [];
        
        console.log('Date range:', startDate.format(), 'to', endDate.format());
        
        let currentDate = startDate.clone();
        while (currentDate.isSameOrBefore(endDate)) {
            dates.push(currentDate.format('YYYY-MM-DD'));
            currentDate.add(1, 'day');
        }
        
        return dates;
    }

    private prepareCommitData(authors: AuthorStats[], dates: string[]) {
        // 过滤掉 stash 相关的作者
        authors = authors.filter(author => 
            !author.author.toLowerCase().includes('stash')
        );

        const datasets = authors.map((author, index) => ({
            label: author.author,
            data: dates.map(date => author.dailyStats[date]?.commits || 0),
            borderColor: this.getColor(index),
            backgroundColor: this.getColor(index),
            fill: false
        }));

        return {
            labels: dates,
            datasets
        };
    }

    private prepareChangeData(authors: AuthorStats[], dates: string[]) {
        // 过滤掉 stash 相关的作者
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
            stack: 'combined'
        }));

        return {
            labels: dates,
            datasets
        };
    }

    private getColor(index: number): string {
        const colors = [
            '#2196F3', // Blue
            '#4CAF50', // Green
            '#F44336', // Red
            '#FFC107', // Amber
            '#9C27B0', // Purple
            '#00BCD4', // Cyan
            '#FF9800', // Orange
            '#795548', // Brown
            '#607D8B', // Blue Grey
            '#E91E63'  // Pink
        ];
        return colors[index % colors.length];
    }
}
