import * as vscode from 'vscode';
import * as path from 'path';
import { AuthorStats } from './gitAnalyzer';
import moment from 'moment';

export class ContributionVisualization {
    private context: vscode.ExtensionContext;
    private panel: vscode.WebviewPanel | undefined;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public showContributionStats(stats: { [author: string]: AuthorStats }) {
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
                    retainContextWhenHidden: true
                }
            );

            this.panel.onDidDispose(() => {
                this.panel = undefined;
            });
        }

        const dates = this.getAllDates(stats);
        console.log('Generated dates:', dates);
        
        const commitData = this.prepareCommitData(Object.values(stats), dates);
        console.log('Prepared commit data:', commitData);
        
        const changeData = this.prepareChangeData(Object.values(stats), dates);
        console.log('Prepared change data:', changeData);

        this.panel.webview.html = this.getWebviewContent(stats);
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
                .container {
                    padding: 20px;
                    max-width: 1200px;
                    margin: 0 auto;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                }
                .time-range-info {
                    background-color: #f5f5f5;
                    padding: 10px;
                    border-radius: 4px;
                    margin-bottom: 20px;
                }
                .chart-container {
                    margin-bottom: 30px;
                    background-color: white;
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
                    border: 1px solid #ddd;
                    padding: 8px;
                    text-align: left;
                }
                .summary-table th {
                    background-color: #f5f5f5;
                }
                .chart-title {
                    margin-bottom: 15px;
                    color: #333;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Code Activity Statistics</h1>
                
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
                // 设置默认样式
                Chart.defaults.color = '#333';
                Chart.defaults.font.family = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, Cantarell, "Open Sans", "Helvetica Neue", sans-serif';

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
        console.log('Preparing commit data for authors:', authors.map(a => a.author));
        console.log('Dates:', dates);

        const datasets = authors.map((author, index) => {
            const data = dates.map(date => {
                const stats = author.dailyStats[date];
                const commits = stats ? stats.commits : 0;
                console.log(`${author.author} on ${date}: ${commits} commits`);
                return commits;
            });

            const totalCommits = data.reduce((sum, val) => sum + val, 0);
            console.log(`${author.author} total commits: ${totalCommits}`);

            return {
                label: `${author.author} (${totalCommits} commits)`,
                data: data,
                borderColor: this.getColor(index),
                backgroundColor: this.getColor(index),
                tension: 0.4,
                fill: false
            };
        });

        return {
            labels: dates,
            datasets
        };
    }

    private prepareChangeData(authors: AuthorStats[], dates: string[]) {
        console.log('Preparing change data for authors:', authors.map(a => a.author));
        console.log('Dates:', dates);

        const datasets = authors.map((author, index) => {
            const data = dates.map(date => {
                const stats = author.dailyStats[date];
                const changes = stats ? stats.insertions + stats.deletions : 0;
                console.log(`${author.author} on ${date}: ${changes} changes`);
                return changes;
            });

            const totalChanges = data.reduce((sum, val) => sum + val, 0);
            console.log(`${author.author} total changes: ${totalChanges}`);

            return {
                label: `${author.author} (${totalChanges} lines changed)`,
                data: data,
                backgroundColor: this.getColor(index),
                borderColor: this.getColor(index),
                borderWidth: 1
            };
        });

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
