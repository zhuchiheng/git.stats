import simpleGit, { SimpleGit } from 'simple-git';
import moment from 'moment';
import * as fs from 'fs';
import * as path from 'path';

export interface DailyStats {
    commits: number;
    insertions: number;
    deletions: number;
    files: number;
}

export interface AuthorStats {
    author: string;
    email: string;
    startDate: moment.Moment;
    endDate: moment.Moment;
    totalCommits: number;
    totalInsertions: number;
    totalDeletions: number;
    totalFiles: number;
    dailyStats: { [date: string]: DailyStats };
    hourlyStats: { [hour: string]: DailyStats };
}

export interface GitAnalyzerConfig {
    excludePatterns: string[];  // 要排除的文件模式
}

export class GitContributionAnalyzer {
    private git: SimpleGit;
    private config: GitAnalyzerConfig;
    constructor(git: SimpleGit, config: Partial<GitAnalyzerConfig> = {}) {
        this.git = git;
        this.config = {
            excludePatterns: [
                '**/*.pb.go',      // Go protobuf
                '**/*.pb.js',      // JavaScript protobuf
                '**/*.pb.ts',      // TypeScript protobuf
                '**/*_pb2.py',     // Python protobuf v2
                '**/*_pb3.py',     // Python protobuf v3
                '**/generated/**', // 通用生成目录
                '**/*.pb.cs',      // C# protobuf
                ...(config.excludePatterns || [])
            ]
        };
    }

    private isProtobufGeneratedFile(filePath: string): boolean {
        console.log(`\nChecking file: ${filePath}`);

        // 检查文件路径是否包含protobuf目录
        if (filePath.includes('Protos/') || filePath.includes('Protos\\')) {
            console.log(`File is in Protos directory: ${filePath}`);
            // 对于C#文件，仍然检查内容以确认
            if (filePath.toLowerCase().endsWith('.cs')) {
                try {
                    console.log(`Reading C# file content: ${filePath}`);
                    const content = fs.readFileSync(filePath, 'utf8');
                    // 只读取前几行来判断
                    const firstFewLines = content.split('\n').slice(0, 5).join('\n');
                    console.log('First few lines:', firstFewLines);

                    // 如果文件不存在，这里会抛出错误
                    return true;
                } catch (error) {
                    console.error(`Error reading C# file ${filePath}:`, error);
                    // 如果文件不存在，仍然基于路径判断
                    return true;
                }
            }
            return true;
        }

        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            console.log(`File does not exist: ${filePath}`);
            return false;
        }

        // 对于C#文件，检查文件内容
        if (filePath.toLowerCase().endsWith('.cs')) {
            try {
                console.log(`Reading C# file content: ${filePath}`);
                const content = fs.readFileSync(filePath, 'utf8');
                const firstFewLines = content.split('\n').slice(0, 20).join('\n');

                // 检查是否包含protobuf生成文件的特征
                const markers = [
                    'Generated by the protocol buffer compiler',
                    '<auto-generated>',
                    'DO NOT EDIT',
                    'using pb = global::Google.Protobuf',
                    'using pbc = global::Google.Protobuf.Collections',
                    'namespace Google.Protobuf',
                    '#pragma warning disable'
                ];

                const isGenerated = markers.some(marker => firstFewLines.includes(marker));

                if (isGenerated) {
                    console.log(`Found protobuf generated C# file: ${filePath}`);
                    console.log('First few lines:', firstFewLines);
                }
                return isGenerated;
            } catch (error) {
                console.error(`Error reading C# file ${filePath}:`, error);
                return false;
            }
        }

        // 对于其他文件，使用文件名模式匹配
        const isExcluded = this.config.excludePatterns.some(pattern => {
            const regexPattern = pattern
                .replace(/\./g, '\\.')
                .replace(/\*\*/g, '.*')
                .replace(/\*/g, '[^/]*');
            const regex = new RegExp(regexPattern);
            const matches = regex.test(filePath);
            if (matches) {
                console.log(`File matches exclude pattern ${pattern}: ${filePath}`);
            }
            return matches;
        });

