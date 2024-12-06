import * as vscode from 'vscode';
import * as path from 'path';
import { AuthorStats, GitContributionAnalyzer } from './gitAnalyzer';
import moment from 'moment';

export class ContributionVisualization {
    private panel: vscode.WebviewPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    private timeRangeChangeCallback?: (days: number) => void;
    private analyzer: GitContributionAnalyzer;

    constructor(private context: vscode.ExtensionContext, analyzer: GitContributionAnalyzer) {
        this.analyzer = analyzer;
    }

    public dispose() {
        this.panel?.dispose();
        this.disposables.forEach(d => d.dispose());
    }

    public onTimeRangeChange(callback: (days: number) => void) {
        this.timeRangeChangeCallback = callback;
    }

    public async update(stats: { [author: string]: AuthorStats }) {
        if (!this.panel) {
            return;
        }

        // 更新图表数据
        await this.updateVisualization(stats);
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

    private async updateVisualization(stats: { [author: string]: AuthorStats }) {
        if (!this.panel) {
            return;
        }

        const authors = Object.values(stats);
        const dates = this.getAllDates(stats);

        // 准备数据
        const commitData = this.prepareCommitData(authors, dates);
        const changeData = this.prepareChangeData(authors, dates);

        // 更新图表数据
        if (this.panel) {
            await this.panel.webview.postMessage({
                command: 'updateData',
                commitData: commitData,
                changeData: changeData
            });
        }
    }

    private async handleTimeRangeChange(days: number, startDate?: string, endDate?: string) {
        try {
            // 获取新的统计数据
            const stats = await this.analyzer.getContributionStats(days, startDate, endDate);
            // 更新可视化
            await this.update(stats);
        } catch (error) {
            console.error('Error updating time range:', error);
        }
    }

    public async show(stats: { [author: string]: AuthorStats }) {
        console.log('Showing contribution stats:', stats);

        if (this.panel) {
            this.panel.reveal();
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

            this.panel.onDidDispose(() => {
                this.panel = undefined;
            }, null, this.disposables);

            // 添加消息监听器
            this.panel.webview.onDidReceiveMessage(
                async message => {
                    switch (message.command) {
                        case 'timeRangeChanged':
                            await this.handleTimeRangeChange(message.days, message.startDate, message.endDate);
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
            this.panel.webview.html = this.getWebviewContent(stats, commitData, changeData);
        }
    }

    private getWebviewContent(stats: { [author: string]: AuthorStats }, commitData: any, changeData: any): string {
        const authors = Object.values(stats);
        const dates = this.getAllDates(stats);

        // 使用最后一次commit日期作为结束日期，往前推7天作为开始日期
        const endDate = moment(authors[0]?.endDate).format('YYYY-MM-DD');
        const startDate = moment(authors[0]?.endDate).subtract(6, 'days').format('YYYY-MM-DD');

        return `<!DOCTYPE html>
        <html>
        <head>
            <title>Git Stats</title>
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
                    padding: 4px 8px;
                    border-radius: 4px;
                }
                .date-picker {
                    background-color: var(--vscode-dropdown-background);
                    color: var(--vscode-dropdown-foreground);
                    border: 1px solid var(--vscode-dropdown-border);
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 13px;
                }
                .date-separator {
                    color: var(--vscode-foreground);
                    margin: 0 4px;
                }
                .chart-container {
                    position: relative;
                    height: 400px;
                    margin-bottom: 20px;
                    background-color: var(--vscode-editor-background);
                    padding: 15px;
                    border-radius: 8px;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .chart-title {
                    margin-bottom: 15px;
                    color: var(--vscode-foreground);
                    font-size: 18px;
                    font-weight: 500;
                }
                .summary-table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 20px;
                    margin-bottom: 30px;
                    background-color: var(--vscode-editor-background);
                    border-radius: 8px;
                    overflow: hidden;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .summary-table th, .summary-table td {
                    padding: 12px;
                    text-align: left;
                    border: 1px solid var(--vscode-dropdown-border);
                }
                .summary-table th {
                    background-color: var(--vscode-dropdown-background);
                    font-weight: 500;
                }
                .summary-table tr:hover {
                    background-color: var(--vscode-list-hoverBackground);
                }
                .pie-chart-container {
                    position: absolute;
                    top: 100px;
                    left: 100px;
                    width: 150px;
                    height: 150px;
                    background-color: rgba(255, 255, 255, 0.05);
                    border-radius: 8px;
                    cursor: move;
                    z-index: 1000;
                    backdrop-filter: blur(3px);
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.08);
                }
                .pie-chart-container:hover {
                    box-shadow: 0 6px 12px rgba(0, 0, 0, 0.15);
                }
                select {
                    background-color: var(--vscode-dropdown-background);
                    color: var(--vscode-dropdown-foreground);
                    border: 1px solid var(--vscode-dropdown-border);
                    padding: 4px 8px;
                    border-radius: 4px;
                    font-size: 13px;
                }
                select:focus {
                    outline: none;
                    border-color: var(--vscode-focusBorder);
                }
                h1 {
                    margin: 0;
                    font-size: 24px;
                    color: var(--vscode-foreground);
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>Git Stats</h1>
                    <div class="time-range-selector">
                        <input type="date" id="startDate" class="date-picker" title="Start Date">
                        <span class="date-separator">to</span>
                        <input type="date" id="endDate" class="date-picker" title="End Date">
                        <select id="timeRange">
                            <option value="custom" selected>Custom Range</option>
                            <option value="7">Last Week</option>
                            <option value="30">Last Month</option>
                            <option value="90">Last 3 Months</option>
                            <option value="180">Last 6 Months</option>
                            <option value="365">Last Year</option>
                        </select>
                    </div>
                </div>
                <div class="chart-container">
                    <div class="pie-chart-container">
                        <canvas id="pieChart"></canvas>
                    </div>
                    <h2 class="chart-title">Commits</h2>
                    <canvas id="commitChart"></canvas>
                </div>
                <div class="chart-container">
                    <div class="pie-chart-container">
                        <canvas id="linesChangedPieChart"></canvas>
                    </div>
                    <h2 class="chart-title">Lines Changed</h2>
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
                    ` + authors.map(author => `
                        <tr>
                            <td>` + author.author + `</td>
                            <td>` + author.totalCommits + `</td>
                            <td>` + author.totalInsertions + `</td>
                            <td>` + author.totalDeletions + `</td>
                            <td>` + author.totalFiles + `</td>
                        </tr>
                    `).join('') + `
                </table>
            </div>
            <script>
                // 拖动功能
                const pieChartContainers = document.querySelectorAll('.pie-chart-container');
                let isDragging = false;
                let currentX;
                let currentY;
                let initialX;
                let initialY;
                let activePieChart = null;

                pieChartContainers.forEach(container => {
                    container.addEventListener('mousedown', (e) => {
                        activePieChart = container;
                        dragStart(e);
                    });
                });
                
                document.addEventListener('mousemove', drag);
                document.addEventListener('mouseup', dragEnd);

                function dragStart(e) {
                    if (!activePieChart) return;
                    initialX = e.clientX - activePieChart.offsetLeft;
                    initialY = e.clientY - activePieChart.offsetTop;
                    isDragging = true;
                }

                function drag(e) {
                    if (isDragging && activePieChart) {
                        e.preventDefault();
                        currentX = e.clientX - initialX;
                        currentY = e.clientY - initialY;
                        
                        // 限制在图表区域内
                        const container = activePieChart.closest('.chart-container');
                        const maxX = container.offsetWidth - activePieChart.offsetWidth;
                        const maxY = container.offsetHeight - activePieChart.offsetHeight;
                        
                        currentX = Math.max(0, Math.min(currentX, maxX));
                        currentY = Math.max(0, Math.min(currentY, maxY));

                        activePieChart.style.left = currentX + 'px';
                        activePieChart.style.top = currentY + 'px';
                    }
                }

                function dragEnd() {
                    isDragging = false;
                    activePieChart = null;
                }

                const vscode = acquireVsCodeApi();
                let commitChart, changeChart, pieChart, linesChangedPieChart;

                // 解析数据
                const commitData = ${JSON.stringify(commitData)};
                const changeData = ${JSON.stringify(changeData)};

                // 设置初始日期范围
                document.getElementById('startDate').value = '${startDate}';
                document.getElementById('endDate').value = '${endDate}';
                document.getElementById('timeRange').value = 'custom';  // 固定显示为Custom Range

                // 创建图表函数
                function createCommitChart(data) {
                    const ctx = document.getElementById('commitChart');
                    if (commitChart) {
                        commitChart.destroy();
                    }
                    commitChart = new Chart(ctx, {
                        type: 'line',
                        data: data,
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
                                            return context.dataset.label + ': ' + context.raw + ' commits';
                                        }
                                    }
                                }
                            },
                            elements: {
                                line: {
                                    tension: 0.4,
                                    cubicInterpolationMode: 'monotone'
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
                }

                function createChangeChart(data) {
                    const ctx = document.getElementById('changeChart');
                    if (changeChart) {
                        changeChart.destroy();
                    }
                    changeChart = new Chart(ctx, {
                        type: 'bar',
                        data: data,
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
                                            return context.dataset.label + ': ' + context.raw + ' lines changed';
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
                }

                function createPieChart(data) {
                    const ctx = document.getElementById('pieChart');
                    const totalCommits = data.datasets.reduce((acc, dataset) => {
                        return acc + dataset.data.reduce((sum, val) => sum + val, 0);
                    }, 0);
                    
                    const pieData = {
                        labels: data.datasets.map(d => d.label),
                        datasets: [{
                            data: data.datasets.map(d => 
                                d.data.reduce((sum, val) => sum + val, 0)
                            ),
                            backgroundColor: data.datasets.map(d => d.backgroundColor),
                            borderColor: 'rgba(0, 0, 0, 0.1)',
                            borderWidth: 1
                        }]
                    };

                    if (pieChart) {
                        pieChart.destroy();
                    }

                    pieChart = new Chart(ctx, {
                        type: 'pie',
                        data: pieData,
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: {
                                    display: false
                                },
                                tooltip: {
                                    callbacks: {
                                        label: function(context) {
                                            const value = context.raw;
                                            const percentage = ((value / totalCommits) * 100).toFixed(1);
                                            return [
                                                context.label,
                                                'Commits: ' + value,
                                                'Percentage: ' + percentage + '%'
                                            ];
                                        }
                                    }
                                }
                            }
                        }
                    });
                }

                function createLinesChangedPieChart(data) {
                    const ctx = document.getElementById('linesChangedPieChart');
                    const totalLines = data.datasets.reduce((acc, dataset) => {
                        return acc + dataset.data.reduce((sum, val) => sum + val, 0);
                    }, 0);
                    
                    const pieData = {
                        labels: data.datasets.map(d => d.label),
                        datasets: [{
                            data: data.datasets.map(d => 
                                d.data.reduce((sum, val) => sum + val, 0)
                            ),
                            backgroundColor: data.datasets.map(d => d.backgroundColor),
                            borderColor: 'rgba(0, 0, 0, 0.1)',
                            borderWidth: 1
                        }]
                    };

                    if (linesChangedPieChart) {
                        linesChangedPieChart.destroy();
                    }

                    linesChangedPieChart = new Chart(ctx, {
                        type: 'pie',
                        data: pieData,
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            plugins: {
                                legend: {
                                    display: false
                                },
                                tooltip: {
                                    callbacks: {
                                        label: function(context) {
                                            const value = context.raw;
                                            const percentage = ((value / totalLines) * 100).toFixed(1);
                                            return [
                                                context.label,
                                                'Lines Changed: ' + value,
                                                'Percentage: ' + percentage + '%'
                                            ];
                                        }
                                    }
                                }
                            }
                        }
                    });
                }

                // 初始化所有图表
                createCommitChart(commitData);
                createChangeChart(changeData);
                createPieChart(commitData);
                createLinesChangedPieChart(changeData);

                // 监听来自 VS Code 的消息
                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.command) {
                        case 'updateData':
                            // 更新所有图表
                            if (commitChart) {
                                commitChart.data = message.commitData;
                                commitChart.update();
                                createPieChart(message.commitData);
                            }
                            if (changeChart) {
                                changeChart.data = message.changeData;
                                changeChart.update();
                                createLinesChangedPieChart(message.changeData);
                            }
                            break;
                    }
                });

                // 时间范围选择处理
                const timeRangeSelect = document.getElementById('timeRange');
                const startDateInput = document.getElementById('startDate');
                const endDateInput = document.getElementById('endDate');

                // 时间范围选择变化处理
                timeRangeSelect.addEventListener('change', function(e) {
                    const value = this.value;
                    if (value === 'custom') {
                        return; // 保持当前选择的日期不变
                    }

                    const days = parseInt(value);
                    const end = new Date();
                    const start = new Date();
                    start.setDate(end.getDate() - (days - 1)); // -1是因为包含今天

                    startDateInput.value = start.toISOString().split('T')[0];
                    endDateInput.value = end.toISOString().split('T')[0];

                    // 通知扩展时间范围已更改
                    vscode.postMessage({
                        command: 'timeRangeChanged',
                        days: days,
                        startDate: startDateInput.value,
                        endDate: endDateInput.value
                    });
                });

                // 日期选择变化处理
                function handleDateChange() {
                    const start = new Date(startDateInput.value);
                    const end = new Date(endDateInput.value);
                    
                    if (start && end && start <= end) {
                        // 计算天数差异
                        const diffTime = Math.abs(end - start);
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 包含开始日期
                        
                        // 设置下拉框为custom
                        timeRangeSelect.value = 'custom';
                        
                        // 通知扩展时间范围已更改
                        vscode.postMessage({
                            command: 'timeRangeChanged',
                            days: diffDays,
                            startDate: startDateInput.value,
                            endDate: endDateInput.value
                        });
                    }
                }

                startDateInput.addEventListener('change', handleDateChange);
                endDateInput.addEventListener('change', handleDateChange);
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
            fill: false,
            tension: 0.4,  // 添加曲线张力
            cubicInterpolationMode: 'monotone'  // 使用单调的三次插值
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
