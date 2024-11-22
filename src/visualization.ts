import * as vscode from 'vscode';
import * as path from 'path';
import { AuthorStats } from './gitAnalyzer';

export class ContributionVisualization {
    private context: vscode.ExtensionContext;
    private panel: vscode.WebviewPanel | undefined;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    public showContributionStats(stats: { [author: string]: AuthorStats }) {
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

        this.panel.webview.html = this.getWebviewContent(stats);
    }

    private getWebviewContent(stats: { [author: string]: AuthorStats }): string {
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
                
                <div class="time-range-info">
                    <p>Statistics from ${stats[Object.keys(stats)[0]]?.startDate?.format('YYYY-MM-DD')} to ${stats[Object.keys(stats)[0]]?.endDate?.format('YYYY-MM-DD')}</p>
                </div>

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

    private getAllDates(stats: { [author: string]: AuthorStats }): string[] {
        const dateSet = new Set<string>();
        Object.values(stats).forEach(authorStats => {
            Object.keys(authorStats.dailyStats).forEach(date => dateSet.add(date));
        });
        return Array.from(dateSet).sort();
    }

    private prepareCommitData(authors: AuthorStats[], dates: string[]) {
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

    private prepareChangeData(authors: AuthorStats[], dates: string[]) {
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

    private getColor(index: number): string {
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
