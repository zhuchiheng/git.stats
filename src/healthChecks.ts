/**
 * Health checks over parsed git history:
 *   1. bug-density file ranking (files that keep needing fix commits),
 *   2. source/test change synchronisation,
 *   3. author identity quality (mailmap + bot account detection).
 *
 * Deliberately dependency-free: inputs are accepted structurally, so this
 * module stays trivially unit-testable and cannot form an import cycle with
 * gitAnalyzer.
 */

/** Severity labels shared with the webview renderer. */
export type Severity = 'high' | 'medium' | 'low';

/**
 * Every rule threshold lives here so sensitivity can be tuned in one place.
 * Ratios are 0..1.
 */
export const HEALTH_THRESHOLDS = {
    /** Minimum changes before a file can be called risky at all. */
    minCommitsForRisk: 3,
    /** Fix ratio at or above this (with enough fix commits) is high severity. */
    highFixRatio: 0.4,
    /** Fix commits needed alongside the ratio for high severity. */
    minFixCommitsForHigh: 5,
    /** Minimum source changes before a file is reported as a test gap. */
    minSourceChangesForTestGap: 5,
    /** Test-sync ratio below this is high severity, below the next one medium. */
    highTestGapRatio: 0.2,
    mediumTestGapRatio: 0.5,
    /** Payload caps — the panel shows the worst offenders, not everything. */
    maxRiskyFiles: 15,
    maxTestGapFiles: 15
} as const;

/**
 * Words that mark a commit as fix-like. Latin matches need letter boundaries so
 * "prefix"/"debug"/"fixture" are not counted; CJK alternatives cover Chinese
 * commit messages, which the tool's main audience writes.
 */
const FIX_SUBJECT_PATTERNS: RegExp[] = [
    /(^|[^a-z])(fix|fixes|fixed|fixing|bug|bugs|bugfix|bugfixes|hotfix|hotfixes|revert|reverts|reverted|regression)(?![a-z])/i,
    /(修复|修正|缺陷|回滚|回退|紧急修复|热修|打补丁)/
];

/** Directories whose contents are test code regardless of file name. */
const TEST_DIR = /(^|\/)(tests?|__tests__|spec|specs|testing)\//i;
/** Test file naming conventions across the ecosystems users analyse. */
const TEST_FILE_PATTERNS: RegExp[] = [
    /\.(test|spec)\.[cm]?[jt]sx?$/i,
    /\.(test|spec)\.(py|rb|go|java|cs|php|swift|kt|rs)$/i,
    /_test\.(go|py|rb|dart)$/i,
    /^test_.*\.py$/i,
    /(^|\/)test_[^/]*$/i,
    /(tests?|specs?)\.(java|cs|kt|swift)$/i
];

/** Documentation sources — excluded from "risky file" ranking. */
const DOC_PATTERNS: RegExp[] = [
    /\.(md|markdown|mdx|rst|adoc|txt)$/i,
    /(^|\/)docs?\//i,
    /(^|\/)CHANGELOG$/i,
    /(^|\/)LICENSE$/i
];

/** Bot account markers: explicit suffixes, tool names and bot-ish segments. */
const BOT_IDENTITY_PATTERNS: RegExp[] = [
    /\[bot\]/i,
    /(^|[._+-])(bot|robot|ci|automation)([._+-]|@|$)/i,
    /(dependabot|renovate|github-actions|gitlab-ci|jenkins|circleci|travis|greenkeeper|snyk|mergify|codecov|allcontributors)/i,
    /(^|\/)actions-user$/i,
    /noreply@github\.com$/i
];

/** Normalize separators so Windows-style paths behave like git's POSIX ones. */
function normalize(file: string): string {
    return file.replace(/\\/g, '/');
}

/** True when the commit subject describes a fix, bug, hotfix or revert. */
export function isFixSubject(subject: string): boolean {
    if (!subject) {
        return false;
    }
    return FIX_SUBJECT_PATTERNS.some(pattern => pattern.test(subject));
}

/** True when the path is test code. */
export function isTestFile(file: string): boolean {
    const p = normalize(file);
    return TEST_DIR.test(p) || TEST_FILE_PATTERNS.some(pattern => pattern.test(p));
}

/** True when the path is documentation. */
export function isDocFile(file: string): boolean {
    return DOC_PATTERNS.some(pattern => pattern.test(normalize(file)));
}

