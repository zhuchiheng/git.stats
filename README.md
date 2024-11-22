# Code Activity Tracker - VSCode Extension

一个强大的VSCode扩展，用于跟踪和可视化团队成员的代码贡献情况。这个工具可以帮助团队领导和管理者实时了解团队成员的工作情况，预防工作效率问题。

## 功能特点

### 核心功能
- 分析Git提交历史
- 统计每个团队成员的代码贡献
- 生成可视化报告和统计图表

### 统计指标
- 每日提交次数统计
- 代码行数变更（增加/删除）
- 修改的文件数量
- 团队成员的总体贡献统计

### 可视化功能
- 日常提交趋势图
- 代码变更量柱状图
- 详细的统计数据表格

## 安装方法

1. 确保你的系统已安装Node.js和npm

2. 克隆仓库：
```bash
git clone [repository-url]
cd code-activity-tracker
```

3. 安装依赖：
```bash
npm install
```

4. 编译插件：
```bash
npm run compile
```

5. 打包插件（可选）：
```bash
vsce package
```

## 使用方法

1. 在VSCode中打开任何Git仓库
2. 按下 `Ctrl+Shift+P`（Windows/Linux）或 `Cmd+Shift+P`（Mac）打开命令面板
3. 输入 "Show Code Activity Stats" 并选择该命令
4. 插件会自动分析Git历史并显示统计报告

## 主要组件

- `extension.ts`: 插件的主入口文件，处理插件激活和命令注册
- `gitAnalyzer.ts`: Git历史分析器，负责处理Git日志并生成统计数据
- `visualization.ts`: 可视化组件，使用Chart.js创建交互式图表

## 使用场景

这个插件特别适合：
- 团队领导跟踪项目进展
- 识别潜在的生产力问题
- 公平评估团队成员的贡献
- 了解团队整体工作节奏

## 技术栈

- TypeScript
- VSCode Extension API
- Chart.js（数据可视化）
- simple-git（Git操作）
- moment.js（日期处理）

## 贡献

欢迎提交Issue和Pull Request来帮助改进这个项目！

## 许可证

MIT License
