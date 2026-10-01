import { SimpleGit } from 'simple-git';
import moment from 'moment';
import { Segment, useDefault } from 'segmentit';
import { HealthRaw, emptyHealthRaw, isDocFile, isFixSubject, isTestFile } from './healthChecks';
import type { DirActivityMap } from './teamSignals';

/**
 * Lazily initialized segmenter — building the dictionary is expensive, so it
 * must not happen at module import time (it would run even for commands that
 * never parse a git log).
 */
let _segmenter: Segment | null = null;
function getSegmenter(): Segment {
    if (!_segmenter) {
        _segmenter = new Segment();
        useDefault(_segmenter);
    }
    return _segmenter;
}

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
    weeklyHourly: number[][];
    currentStreak: number;
    longestStreak: number;
}

export interface FileChangeStats {
    file: string;
    totalCommits: number;
    totalInsertions: number;
    totalDeletions: number;
}

export interface OwnershipEntry {
    path: string;
    directory: string;
    linesByAuthor: { [author: string]: number };
    totalLines: number;
    primaryAuthor: string;
    primaryAuthorPercentage: number;
}

export interface ContributionResult {
    authorStats: { [author: string]: AuthorStats };
    fileStats: FileChangeStats[];
    ownership: OwnershipEntry[];
    wordFreq: { [word: string]: number };
    commitDetails: { [date: string]: { t: string; a: string; m: string }[] };
    heatmapDetails: { [dayHour: string]: { d: string; t: string; a: string; m: string }[] };
    /** Health-check counters; optional so older results/tests stay valid. */
    health?: HealthRaw;
    /** Per-directory, per-author commit activity (handover detection). */
    dirActivity?: DirActivityMap;
}

export interface GitAnalyzerConfig {
    excludePatterns: string[];
}

/**
 * Paths that are never treated as project code. Generated protocol stubs are
 * obvious, but vendored dependencies matter just as much: for a repository that
 * once committed node_modules/, those files otherwise dominate every ownership,
 * risk and knowledge-concentration ranking with third-party code.
 *
 * Patterns use the glob subset supported by `isGeneratedFile` (`**`, `*`).
 */
export const DEFAULT_EXCLUDE_PATTERNS: string[] = [
    '**/*.pb.go',
    '**/*.pb.js',
    '**/*.pb.ts',
    '**/*_pb2.py',
    '**/*_pb3.py',
    '**/generated/**',
    '**/*.pb.cs',
    'node_modules/**',
    'vendor/**'
];

/** Separator emitted by the git log pretty format (%x00) between records. */
const RECORD_SEP = '\u0000';

/**
 * Directory part of a repo-relative path (`/` when the file sits at the root).
 * Shared by the ownership entries and the directory activity map so both agree
 * on what "one directory" means.
 */
export function directoryOf(file: string): string {
    const sep = file.includes('/') ? '/' : '\\';
    return file.includes(sep) ? file.substring(0, file.lastIndexOf(sep)) : '/';
}

/** Max entries kept per day/hour key in the commit/heatmap detail maps. */
export const MAX_DETAILS_PER_KEY = 50;

/** AuthorStats before the final date range and streaks have been attached. */
export type MutableAuthorStats = Omit<AuthorStats, 'startDate' | 'endDate' | 'currentStreak' | 'longestStreak'>;

export interface ParsedGitLog {
    stats: { [author: string]: MutableAuthorStats };
    fileChanges: Map<string, { commits: number; insertions: number; deletions: number }>;
    fileAuthorLines: Map<string, Map<string, number>>;
    wordFreq: Map<string, number>;
    commitDetails: { [date: string]: { t: string; a: string; m: string }[] };
    heatmapDetails: { [dayHour: string]: { d: string; t: string; a: string; m: string }[] };
    health: HealthRaw;
    /** First/last commit per directory and author, for handover detection. */
    dirActivity: DirActivityMap;
}

const STOP_WORDS = new Set([
    'the','a','an','and','or','but','in','on','at','to','for',
    'of','with','by','from','as','is','was','are','were','be',
    'been','being','have','has','had','do','does','did','will',
    'would','could','should','may','might','can','shall','not',
    'no','nor','so','if','then','else','when','where','why',
    'how','all','each','every','both','few','more','most',
    'other','some','such','only','own','same','than','too',
    'very','just','because','about','into','over','after',
    'before','up','out','off','down','this','that','these',
    'those','it','its','he','she','they','them','their',
    'what','which','who','whom','fix','update','add','remove',
    'change','refactor','fixed','updated','added','removed',
    'changed','refactored','wip','stash'
]);