/** True when the author name/email looks like an automated account. */
export function isBotAuthor(name: string, email: string): boolean {
    // Match name and email separately: concatenating them inserts a separator
    // that would break the trailing-boundary group ("my_robot r@x.com").
    const matches = (value: string) => !!value && BOT_IDENTITY_PATTERNS.some(pattern => pattern.test(value));
    return matches(name) || matches(email);
}

/** Per-file facts accumulated while parsing the git log. */
export interface HealthRaw {
    totalCommits: number;
    fixCommits: number;
    /** Fix-like commits touching the file (tests/docs excluded). */
    fileFixCommits: { [file: string]: number };
    /** Non-test, non-doc files changed, per file. */
    fileSourceChanges: { [file: string]: number };
    /** Of those changes, how many commits also touched a test file. */
    fileSourceChangesWithTest: { [file: string]: number };
}

export function emptyHealthRaw(): HealthRaw {
    return {
        totalCommits: 0,
        fixCommits: 0,
        fileFixCommits: {},
        fileSourceChanges: {},
        fileSourceChangesWithTest: {}
    };
}

function addCounts(target: { [key: string]: number }, source: { [key: string]: number } | undefined): void {
    if (!source) {
        return;
    }
    for (const [key, value] of Object.entries(source)) {
        target[key] = (target[key] || 0) + (value || 0);
    }
}

/** Merge another repo's raw health facts into `target` (in place). */
export function mergeHealthRaw(target: HealthRaw, source: HealthRaw | undefined): void {
    if (!source) {
        return;
    }
    target.totalCommits += source.totalCommits || 0;
    target.fixCommits += source.fixCommits || 0;
    addCounts(target.fileFixCommits, source.fileFixCommits);
    addCounts(target.fileSourceChanges, source.fileSourceChanges);
    addCounts(target.fileSourceChangesWithTest, source.fileSourceChangesWithTest);
}

export interface RiskyFile {
    file: string;
    fixCommits: number;
    totalCommits: number;
    fixRatio: number;
    severity: Severity;
}

export interface TestGapFile {
    file: string;
    changes: number;
    withTest: number;
    testRatio: number;
    severity: Severity;
}

export interface BotIdentity {
    author: string;
    email: string;
    commits: number;
}

export interface HealthReport {
    summary: {
        totalCommits: number;
        fixCommits: number;
        fixRatio: number;
        sourceChanges: number;
        sourceChangesWithTest: number;
        testSyncRatio: number;
    };
    riskyFiles: RiskyFile[];
    testGapFiles: TestGapFile[];
    bots: BotIdentity[];
    notes: string[];
}

/** Structural inputs — callers pass gitAnalyzer's FileChangeStats/AuthorStats. */
export interface FileCountLike {
    file: string;
    totalCommits: number;
}

export interface AuthorLike {
    author: string;
    email?: string;
    totalCommits?: number;
}

function round2(value: number): number {
    return Math.round(value * 100) / 100;
}

function sum(values: number[]): number {
    return values.reduce((acc, v) => acc + v, 0);
}

/**
 * Build the health report from raw counters. Accepts `undefined` so results
 * produced before this feature existed (or by tests) degrade to "no data"
 * instead of throwing.
 */