        return isExcluded;
    }

    private shouldIncludeFile(file: string, repoPath: string): boolean {
        // 首先检查文件路径中是否包含Protos目录
        if (file.includes('Protos/') || file.includes('Protos\\')) {
            console.log(`Excluding file from Protos directory: ${file}`);
            return false;
        }

        const fullPath = path.join(repoPath, file);
        const shouldExclude = this.isProtobufGeneratedFile(fullPath);
        if (shouldExclude) {
            console.log(`Excluding generated file: ${file}`);
        }
        return !shouldExclude;
    }

    private async getLastCommitTime(): Promise<moment.Moment> {
        console.log('Getting last commit time...');
        try {
            // 使用 --pretty=format 来确保我们得到正确的日期格式
            const log = await this.git.log([
                '-1',  // 只获取最后一条提交
                '--pretty=format:%aI'  // ISO 8601 格式的作者日期
            ]);

            console.log('Last commit log:', log);

            // 由于我们使用了自定义格式，日期会直接在 log.latest.hash 中
            if (log && log.latest && log.latest.hash) {
                const dateStr = log.latest.hash.trim();
                const lastCommitTime = moment(dateStr);
                if (lastCommitTime.isValid()) {
                    console.log('Last commit time:', lastCommitTime.format('YYYY-MM-DD HH:mm:ss'));
                    return lastCommitTime;
                } else {
                    console.log('Invalid date format:', dateStr);
                }
            } else {
                console.log('No commit found or invalid log format:', log);
            }
        } catch (error) {
            console.error('Error getting last commit time:', error);
        }

        // 如果获取失败，返回当前时间
                const currentTime = moment();
        console.log('Using current time as fallback:', currentTime.format('YYYY-MM-DD HH:mm:ss'));
        return currentTime;
    }

    public async getContributionStatsForDeveloper(developer: string, days?: number, startDate?: string, endDate?: string): Promise<{ [author: string]: AuthorStats }> {
        // 同时应用开发者过滤和时间范围参数
        return await this.getContributionStats(days, startDate, endDate, developer);
    }

    async findGitRepos(rootPath: string): Promise<string[]> {
        const gitRepos: string[] = [];
        const dirsToCheck = [rootPath];
        const visitedDirs = new Set<string>();
        
        while (dirsToCheck.length > 0) {
            const currentDir = dirsToCheck.pop()!;
            
            // 跳过已访问目录
            if (visitedDirs.has(currentDir)) {
                continue;
            }
            visitedDirs.add(currentDir);
            
            try {
                const files = fs.readdirSync(currentDir);
                
                // 检查当前目录是否是git仓库
                if (files.includes('.git')) {
                    gitRepos.push(currentDir);
                    continue; // 不检查git仓库的子目录
                }
                
                // 添加子目录到检查列表
                for (const file of files) {
                    const fullPath = path.join(currentDir, file);
                    try {
                        const stat = fs.statSync(fullPath);
                        if (stat.isDirectory()) {
                            dirsToCheck.push(fullPath);
                        }
                    } catch (error) {
                        console.error(`Error accessing ${fullPath}:`, error);
                    }
                }
            } catch (error) {
                console.error(`Error scanning directory ${currentDir}:`, error);
            }
        }
        
        return gitRepos;
    }

    async analyzeMultipleRepositories(repoPaths: string[], days: number = 7, startDateStr?: string, endDateStr?: string): Promise<{ [author: string]: AuthorStats }> {
        const combinedStats: { [author: string]: AuthorStats } = {};
        
        // 计算时间范围
        let endDate: moment.Moment;
        let startDate: moment.Moment;

        if (startDateStr && endDateStr) {
            startDate = moment(startDateStr).startOf('day');
            endDate = moment(endDateStr).endOf('day');
        } else {
            endDate = moment().endOf('day');
            startDate = endDate.clone().subtract(days - 1, 'days').startOf('day');
        }

        for (const repoPath of repoPaths) {
            try {
                const git = simpleGit(repoPath);
                const analyzer = new GitContributionAnalyzer(git);
                const repoStats = await analyzer.getContributionStats(days, startDateStr, endDateStr, undefined, repoPath);
                
                // 合并统计结果
                for (const author in repoStats) {
                    if (!combinedStats[author]) {
                        combinedStats[author] = {
                            author: repoStats[author].author,
                            email: repoStats[author].email,
                            startDate,
                            endDate,
                            totalCommits: 0,
                            totalInsertions: 0,
                            totalDeletions: 0,
                            totalFiles: 0,
                            dailyStats: {},
                            hourlyStats: {}
                        };
                    }

                    // 合并总数
                    combinedStats[author].totalCommits += repoStats[author].totalCommits;
                    combinedStats[author].totalInsertions += repoStats[author].totalInsertions;
                    combinedStats[author].totalDeletions += repoStats[author].totalDeletions;
                    combinedStats[author].totalFiles += repoStats[author].totalFiles;

                    // 合并每日统计
                    for (const date in repoStats[author].dailyStats) {
                        if (!combinedStats[author].dailyStats[date]) {
                            combinedStats[author].dailyStats[date] = {
                                commits: 0,
                                insertions: 0,
                                deletions: 0,
                                files: 0
                            };
                        }
                        combinedStats[author].dailyStats[date].commits += repoStats[author].dailyStats[date].commits;
                        combinedStats[author].dailyStats[date].insertions += repoStats[author].dailyStats[date].insertions;
                        combinedStats[author].dailyStats[date].deletions += repoStats[author].dailyStats[date].deletions;
                        combinedStats[author].dailyStats[date].files += repoStats[author].dailyStats[date].files;
                    }

                    // 合并每小时统计
                    for (const hour in repoStats[author].hourlyStats) {
                        if (!combinedStats[author].hourlyStats[hour]) {
                            combinedStats[author].hourlyStats[hour] = {
                                commits: 0,
                                insertions: 0,
                                deletions: 0,
                                files: 0
                            };
                        }
                        combinedStats[author].hourlyStats[hour].commits += repoStats[author].hourlyStats[hour].commits;
                        combinedStats[author].hourlyStats[hour].insertions += repoStats[author].hourlyStats[hour].insertions;
                        combinedStats[author].hourlyStats[hour].deletions += repoStats[author].hourlyStats[hour].deletions;
                        combinedStats[author].hourlyStats[hour].files += repoStats[author].hourlyStats[hour].files;
                    }
                }
            } catch (error) {
                console.error(`Error analyzing repository ${repoPath}:`, error);
            }
        }

        return combinedStats;
    }

    async getContributionStats(days: number = 7, startDateStr?: string, endDateStr?: string, authorFilter?: string, repoPath?: string): Promise<{ [author: string]: AuthorStats }> {
        console.log(`Starting contribution analysis for the last ${days} days`);
        console.log('Custom date range:', startDateStr, 'to', endDateStr);

        // 计算时间范围
        let endDate: moment.Moment;
        let startDate: moment.Moment;

        if (startDateStr && endDateStr) {
            // 使用自定义日期范围
            startDate = moment(startDateStr).startOf('day');
            endDate = moment(endDateStr).endOf('day');
            console.log('Using custom date range');
        } else {
            // 使用预设时间范围，从最后一次提交时间开始计算
            console.log('Using preset time range');
            endDate = await this.getLastCommitTime();
            if (!endDate.isValid()) {
                console.log('Invalid end date, using current time');
                endDate = moment();
            }
            console.log('End date (last commit):', endDate.format('YYYY-MM-DD HH:mm:ss'));

            // 从最后提交时间开始往前推
            startDate = endDate.clone().subtract(days - 1, 'days').startOf('day');
            console.log('Start date:', startDate.format('YYYY-MM-DD HH:mm:ss'));

            // 确保包含最后一天的所有提交
            endDate = endDate.clone().endOf('day');
            console.log('Adjusted end date:', endDate.format('YYYY-MM-DD HH:mm:ss'));
        }

        console.log(`Analyzing commits from ${startDate.format('YYYY-MM-DD HH:mm:ss')} to ${endDate.format('YYYY-MM-DD HH:mm:ss')}`);

        try {
            const logArgs = [
                '--all',
                '--no-merges',
                '--numstat',
                '--date=iso-strict',
                '--pretty=format:commit %H%n%an%n%aI%n%s%n',
                '--since', startDate.format('YYYY-MM-DD HH:mm:ss'),
                '--until', endDate.format('YYYY-MM-DD HH:mm:ss'),
                '--invert-grep',
                '--grep=^WIP',
                '--grep=^stash', 
                '--grep=^\\[STASH\\]',
                '--grep=^\\[stash\\]'
            ];

            // 添加作者过滤条件
            if (authorFilter && authorFilter !== 'all') {
                logArgs.push('--author=' + authorFilter);
            }

            const logs = await this.git.log(logArgs);

            if (!logs || !logs.all || logs.all.length === 0) {
                console.log('No commits found in the specified date range');
                return {};
            }

            console.log(`Found ${logs.all.length} commits in the date range`);

            const stats: { [author: string]: AuthorStats } = {};

            // 解析提交日志
            const content = logs.all[0].hash;
            const commits = content.split('\ncommit ');
            for (const commitBlock of commits) {
                if (!commitBlock.trim()) continue;

                const lines = commitBlock.split('\n');
                if (lines.length < 4) continue;  // 至少需要4行：hash, author, date, subject

                // 解析提交信息
                const hash = lines[0].trim();
                const author = lines[1].trim();
                const dateStr = lines[2].trim();
                const subject = lines[3].trim();

                // 跳过 stash 相关的提交
                if (author.toLowerCase().includes('stash') ||
                    subject.toLowerCase().includes('stash') ||
                    subject.startsWith('WIP') ||
                    subject.startsWith('[STASH]') ||
                    subject.startsWith('[stash]')) {
                    continue;
                }

                // Git ISO date format: YYYY-MM-DDTHH:mm:ssZ or YYYY-MM-DDTHH:mm:ss+HH:MM
                const date = moment(dateStr);
                if (!date.isValid()) {
                    continue;
                }

                // 初始化作者统计
                if (!stats[author]) {
                    stats[author] = {
                        author,
                        email: '',  // simple-git的log命令没有返回email
                        startDate,
                        endDate,
                        totalCommits: 0,
                        totalInsertions: 0,
                        totalDeletions: 0,
                        totalFiles: 0,
                        dailyStats: {},
                        hourlyStats: {}
                    };
                }

                // 初始化日期统计
                const dateKey = date.format('YYYY-MM-DD');
                if (!stats[author].dailyStats[dateKey]) {
                    stats[author].dailyStats[dateKey] = {
                        commits: 0,
                        insertions: 0,
                        deletions: 0,
                        files: 0
                    };
                }

                // 初始化小时统计
                const hourKey = date.format('HH');  // 只使用小时部分，改为 HH 格式
                if (!stats[author].hourlyStats[hourKey]) {
                    stats[author].hourlyStats[hourKey] = {
                        commits: 0,
                        insertions: 0,
                        deletions: 0,
                        files: 0
                    };
                }


                // 更新提交计数
                stats[author].totalCommits++;
                stats[author].dailyStats[dateKey].commits++;
                stats[author].hourlyStats[hourKey].commits++;

                // 解析文件变更统计
                // 跳过提交信息的4行，后面都是文件统计
                for (let i = 4; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;

                    const [ins, del, file] = line.split('\t');
                    if (!file) continue;

                // 检查是否应该包含此文件
                if (!this.shouldIncludeFile(file, repoPath || '')) {
                        console.log(`Skipping generated file in commit ${hash}: ${file}`);
                        continue;
                    }

                    // 解析插入和删除的行数
                    const insertions = ins === '-' ? 0 : parseInt(ins) || 0;
                    const deletions = del === '-' ? 0 : parseInt(del) || 0;

                    // 更新统计
                    stats[author].totalInsertions += insertions;
                    stats[author].totalDeletions += deletions;
                    stats[author].totalFiles++;

                    stats[author].dailyStats[dateKey].insertions += insertions;
                    stats[author].dailyStats[dateKey].deletions += deletions;
                    stats[author].dailyStats[dateKey].files++;

                    stats[author].hourlyStats[hourKey].insertions += insertions;
                    stats[author].hourlyStats[hourKey].deletions += deletions;
                    stats[author].hourlyStats[hourKey].files++;
                }
            }

            // 在返回的 stats 对象中，需要确保包含整个日期范围
            for (const author in stats) {
                // 确保 startDate 和 endDate 被正确设置到返回的统计对象中
                stats[author].startDate = startDate;
                stats[author].endDate = endDate;
            }

            // 在返回统计之前，确保每个作者的统计数据包含完整的日期范围
            for (const author in stats) {
                const currentDate = startDate.clone();
                while (currentDate.isSameOrBefore(endDate, 'day')) {
                    const dateKey = currentDate.format('YYYY-MM-DD');
                    if (!stats[author].dailyStats[dateKey]) {
                        stats[author].dailyStats[dateKey] = {
                            commits: 0,
                            insertions: 0,
                            deletions: 0,
                            files: 0
                        };
                    }
                    currentDate.add(1, 'day');
                }
            }

            // 替换原有的小时范围初始化代码
            for (const author in stats) {
                // 为每个小时创建统计项
                for (let hour = 0; hour < 24; hour++) {
                    const hourKey = hour.toString().padStart(2, '0');
                    if (!stats[author].hourlyStats[hourKey]) {
                        stats[author].hourlyStats[hourKey] = {
                            commits: 0,
                            insertions: 0,
                            deletions: 0,
                            files: 0
                        };
                    }
                }
            }

            return stats;
        } catch (error) {
            console.error('Error analyzing git log:', error);
            throw error;
        }
    }

    async analyzeRepository(repoPath: string, startDate: moment.Moment, endDate: moment.Moment): Promise<{ [author: string]: AuthorStats }> {
        // 保持原有实现不变，但添加repoPath参数传递
        const git = simpleGit(repoPath);
        const stats: { [author: string]: AuthorStats } = {};

        try {
            // 获取原始git log输出
            const result = await git.raw([
                'log',
                '--all',
                '--no-merges',
                '--numstat',
                '--format=commit:%H%nauthor:%aN%nemail:%aE%ndate:%aI',
                '--since', startDate.format('YYYY-MM-DD HH:mm:ss'),
                '--until', endDate.format('YYYY-MM-DD HH:mm:ss')
            ]);

            const commits = result.split('\ncommit:').filter(c => c.trim());

            for (const commitData of commits) {
                const lines = commitData.trim().split('\n');
                let author = '', email = '', dateStr = '', hash = '';
                let insertions = 0, deletions = 0, filesChanged = 0;

                // 解析提交头部信息
                for (const line of lines) {
                    if (line.startsWith('commit:')) {
                        hash = line.substring(7).trim();
                    } else if (line.startsWith('author:')) {
                        author = line.substring(7).trim();
                    } else if (line.startsWith('email:')) {
                        email = line.substring(6).trim();
                    } else if (line.startsWith('date:')) {
                        dateStr = line.substring(5).trim();
                    } else if (line.trim() && !line.startsWith('commit:')) {
                        // 解析文件统计
                        const parts = line.split('\t');
                        if (parts.length === 3) {
                            const [ins, dels, file] = parts;
                    // 检查是否应该包含此文件
                    if (!this.shouldIncludeFile(file, repoPath)) {
                                continue;
                            }
                            const insCount = ins === '-' ? 0 : parseInt(ins) || 0;
                            const delCount = dels === '-' ? 0 : parseInt(dels) || 0;

                            insertions += insCount;
                            deletions += delCount;
                            filesChanged++;
                        }
                    }
                }

                const date = moment(dateStr);
                if (!date.isValid()) {
                    continue;
                }

                // 初始化作者统计
                if (!stats[author]) {
                    stats[author] = {
                        author,
                        email,
                        startDate,
                        endDate,
                        totalCommits: 0,
                        totalInsertions: 0,
                        totalDeletions: 0,
                        totalFiles: 0,
                        dailyStats: {},
                        hourlyStats: {}
                    };
                }

                const dateKey = date.format('YYYY-MM-DD');
                const hourKey = date.format('HH');

                // 初始化日期统计
                if (!stats[author].dailyStats[dateKey]) {
                    stats[author].dailyStats[dateKey] = {
                        commits: 0,
                        insertions: 0,
                        deletions: 0,
                        files: 0
                    };
                }

                // 初始化小时统计
                if (!stats[author].hourlyStats[hourKey]) {
                    stats[author].hourlyStats[hourKey] = {
                        commits: 0,
                        insertions: 0,
                        deletions: 0,
                        files: 0
                    };
                }

                // 更新统计
                stats[author].totalCommits++;
                stats[author].totalInsertions += insertions;
                stats[author].totalDeletions += deletions;
                stats[author].totalFiles += filesChanged;

                stats[author].dailyStats[dateKey].commits++;
                stats[author].dailyStats[dateKey].insertions += insertions;
                stats[author].dailyStats[dateKey].deletions += deletions;
                stats[author].dailyStats[dateKey].files += filesChanged;

                stats[author].hourlyStats[hourKey].commits++;
                stats[author].hourlyStats[hourKey].insertions += insertions;
                stats[author].hourlyStats[hourKey].deletions += deletions;
                stats[author].hourlyStats[hourKey].files += filesChanged;
            }

            // 确保日期范围完整
            for (const author in stats) {
                const currentDate = startDate.clone().startOf('day');
                while (currentDate.isSameOrBefore(endDate, 'day')) {
                    const dateKey = currentDate.format('YYYY-MM-DD');
                    if (!stats[author].dailyStats[dateKey]) {
                        stats[author].dailyStats[dateKey] = {
                            commits: 0,
                            insertions: 0,
                            deletions: 0,
                            files: 0
                        };
                    }
                    currentDate.add(1, 'day');
                }

                // 确保小时范围完整
                for (let hour = 0; hour < 24; hour++) {
                    const hourKey = hour.toString().padStart(2, '0');
                    if (!stats[author].hourlyStats[hourKey]) {
                        stats[author].hourlyStats[hourKey] = {
                            commits: 0,
                            insertions: 0,
                            deletions: 0,
                            files: 0
                        };
                    }
                }
            }

            return stats;
        } catch (error) {
            throw error;
        }
    }
}