const CN_STOP = new Set([
    '的','了','是','在','我','不','人','这','那','他',
    '她','它','们','为','就','都','也','要','会','可',
    '没','有','上','中','下','前','后','大','小','多',
    '少','能','把','被','让','给','到','和','与','及',
    '或','而','则','但','然','因','所','以','对','从',
    '向','自','于','由','某','各','此','其','该','哪',
    '每','第','次','等','之','已','将','只','个','一',
    '么','还','又','再','却','只','并','去','着','过'
]);

const CJK = /^[\u4e00-\u9fff]+$/;

/**
 * Path-only generated-file detection (no filesystem access).
 * Any file inside a Protos/ directory is treated as generated; everything
 * else is matched against the configured glob-style exclude patterns.
 */
export function isGeneratedFile(file: string, excludePatterns: string[]): boolean {
    const normalized = file.replace(/\\/g, '/');
    if (normalized.includes('Protos/')) {
        return true;
    }

    return excludePatterns.some(pattern => {
        const regexPattern = pattern
            .replace(/\./g, '\\.')
            .replace(/\*\*/g, '.*')
            .replace(/\*/g, '[^/]*');
        return new RegExp(regexPattern).test(normalized);
    });
}

/**
 * Compute commit streaks from (sparse) daily stats.
 * - longestStreak walks the sorted commit days and resets the run whenever a
 *   calendar gap > 1 day is found (sparse data cannot inflate the run).
 * - currentStreak walks backwards from the end of the range while the day has
 *   commits, bounded below by the range start.
 */
export function computeStreakStats(
    dailyStats: { [date: string]: DailyStats },
    startDate: moment.Moment,
    endDate: moment.Moment
): { currentStreak: number; longestStreak: number } {
    const sortedDates = Object.keys(dailyStats).sort();
    let longestRun = 0;
    let currentRun = 0;
    let prevDay: moment.Moment | null = null;
    for (const ds of sortedDates) {
        if (dailyStats[ds] && dailyStats[ds].commits > 0) {
            const day = moment(ds, 'YYYY-MM-DD');
            if (prevDay && day.diff(prevDay, 'days') === 1) {
                currentRun++;
            } else {
                currentRun = 1;
            }
            if (currentRun > longestRun) longestRun = currentRun;
            prevDay = day;
        }
    }

    let currentStreak = 0;
    const cursor = endDate.clone().startOf('day');
    const floor = startDate.clone().startOf('day');
    while (cursor.isSameOrAfter(floor)) {
        const key = cursor.format('YYYY-MM-DD');
        const ds = dailyStats[key];
        if (ds && ds.commits > 0) {
            currentStreak++;
            cursor.subtract(1, 'day');
        } else {
            break;
        }
    }

    return { currentStreak, longestStreak: longestRun };
}

/**
 * Parse the raw output of `git log --numstat --pretty=format:%x00%H%n%an%n%ae%n%aI%n%s%n`.
 * Records are NUL-separated; within a record the lines are
 * hash, author, email, ISO date, subject, then numstat lines.
 * Pure function: no git or filesystem access.
 */
