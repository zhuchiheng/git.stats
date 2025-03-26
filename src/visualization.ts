import * as vscode from 'vscode';
import * as path from 'path';
import { AuthorStats, GitContributionAnalyzer } from './gitAnalyzer';
import moment from 'moment';

export class ContributionVisualization {
    private panel: vscode.WebviewPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    private webview: vscode.Webview | undefined;

    constructor(private context: vscode.ExtensionContext, private analyzer: GitContributionAnalyzer) {

    }

    public dispose() {
        this.panel?.dispose();
        this.disposables.forEach(d => d.dispose());
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
        const hours = this.getHoursArray();

        // 准备数据
        const commitData = this.prepareCommitData(authors, dates);
        const changeData = this.prepareChangeData(authors, dates);
        const hourlyCommitData = this.prepareHourlyCommitData(authors, hours);
        const hourlyChangeData = this.prepareHourlyChangeData(authors, hours);       

        // 更新图表数据
        if (this.panel?.webview) {
            this.panel.webview.postMessage({
                command: 'updateData',
                commitData,
                changeData,
                hourlyCommitData,
                hourlyChangeData
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

        // 准备数据
        const commitData = this.prepareCommitData(authors, dates);
        const changeData = this.prepareChangeData(authors, dates);
        const hourlyCommitData = this.prepareHourlyCommitData(authors, hours);
        const hourlyChangeData = this.prepareHourlyChangeData(authors, hours);
        const calendarData = this.prepareCalendarData(authors, dates); // 新增日历数据

        // 准备作者统计信息
        const authorStats = authors.map(author => ({
            author: author.author,
            totalCommits: author.totalCommits || 0,
            totalInsertions: author.totalInsertions || 0,
            totalDeletions: author.totalDeletions || 0,
            totalFiles: author.totalFiles || 0
        }));

        // 更新图表数据
        if (this.panel) {
            await this.panel.webview.postMessage({
                command: 'updateData',
                commitData: commitData,
                changeData: changeData,
                hourlyCommitData: hourlyCommitData,
                hourlyChangeData: hourlyChangeData,
                authorStats: authorStats,
                calendarData // 新增日历数据
            });
        }
    }

    private globalCache: { [author: string]: AuthorStats } = {};

    public async handleTimeRangeChange(days: number, startDate?: string, endDate?: string) {
        try {
            // 获取完整的时间范围数据并缓存
            this.globalCache = await this.analyzer.getContributionStats(days, startDate, endDate);
            
            // 发送更新命令，包含新的开发者列表
            if (this.panel?.webview) {
                const authors = Object.keys(this.globalCache).filter(a => !a.toLowerCase().includes('stash'));
                this.panel.webview.postMessage({
                    command: 'updateDevelopers',
                    developers: authors
                });
            }
            
            // 应用当前开发者过滤
            await this.applyDeveloperFilter();
        } catch (error) {
            console.error('Error updating time range:', error);
        }
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

    public async show(stats: { [author: string]: AuthorStats }) {
        console.log('Showing contribution stats:', stats);

        // 初始化全局缓存
        this.globalCache = stats;

        if (this.panel) {
            this.webview = this.panel.webview;
            this.panel.reveal();
            
            // 发送开发者列表
            const authors = Object.keys(stats);
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

            // 添加消息监听器
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

        const hourlyCommitData = this.prepareHourlyCommitData(Object.values(stats), this.getHoursArray());
        console.log('Prepared hourly commit data:', hourlyCommitData);

        const hourlyChangeData = this.prepareHourlyChangeData(Object.values(stats), this.getHoursArray());
        console.log('Prepared hourly change data:', hourlyChangeData);

        if (this.panel) {
            this.panel.webview.html = this.getWebviewContent(stats, commitData, changeData, hourlyCommitData, hourlyChangeData);
        }
    }

    private async handleDeveloperChange(developer: string) {
        try {
            // 直接从缓存过滤数据
            await this.applyDeveloperFilter(developer);
        } catch (error) {
            console.error('Error updating developer:', error);
        }
    }

    private getWebviewContent(stats: { [author: string]: AuthorStats }, commitData: any, changeData: any, hourlyCommitData: any, hourlyChangeData: any): string {
        const authors = Object.values(stats);
        const dates = this.getAllDates(stats);
        
        // 获取默认日期范围
        const firstAuthor = authors[0];
        const startDate = firstAuthor?.startDate.format('YYYY-MM-DD') || moment().subtract(6, 'days').format('YYYY-MM-DD');
        const endDate = firstAuthor?.endDate.format('YYYY-MM-DD') || moment().format('YYYY-MM-DD');

        // 准备日历数据
        const calendarData = this.prepareCalendarData(authors, dates);

        return `<!DOCTYPE html>
        <html>
        <head>
            <title>Git Stats</title>
            <script src="${this.webview!.asWebviewUri(vscode.Uri.joinPath(this.context!.extensionUri, 'node_modules', 'chart.js', 'dist', 'chart.umd.js'))}"></script>
            <style>
                :root {
                    --vscode-dropdown-background: var(--vscode-input-background);
                    --vscode-dropdown-foreground: var(--vscode-input-foreground);
                    --vscode-dropdown-border: var(--vscode-input-border);
                }
                .container {
                    padding: 20px;
                    max-width: 1600px;
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
                .calendar-container {
                    position: relative;
                    height: 900px;
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
                    <div class="developer-selector"> <!-- 新增开发者选择器 -->
                        <select id="developerSelect">
                            <option value="all">All developers</option>
                            ${authors.map(author => 
                                '<option value="' + author.author + '">' + author.author + '</option>'
                            ).join('')}
                        </select>
                    </div>
                </div>
                <!-- Daily Charts -->
                <div class="chart-container">
                    <div class="pie-chart-container">
                        <canvas id="pieChart"></canvas>
                    </div>
                    <h2 class="chart-title">Daily Commits</h2>
                    <canvas id="commitChart"></canvas>
                </div>
                <div class="chart-container">
                    <div class="pie-chart-container">
                        <canvas id="linesChangedPieChart"></canvas>
                    </div>
                    <h2 class="chart-title">Daily Lines Changed</h2>
                    <canvas id="changeChart"></canvas>
                </div>

                <!-- Hourly Charts -->
                <div class="chart-container">
                    <h2 class="chart-title">Hourly Commits</h2>
                    <canvas id="hourlyCommitChart"></canvas>
                </div>
                <div class="chart-container">
                    <h2 class="chart-title">Hourly Lines Changes</h2>
                    <canvas id="hourlyChangeChart"></canvas>
                </div>

                <!-- 日历图表 -->
                <div class="calendar-container">
                    <h2 class="chart-title">Contribution Calendar</h2>
                    <div id="calendar" style="display: grid; grid-template-columns: repeat(6, 1fr); gap: 4px; max-height: 800px; overflow-y: auto; padding: 4px;"></div>
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
                const hourlyCommitData = ${JSON.stringify(hourlyCommitData)};
                const hourlyChangeData = ${JSON.stringify(hourlyChangeData)};

                // 设置初始日期范围
                const today = new Date();
                today.setHours(0, 0, 0, 0);  // 设置时间为当天的0点
                const lastCommitDate = new Date(endDate);
                lastCommitDate.setHours(0, 0, 0, 0);  // 设置时间为当天的0点

                // 设置日期选择器默认值
                document.getElementById('startDate').value = '${startDate}';
                document.getElementById('endDate').value = '${endDate}';
                
                // 计算日期范围天数
                const start = new Date('${startDate}');
                const end = new Date('${endDate}');
                const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
                
                // 设置时间范围选择器
                if (diffDays === 7) {
                    document.getElementById('timeRange').value = '7';  // Last Week
                } else if (diffDays === 30) {
                    document.getElementById('timeRange').value = '30'; // Last Month
                } else {
                    document.getElementById('timeRange').value = 'custom';  // Custom Range
                }

                // 创建提交图表
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

                // 创建变更图表
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

                // 创建饼图
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

                // 创建Lines Changed饼图
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

                function createHourlyCommitChart(data) {
                    const ctx = document.getElementById('hourlyCommitChart');
                    const existingChart = Chart.getChart(ctx);
                    if (existingChart) {
                        existingChart.destroy();
                    }
                    
                    new Chart(ctx, {
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
                            scales: {
                                x: {
                                    title: {
                                        display: true,
                                        text: 'Hour'
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

                function createHourlyChangeChart(data) {
                    const ctx = document.getElementById('hourlyChangeChart');
                    const existingChart = Chart.getChart(ctx);
                    if (existingChart) {
                        existingChart.destroy();
                    }
                    
                    new Chart(ctx, {
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
                                        text: 'Hour'
                                    }
                                },
                                y: {
                                    beginAtZero: true,
                                    title: {
                                        display: true,
                                        text: 'Lines Changed'
                                    },
                                    stacked: true  // 启用堆叠效果
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
                createHourlyCommitChart(hourlyCommitData);  // 创建每小时提交次数图表
                createHourlyChangeChart(hourlyChangeData);  // 创建每小时代码变更行数图表

                // 更新图表数据的消息处理
                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.command) {
                        case 'updateDevelopers':
                            // 更新开发者下拉列表
                            const developerSelect = document.getElementById('developerSelect');
                            if (developerSelect && message.developers) {
                                const currentValue = developerSelect.value;
                                developerSelect.innerHTML = 
                                    '<option value="all">All developers</option>' + 
                                    message.developers.map(author => 
                                        '<option value="' + author + '">' + author + '</option>'
                                    ).join('');
                                // 保持当前选中的开发者
                                if (currentValue && message.developers.includes(currentValue)) {
                                    developerSelect.value = currentValue;
                                } else {
                                    developerSelect.value = 'all';
                                }
                            }
                            break;
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
                            
                            if (message.hourlyCommitData) {
                                createHourlyCommitChart(message.hourlyCommitData);
                            }
                            if (message.hourlyChangeData) {
                                createHourlyChangeChart(message.hourlyChangeData);
                            }

                            if (message.calendarData) {
                                renderCalendar(message.calendarData);
                            }

                            // 更新summary表格
                            const summaryTable = document.querySelector('.summary-table');
                            if (summaryTable && message.authorStats) {
                                // 保留表头
                                const tableHeader = summaryTable.querySelector('tr');
                                if (tableHeader) {
                                    summaryTable.innerHTML = '';
                                    summaryTable.appendChild(tableHeader);

                                    // 使用后端发送的准确统计数据
                                    message.authorStats.forEach(authorStat => {
                                        const row = document.createElement('tr');
                                        const cells = [
                                            authorStat.author,
                                            authorStat.totalCommits || 0,
                                            authorStat.totalInsertions || 0,
                                            authorStat.totalDeletions || 0,
                                            authorStat.totalFiles || 0
                                        ];
                                        cells.forEach(value => {
                                            const cell = document.createElement('td');
                                            cell.textContent = value.toString();
                                            row.appendChild(cell);
                                        });
                                        summaryTable.appendChild(row);
                                    });
                                }
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

                // 预定义星期标题HTML (字符串格式)
                const WEEKDAYS_HEADER_HTML = '<div style="display: grid; grid-template-columns: repeat(7, 1fr); margin-bottom: 8px; font-weight: 500;">' +
                    ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
                        .map(day => '<div style="text-align: center">' + day + '</div>')
                        .join('') +
                    '</div>';

                // 渲染日历
                function renderCalendar(calendarData) {
                    const container = document.getElementById('calendar');
                    if (!container) return;

                    // 清空容器
                    container.innerHTML = "";

                    // 创建横向日历容器
                    const calendarWrapper = document.createElement('div');
                    calendarWrapper.style.display = 'grid';
                    calendarWrapper.style.gridTemplateColumns = 'repeat(8, 1fr)';
                    calendarWrapper.style.gap = '8px';
                    calendarWrapper.style.padding = '8px';

                    // 按月份分组数据
                    const months = {};
                    calendarData.forEach(day => {
                        const date = new Date(day.date);
                        const month = date.toLocaleString('default', { month: 'long', year: 'numeric' });
                        if (!months[month]) {
                            months[month] = [];
                        }
                        months[month].push(day);
                    });

                    // 渲染每个月
                    Object.entries(months).forEach(([month, days]) => {
                        // 创建月份容器
                        const monthContainer = document.createElement('div');
                        monthContainer.style.display = 'flex';
                        monthContainer.style.flexDirection = 'column';
                        monthContainer.style.gap = '4px';

                        // 添加月份标题
                        const monthHeader = document.createElement('div');
                        monthHeader.textContent = month;
                        monthHeader.style.fontWeight = '500';
                        monthHeader.style.marginBottom = '8px';
                        monthContainer.appendChild(monthHeader);

                        // 使用预定义的星期标题
                        const weekRow = document.createElement('div');
                        weekRow.innerHTML = WEEKDAYS_HEADER_HTML;
                        monthContainer.appendChild(weekRow);

                        // 创建日期网格
                        const gridContainer = document.createElement('div');
                        gridContainer.style.display = 'grid';
                        gridContainer.style.gridTemplateColumns = 'repeat(7, 1fr)';
                        gridContainer.style.gap = '2px';

                        // 填充空白格
                        const firstDay = new Date(days[0].date);
                        const startDay = firstDay.getDay();
                        for (let i = 0; i < startDay; i++) {
                            const empty = document.createElement('div');
                            gridContainer.appendChild(empty);
                        }

                        // 添加日期格
                        days.forEach(day => {
                            const cell = document.createElement('div');
                            cell.style.backgroundColor = day.totalCommits > 0 
                                ? \`rgba(46, 204, 113, \${day.colorIntensity * 0.2})\`
                                : 'transparent';
                            cell.style.width = '24px';
                            cell.style.height = '24px';
                            cell.style.borderRadius = '4px';
                            cell.style.display = 'flex';
                            cell.style.alignItems = 'center';
                            cell.style.justifyContent = 'center';
                            cell.style.fontSize = '12px';
                            cell.title = \`Date: \${day.date}, Commits: \${day.totalCommits}\`;
                            
                            const dateNum = new Date(day.date).getDate();
                            cell.textContent = dateNum;
                            
                            gridContainer.appendChild(cell);
                        });

                        monthContainer.appendChild(gridContainer);
                        calendarWrapper.appendChild(monthContainer);
                    });

                    container.appendChild(calendarWrapper);
                }

                // 初始化日历
                const calendarData = ${JSON.stringify(calendarData)};
                renderCalendar(calendarData);

                // 新增开发者选择变化处理
                const developerSelect = document.getElementById('developerSelect');
                developerSelect.addEventListener('change', function(e) {
                    const developer = this.value;
                    vscode.postMessage({
                        command: 'developerChanged',
                        developer: developer
                    });
                });

            </script>
        </body>
        </html>`;
    }

    private getAllDates(stats: { [author: string]: AuthorStats }): string[] {
        // 不使用 UTC，保持本地时间
        const startDate = moment(Object.values(stats)[0]?.startDate).startOf('day');
        const endDate = moment(Object.values(stats)[0]?.endDate).endOf('day');
        const dates: string[] = [];

        console.log('Date range:', startDate.format('YYYY-MM-DD HH:mm:ss'), 'to', endDate.format('YYYY-MM-DD HH:mm:ss'));

        let currentDate = startDate.clone();
        // 使用 isSameOrBefore 时指定比较单位为 'day'
        while (currentDate.isSameOrBefore(endDate, 'day')) {
            dates.push(currentDate.format('YYYY-MM-DD'));
            currentDate.add(1, 'day');
        }

        return dates;
    }

    private getHoursArray(): string[] {
        return Array.from({length: 24}, (_, i) => i.toString().padStart(2, '0'));
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

    private prepareHourlyCommitData(authors: AuthorStats[], hours: string[]) {
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

    private prepareHourlyChangeData(authors: AuthorStats[], hours: string[]) {
        return {
            labels: hours.map(h => `${h}:00`),
            datasets: authors.filter(a => !a.author.toLowerCase().includes('stash')).map((author, i) => ({
                label: author.author,
                data: hours.map(h => {
                    const s = author.hourlyStats[h];
                    return (s?.insertions || 0) + (s?.deletions || 0);
                }),
                backgroundColor: this.getColor(i),
                stack: 'combined'  // 添加堆叠效果
            }))
        };
    }

    private prepareCalendarData(authors: AuthorStats[], dates: string[]): { date: string, totalCommits: number, colorIntensity: number }[] {
        const calendarData = dates.map(date => {
            const totalCommits = authors.reduce((sum, author) => sum + (author.dailyStats[date]?.commits || 0), 0);
            return {
                date,
                totalCommits,
                colorIntensity: Math.min(4, Math.floor(totalCommits / 5)) // 将提交数量映射到颜色强度（0-4）
            };
        });
        return calendarData;
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
