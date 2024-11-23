import simpleGit, { SimpleGit } from 'simple-git';
import moment from 'moment';

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
}

export class GitContributionAnalyzer {
    private git: SimpleGit;

    constructor(git: SimpleGit) {
        this.git = git;
    }

    async getContributionStats(startDate?: moment.Moment, endDate?: moment.Moment): Promise<{ [author: string]: AuthorStats }> {
        try {
            // console.log(`\n=== Starting contribution analysis ===`);
            
            // 如果没有提供日期，默认使用最近一周
            if (!startDate) {
                startDate = moment().subtract(7, 'days').startOf('day');
            }
            if (!endDate) {
                endDate = moment().endOf('day');
            }
            
            // console.log(`Date range: ${startDate.format()} to ${endDate.format()}`);

            // 使用更详细的git log命令，确保获取所有信息
            // console.log('Executing git log command...');
            const logs = await this.git.log([
                '--all',                    // 获取所有分支
                '--no-merges',              // 不包括合并提交
                '--numstat',                // 获取更改统计
                '--date=iso-strict',        // ISO格式的日期
                '--pretty=format:commit %H%n%an%n%aI%n%s%n',  // 自定义输出格式
                '--invert-grep',            // 反向匹配，排除匹配的提交
                '--grep=^WIP',              // 排除 WIP 提交
                '--grep=^stash',            // 排除 stash 提交
                '--grep=^\\[STASH\\]',      // 排除 [STASH] 提交
                '--grep=^\\[stash\\]'       // 排除 [stash] 提交
            ]);

            // console.log(`Found ${logs.all.length} commits`);
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

                // console.log('\n=== Processing commit ===');
                // console.log('Commit info:', { hash, author, dateStr, subject });

                // Git ISO date format: YYYY-MM-DDTHH:mm:ssZ or YYYY-MM-DDTHH:mm:ss+HH:MM
                const date = moment.utc(dateStr);
                if (!date.isValid()) {
                    // console.warn(`Invalid date format: ${dateStr}`);
                    continue;
                }

                // 只统计指定日期范围内的提交
                const commitDate = date.startOf('day');
                const rangeStart = moment.utc(startDate).startOf('day');
                const rangeEnd = moment.utc(endDate).endOf('day');

                if (commitDate.isBefore(rangeStart) || commitDate.isAfter(rangeEnd)) {
                    // console.log('Commit outside date range, skipping');
                    continue;
                }

                // 初始化作者统计
                if (!stats[author]) {
                    // console.log(`Initializing stats for author: ${author}`);
                    stats[author] = {
                        author,
                        email: '',  // simple-git的log命令没有返回email
                        startDate,
                        endDate,
                        totalCommits: 0,
                        totalInsertions: 0,
                        totalDeletions: 0,
                        totalFiles: 0,
                        dailyStats: {}
                    };
                }

                // 初始化日期统计
                const dateKey = date.format('YYYY-MM-DD');
                if (!stats[author].dailyStats[dateKey]) {
                    // console.log(`Initializing daily stats for ${dateKey}`);
                    stats[author].dailyStats[dateKey] = {
                        commits: 0,
                        insertions: 0,
                        deletions: 0,
                        files: 0
                    };
                }

                // 更新提交计数
                stats[author].totalCommits++;
                stats[author].dailyStats[dateKey].commits++;

                // 解析文件变更统计
                // 跳过提交信息的4行，后面都是文件统计
                for (let i = 4; i < lines.length; i++) {
                    const line = lines[i].trim();
                    if (!line) continue;

                    const [ins, del, file] = line.split('\t');
                    if (!file) continue;

                    // 解析插入和删除的行数
                    const insertions = ins === '-' ? 0 : parseInt(ins) || 0;
                    const deletions = del === '-' ? 0 : parseInt(del) || 0;

                    // console.log(`File: ${file} (+${insertions}, -${deletions})`);

                    // 更新统计
                    stats[author].totalInsertions += insertions;
                    stats[author].totalDeletions += deletions;
                    stats[author].totalFiles++;

                    stats[author].dailyStats[dateKey].insertions += insertions;
                    stats[author].dailyStats[dateKey].deletions += deletions;
                    stats[author].dailyStats[dateKey].files++;
                }
            }

            // 打印最终统计结果
            // console.log('\n=== Final Statistics ===');
            // for (const [author, authorStats] of Object.entries(stats)) {
            //     console.log(`\nAuthor: ${author}`);
            //     console.log(`Total commits: ${authorStats.totalCommits}`);
            //     console.log(`Total insertions: ${authorStats.totalInsertions}`);
            //     console.log(`Total deletions: ${authorStats.totalDeletions}`);
            //     console.log(`Total files: ${authorStats.totalFiles}`);
            //     console.log('Daily stats:', Object.keys(authorStats.dailyStats).length, 'days');
            //     console.log('Daily stats details:', JSON.stringify(authorStats.dailyStats, null, 2));
            // }

            return stats;
        } catch (error) {
            // console.error('Error getting contribution stats:', error);
            throw error;
        }
    }

    async analyzeRepository(repoPath: string, startDate: moment.Moment, endDate: moment.Moment): Promise<{ [author: string]: AuthorStats }> {
        // console.log(`\n=== Starting repository analysis ===`);
        // console.log(`Repository path: ${repoPath}`);
        // console.log(`Date range: ${startDate.format('YYYY-MM-DD')} to ${endDate.format('YYYY-MM-DD')}`);

        const git = simpleGit(repoPath);
        const stats: { [author: string]: AuthorStats } = {};

        try {
            // 获取原始git log输出
            const result = await git.raw([
                'log',
                '--all',
                '--no-merges',
                '--numstat',
                '--format=commit:%H%nauthor:%aN%nemail:%aE%ndate:%aI'
            ]);

            // console.log('\n=== Git log output ===');

            // 按提交分割
            const commits = result.split('\ncommit:').filter(c => c.trim());
            // console.log(`Found ${commits.length} commits`);

            for (const commitData of commits) {
                const lines = commitData.trim().split('\n');
                let hash = '', author = '', email = '', dateStr = '';
                let currentSection = '';
                let insertions = 0, deletions = 0, filesChanged = 0;

                // 解析提交头部信息
                for (const line of lines) {
                    if (line.startsWith('author:')) {
                        author = line.substring(7).trim();
                        // console.log('Author:', author);
                    } else if (line.startsWith('email:')) {
                        email = line.substring(6).trim();
                    } else if (line.startsWith('date:')) {
                        dateStr = line.substring(5).trim();
                        // console.log('Date:', dateStr);
                    } else if (line.trim() && !line.startsWith('commit:')) {
                        // 解析文件统计
                        const parts = line.split('\t');
                        if (parts.length === 3) {
                            const [ins, del, file] = parts;
                            const insCount = parseInt(ins) || 0;
                            const delCount = parseInt(del) || 0;

                            insertions += insCount;
                            deletions += delCount;
                            filesChanged++;

                            // console.log(`File: ${file}, +${insCount} -${delCount}`);
                        }
                    }
                }

                // 解析日期
                const date = moment(dateStr);
                if (!date.isValid()) {
                    // console.warn(`Invalid date: ${dateStr}`);
                    continue;
                }

                // 检查日期范围
                if (date.isBefore(startDate) || date.isAfter(endDate)) {
                    // console.log(`Commit date ${date.format('YYYY-MM-DD')} outside range ${startDate.format('YYYY-MM-DD')} - ${endDate.format('YYYY-MM-DD')}`);
                    continue;
                }

                // console.log(`Changes: +${insertions} -${deletions} (${filesChanged} files)`);

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
                        dailyStats: {}
                    };
                }

                // 更新总体统计
                stats[author].totalCommits++;
                stats[author].totalInsertions += insertions;
                stats[author].totalDeletions += deletions;
                stats[author].totalFiles += filesChanged;

                // 更新每日统计
                const dateKey = date.format('YYYY-MM-DD');
                if (!stats[author].dailyStats[dateKey]) {
                    stats[author].dailyStats[dateKey] = {
                        commits: 0,
                        insertions: 0,
                        deletions: 0,
                        files: 0
                    };
                }

                stats[author].dailyStats[dateKey].commits++;
                stats[author].dailyStats[dateKey].insertions += insertions;
                stats[author].dailyStats[dateKey].deletions += deletions;
                stats[author].dailyStats[dateKey].files += filesChanged;
            }

            // console.log('\n=== Final Statistics ===');
            // for (const [author, authorStats] of Object.entries(stats)) {
            //     console.log(`\nAuthor: ${author}`);
            //     console.log(`Total commits: ${authorStats.totalCommits}`);
            //     console.log(`Total insertions: ${authorStats.totalInsertions}`);
            //     console.log(`Total deletions: ${authorStats.totalDeletions}`);
            //     console.log(`Total files: ${authorStats.totalFiles}`);
            //     console.log('Daily stats:', Object.keys(authorStats.dailyStats).length, 'days');
            // }

            return stats;

        } catch (error) {
            // console.error('Error analyzing repository:', error);
            throw error;
        }
    }

    private processCommitStats(
        commit: { hash: string; author: string; email: string; date: moment.Moment },
        fileStats: { insertions: number[]; deletions: number[] },
        stats: { [author: string]: AuthorStats },
        startDate: moment.Moment,
        endDate: moment.Moment
    ) {
        const { hash, author, email, date } = commit;

        // 检查日期范围
        const commitDate = date.clone().startOf('day');
        const rangeStart = moment.utc(startDate).startOf('day');
        const rangeEnd = moment.utc(endDate).endOf('day');

        if (commitDate.isBefore(rangeStart) || commitDate.isAfter(rangeEnd)) {
            // console.log(`Commit ${hash} outside date range (${commitDate.format()} not in ${rangeStart.format()} - ${rangeEnd.format()})`);
            return;
        }

        const dateKey = date.format('YYYY-MM-DD');

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
                dailyStats: {}
            };
        }

        // 初始化日期统计
        if (!stats[author].dailyStats[dateKey]) {
            stats[author].dailyStats[dateKey] = {
                commits: 0,
                insertions: 0,
                deletions: 0,
                files: 0
            };
        }

        // 更新统计
        const totalInsertions = fileStats.insertions.reduce((a, b) => a + b, 0);
        const totalDeletions = fileStats.deletions.reduce((a, b) => a + b, 0);
        const totalFiles = fileStats.insertions.length;

        stats[author].totalCommits++;
        stats[author].totalInsertions += totalInsertions;
        stats[author].totalDeletions += totalDeletions;
        stats[author].totalFiles += totalFiles;

        stats[author].dailyStats[dateKey].commits++;
        stats[author].dailyStats[dateKey].insertions += totalInsertions;
        stats[author].dailyStats[dateKey].deletions += totalDeletions;
        stats[author].dailyStats[dateKey].files += totalFiles;

        // console.log(`Processed commit ${hash}: +${totalInsertions} -${totalDeletions} (${totalFiles} files)`);
    }

    private parseNumstat(diff: string): { insertions: number; deletions: number; files: number } {
        const lines = diff.split('\n');
        let insertions = 0;
        let deletions = 0;
        let files = 0;

        for (const line of lines) {
            if (!line.trim()) continue;

            const [ins, dels] = line.split('\t');
            if (!ins || !dels) continue;

            insertions += ins === '-' ? 0 : parseInt(ins, 10) || 0;
            deletions += dels === '-' ? 0 : parseInt(dels, 10) || 0;
            files++;
        }

        return { insertions, deletions, files };
    }
}