export function parseGitLog(rawOutput: string, includeFile: (file: string) => boolean): ParsedGitLog {
    const stats: { [author: string]: MutableAuthorStats } = {};
    const fileChanges = new Map<string, { commits: number; insertions: number; deletions: number }>();
    const fileAuthorLines = new Map<string, Map<string, number>>();
    const wordFreq = new Map<string, number>();
    const commitDetails: ParsedGitLog['commitDetails'] = {};
    const heatmapDetails: ParsedGitLog['heatmapDetails'] = {};
    // Health-check counters (see healthChecks.ts): fix-like commits per file, and
    // for each non-test/non-doc file whether its changes came with test changes.
    const health = emptyHealthRaw();
    const fileFixCommits = new Map<string, number>();
    const fileSourceChanges = new Map<string, number>();
    const fileSourceChangesWithTest = new Map<string, number>();
    // Directory x author activity for handover detection: commit count plus the
    // first and last date the author touched that directory.
    const dirActivity: DirActivityMap = {};

    const segmenter = getSegmenter();

    for (const block of rawOutput.split(RECORD_SEP)) {
        const lines = block.split('\n');
        if (lines.length < 5) continue;

        const author = lines[1].trim();
        const email = lines[2].trim();
        const dateStr = lines[3].trim();
        const subject = lines[4].trim();

        if (!author) continue;

        if (author.toLowerCase().includes('stash') ||
            subject.toLowerCase().includes('stash') ||
            subject.startsWith('WIP') ||
            subject.startsWith('[STASH]') ||
            subject.startsWith('[stash]')) {
            continue;
        }

        const isFix = isFixSubject(subject);
        const commitFiles: string[] = [];
        const commitDirs = new Set<string>();
        let commitTouchedTest = false;

        // %aI always carries the committer's UTC offset. parseZone keeps that
        // offset instead of converting to the viewer's local time, so the day,
        // hour and weekday buckets reflect when the author actually committed
        // and stay stable no matter where the repository is viewed (a plain
        // moment(dateStr) shifts every bucket by the viewer's UTC offset).
        const date = moment.parseZone(dateStr);
        if (!date.isValid()) continue;

        if (!stats[author]) {
            stats[author] = {
                author,
                email,
                totalCommits: 0,
                totalInsertions: 0,
                totalDeletions: 0,
                totalFiles: 0,
                dailyStats: {},
                hourlyStats: {},
                weeklyHourly: Array.from({ length: 7 }, () => new Array(24).fill(0))
            };
        }

        const words: string[] = [];
        const segs = segmenter.doSegment(subject);
        for (const s of segs) {
            const w = s.w.trim();
            if (w.length < 2 && !CJK.test(w)) continue;
            const lower = w.toLowerCase();
            if (lower.length > 2 && STOP_WORDS.has(lower)) continue;
            if (w.length === 1 && CN_STOP.has(w)) continue;
            words.push(w);
        }
        for (const word of words) {
            wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
        }

        const dayOfWeek = date.day();
        const hourNum = date.hour();
        stats[author].weeklyHourly[dayOfWeek][hourNum]++;

        const dateKey = date.format('YYYY-MM-DD');
        if (!stats[author].dailyStats[dateKey]) {
            stats[author].dailyStats[dateKey] = {
                commits: 0,
                insertions: 0,
                deletions: 0,
                files: 0
            };
        }

        const commitMsg = subject.length > 50 ? subject.substring(0, 50) + '…' : subject;
        const commitTime = date.format('HH:mm');
        if (!commitDetails[dateKey]) commitDetails[dateKey] = [];
        if (commitDetails[dateKey].length < MAX_DETAILS_PER_KEY) {
            commitDetails[dateKey].push({ t: commitTime, a: author, m: commitMsg });
        }
        const dhKey = dayOfWeek + '-' + hourNum;
        if (!heatmapDetails[dhKey]) heatmapDetails[dhKey] = [];
        if (heatmapDetails[dhKey].length < MAX_DETAILS_PER_KEY) {
            heatmapDetails[dhKey].push({ d: dateKey, t: commitTime, a: author, m: commitMsg });
        }

        const hourKey = date.format('HH');
        if (!stats[author].hourlyStats[hourKey]) {
            stats[author].hourlyStats[hourKey] = {
                commits: 0,
                insertions: 0,
                deletions: 0,
                files: 0
            };
        }

        stats[author].totalCommits++;
        stats[author].dailyStats[dateKey].commits++;
        stats[author].hourlyStats[hourKey].commits++;

        for (let i = 5; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line) continue;

            const [ins, del, file] = line.split('\t');
            if (!file) continue;

            if (!includeFile(file)) continue;

            commitFiles.push(file);
            commitDirs.add(directoryOf(file));
            if (isTestFile(file)) {
                commitTouchedTest = true;
            }

            const insertions = ins === '-' ? 0 : parseInt(ins) || 0;
            const deletions = del === '-' ? 0 : parseInt(del) || 0;

            const fe = fileChanges.get(file) || { commits: 0, insertions: 0, deletions: 0 };
            fe.commits++;
            fe.insertions += insertions;
            fe.deletions += deletions;
            fileChanges.set(file, fe);

            const al = fileAuthorLines.get(file) || new Map<string, number>();
            al.set(author, (al.get(author) || 0) + insertions + deletions);
            fileAuthorLines.set(file, al);

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

        // Directory activity for handover detection: counted once per commit per
        // directory, so a commit touching three files in the same directory still
        // counts as one commit for that directory.
        for (const dir of commitDirs) {
            const byAuthor = dirActivity[dir] || (dirActivity[dir] = {});
            const entry = byAuthor[author] || (byAuthor[author] = { commits: 0, firstDate: dateKey, lastDate: dateKey });
            entry.commits++;
            if (dateKey < entry.firstDate) {
                entry.firstDate = dateKey;
            }
            if (dateKey > entry.lastDate) {
                entry.lastDate = dateKey;
            }
        }

        // Health-check bookkeeping for this commit. Test and documentation files
        // are excluded from the "risky file" and test-gap rankings.
        health.totalCommits++;
        if (isFix) {
            health.fixCommits++;
        }
        for (const file of commitFiles) {
            const test = isTestFile(file);
            const doc = isDocFile(file);
            if (test || doc) {
                continue;
            }
            fileSourceChanges.set(file, (fileSourceChanges.get(file) || 0) + 1);
            if (commitTouchedTest) {
                fileSourceChangesWithTest.set(file, (fileSourceChangesWithTest.get(file) || 0) + 1);
            }
            if (isFix) {
                fileFixCommits.set(file, (fileFixCommits.get(file) || 0) + 1);
            }
        }
    }

    health.fileFixCommits = Object.fromEntries(fileFixCommits);
    health.fileSourceChanges = Object.fromEntries(fileSourceChanges);
    health.fileSourceChangesWithTest = Object.fromEntries(fileSourceChangesWithTest);

    return { stats, fileChanges, fileAuthorLines, wordFreq, commitDetails, heatmapDetails, health, dirActivity };
}