export function buildHealthReport(
    raw: HealthRaw | undefined,
    fileStats: FileCountLike[],
    authorStats: { [author: string]: AuthorLike }
): HealthReport {
    const facts = raw || emptyHealthRaw();
    const { minCommitsForRisk, highFixRatio, minFixCommitsForHigh } = HEALTH_THRESHOLDS;

    const commitsByFile = new Map<string, number>();
    for (const entry of fileStats || []) {
        if (entry && entry.file) {
            commitsByFile.set(entry.file, entry.totalCommits || 0);
        }
    }

    const riskyFiles: RiskyFile[] = Object.entries(facts.fileFixCommits || {})
        .map(([file, fixCommits]) => {
            const totalCommits = commitsByFile.get(file) || fixCommits;
            const fixRatio = totalCommits > 0 ? fixCommits / totalCommits : 0;
            return { file, fixCommits, totalCommits, fixRatio };
        })
        .filter(entry => entry.totalCommits >= minCommitsForRisk && entry.fixCommits > 0)
        .map(entry => ({
            ...entry,
            fixRatio: round2(entry.fixRatio),
            severity: (entry.fixCommits >= minFixCommitsForHigh && entry.fixRatio >= highFixRatio
                ? 'high'
                : entry.fixCommits >= minCommitsForRisk || entry.fixRatio >= highFixRatio
                    ? 'medium'
                    : 'low') as Severity
        }))
        .sort((a, b) =>
            b.fixCommits - a.fixCommits ||
            b.fixRatio - a.fixRatio ||
            a.file.localeCompare(b.file))
        .slice(0, HEALTH_THRESHOLDS.maxRiskyFiles);

    const sourceChanges = sum(Object.values(facts.fileSourceChanges || {}));
    const sourceChangesWithTest = sum(Object.values(facts.fileSourceChangesWithTest || {}));
    // The overall rate is the unweighted mean of per-file ratios over the files
    // that meet the reporting threshold. A plain sum would be dominated by one
    // bulk-import commit that touched sources and tests together, pushing the
    // headline number to ~100% while every listed file sits near zero.
    const eligibleTestFiles = Object.entries(facts.fileSourceChanges || {})
        .filter(([, changes]) => changes >= HEALTH_THRESHOLDS.minSourceChangesForTestGap);
    const testSyncRatio = eligibleTestFiles.length > 0
        ? eligibleTestFiles.reduce((acc, [file, changes]) =>
            acc + ((facts.fileSourceChangesWithTest || {})[file] || 0) / changes, 0) / eligibleTestFiles.length
        : 1;

    const testGapFiles: TestGapFile[] = Object.entries(facts.fileSourceChanges || {})
        .map(([file, changes]) => {
            const withTest = (facts.fileSourceChangesWithTest || {})[file] || 0;
            const testRatio = changes > 0 ? withTest / changes : 1;
            return { file, changes, withTest, testRatio };
        })
        .filter(entry => entry.changes >= HEALTH_THRESHOLDS.minSourceChangesForTestGap && entry.testRatio < 1)
        .map(entry => ({
            ...entry,
            testRatio: round2(entry.testRatio),
            severity: (entry.testRatio < HEALTH_THRESHOLDS.highTestGapRatio
                ? 'high'
                : entry.testRatio < HEALTH_THRESHOLDS.mediumTestGapRatio ? 'medium' : 'low') as Severity
        }))
        .sort((a, b) =>
            a.testRatio - b.testRatio ||
            b.changes - a.changes ||
            a.file.localeCompare(b.file))
        .slice(0, HEALTH_THRESHOLDS.maxTestGapFiles);

    const bots: BotIdentity[] = Object.values(authorStats || {})
        .filter(author => author && isBotAuthor(author.author || '', author.email || ''))
        .map(author => ({
            author: author.author,
            email: author.email || '',
            commits: author.totalCommits || 0
        }))
        .sort((a, b) => b.commits - a.commits || a.author.localeCompare(b.author));

    const notes: string[] = [];
    if (facts.totalCommits === 0) {
        notes.push('没有可分析的历史数据。');
    }
    notes.push('作者身份按 .mailmap 解析（git log --use-mailmap），别名与旧邮箱会合并为同一人。');
    if (bots.length > 0) {
        notes.push('检测到 ' + bots.length + ' 个机器人账号，其提交计入总量但不代表人工产出。');
    }
    if (riskyFiles.length === 0 && facts.totalCommits > 0) {
        notes.push('没有文件达到高风险门槛（至少 ' + minCommitsForRisk + ' 次改动且出现 fix 类提交）。');
    }
    if (eligibleTestFiles.length > 0) {
        notes.push('测试同步率按改动 ≥ ' + HEALTH_THRESHOLDS.minSourceChangesForTestGap +
            ' 次的源码文件逐文件取平均，避免一次性批量导入提交把整体数字抬高。');
    }

    return {
        summary: {
            totalCommits: facts.totalCommits || 0,
            fixCommits: facts.fixCommits || 0,
            fixRatio: round2(facts.totalCommits > 0 ? (facts.fixCommits || 0) / facts.totalCommits : 0),
            sourceChanges,
            sourceChangesWithTest,
            testSyncRatio: round2(testSyncRatio)
        },
        riskyFiles,
        testGapFiles,
        bots,
        notes
    };
}