export class GitContributionAnalyzer {
    private git: SimpleGit;
    private config: GitAnalyzerConfig;
    constructor(git: SimpleGit, config: Partial<GitAnalyzerConfig> = {}) {
        this.git = git;
        this.config = {
            excludePatterns: [
                ...DEFAULT_EXCLUDE_PATTERNS,
                ...(config.excludePatterns || [])
            ]
        };
    }

    private shouldIncludeFile(file: string): boolean {
        return !isGeneratedFile(file, this.config.excludePatterns);
    }

    private async getLastCommitTime(): Promise<moment.Moment> {
        try {
            const rawOutput = await this.git.raw([
                'log',
                '-1',
                '--pretty=format:%aI'
            ]);

            if (rawOutput && rawOutput.trim()) {
                const lastCommitTime = moment(rawOutput.trim());
                if (lastCommitTime.isValid()) {
                    return lastCommitTime;
                }
            }
        } catch (error) {
            console.error('Error getting last commit time:', error);
        }

        return moment();
    }

    async getBranches(): Promise<string[]> {
        try {
            const raw = await this.git.raw(['branch', '--format=%(refname:short)']);
            return raw.trim().split('\n').filter(Boolean);
        } catch { return ['main']; }
    }

    async getContributionStats(days: number = 7, startDateStr?: string, endDateStr?: string, authorFilter?: string, branch?: string): Promise<ContributionResult> {
        let endDate: moment.Moment;
        let startDate: moment.Moment;

        if (days === 0) {
            startDate = moment(0);
            endDate = moment(0);
        } else if (startDateStr && endDateStr) {
            startDate = moment(startDateStr).startOf('day');
            endDate = moment(endDateStr).endOf('day');
        } else {
            endDate = await this.getLastCommitTime();
            if (!endDate.isValid()) {
                endDate = moment();
            }
            startDate = endDate.clone().subtract(days - 1, 'days').startOf('day');
            endDate = endDate.clone().endOf('day');
        }

        try {
            const rawArgs = [
                'log',
                branch || '--all',
                '--no-merges',
                // Resolve .mailmap so aliases and old addresses collapse into one
                // author instead of splitting a person across several rows.
                '--use-mailmap',
                '--numstat',
                '--date=iso-strict',
                // %x00 separates records; fields per record: hash, author, email, ISO date, subject
                '--pretty=format:%x00%H%n%an%n%ae%n%aI%n%s%n',
                '--invert-grep',
                '--grep=^WIP',
                '--grep=^stash',
                '--grep=^\\[STASH\\]',
                '--grep=^\\[stash\\]'
            ];

            if (!(days === 0 && startDateStr === undefined && endDateStr === undefined)) {
                // ISO 8601 with explicit offset avoids timezone ambiguity in --since/--until.
                rawArgs.push('--since', startDate.format('YYYY-MM-DDTHH:mm:ssZ'));
                rawArgs.push('--until', endDate.format('YYYY-MM-DDTHH:mm:ssZ'));
            }

            if (authorFilter && authorFilter !== 'all') {
                rawArgs.push('--author=' + authorFilter);
            }

            const rawOutput = await this.git.raw(rawArgs);

            if (!rawOutput || !rawOutput.trim()) {
                return { authorStats: {}, fileStats: [], ownership: [], wordFreq: {}, commitDetails: {}, heatmapDetails: {}, health: emptyHealthRaw(), dirActivity: {} };
            }

            const parsed = parseGitLog(rawOutput, file => this.shouldIncludeFile(file));

            if (Object.keys(parsed.stats).length === 0) {
                return { authorStats: {}, fileStats: [], ownership: [], wordFreq: {}, commitDetails: {}, heatmapDetails: {}, dirActivity: {} };
            }

            // Auto-compute actual date range from commit data when days === 0 (Full History)
            if (days === 0 && startDateStr === undefined && endDateStr === undefined) {
                let minDate = moment();
                let maxDate = moment(0);
                for (const author in parsed.stats) {
                    for (const dateKey of Object.keys(parsed.stats[author].dailyStats)) {
                        const d = moment(dateKey);
                        if (d.isBefore(minDate)) minDate = d;
                        if (d.isAfter(maxDate)) maxDate = d;
                    }
                }
                if (minDate.isValid() && maxDate.isValid() && minDate.isSameOrBefore(maxDate)) {
                    startDate = minDate.startOf('day');
                    endDate = maxDate.endOf('day');
                } else {
                    startDate = moment().subtract(6, 'days').startOf('day');
                    endDate = moment().endOf('day');
                }
            }

            // Finalize authors: attach the (possibly auto-computed) range and
            // compute streaks from the sparse daily stats — no zero-filling.
            const stats: { [author: string]: AuthorStats } = {};
            for (const [author, mutable] of Object.entries(parsed.stats)) {
                stats[author] = {
                    ...mutable,
                    startDate,
                    endDate,
                    ...computeStreakStats(mutable.dailyStats, startDate, endDate)
                };
            }

            const fileStats: FileChangeStats[] = Array.from(parsed.fileChanges.entries())
                .map(([file, data]) => ({
                    file,
                    totalCommits: data.commits,
                    totalInsertions: data.insertions,
                    totalDeletions: data.deletions
                }))
                .sort((a, b) => b.totalCommits - a.totalCommits);

            const ownership: OwnershipEntry[] = Array.from(parsed.fileAuthorLines.entries())
                .map(([file, authorLines]) => {
                    const totalLines = Array.from(authorLines.values()).reduce((s, v) => s + v, 0);
                    let primaryAuthor = '';
                    let maxLines = 0;
                    for (const [author, lines] of authorLines) {
                        if (lines > maxLines) {
                            maxLines = lines;
                            primaryAuthor = author;
                        }
                    }
                    const dir = directoryOf(file);
                    return {
                        path: file,
                        directory: dir,
                        linesByAuthor: Object.fromEntries(authorLines),
                        totalLines,
                        primaryAuthor,
                        primaryAuthorPercentage: totalLines > 0 ? Math.round((maxLines / totalLines) * 100) : 0
                    };
                })
                .sort((a, b) => b.totalLines - a.totalLines);

            const wordFreqArr = Array.from(parsed.wordFreq.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 100);
            const wordFreq: { [word: string]: number } = {};
            for (const [word, count] of wordFreqArr) {
                wordFreq[word] = count;
            }

            return {
                authorStats: stats,
                fileStats,
                ownership,
                wordFreq,
                commitDetails: parsed.commitDetails,
                heatmapDetails: parsed.heatmapDetails,
                health: parsed.health,
                dirActivity: parsed.dirActivity
            };
        } catch (error) {
            console.error('Error analyzing git log:', error);
            throw error;
        }
    }
}
