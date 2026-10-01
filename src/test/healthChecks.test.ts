import { describe, it, expect } from 'vitest';
import {
    HEALTH_THRESHOLDS,
    HealthRaw,
    buildHealthReport,
    emptyHealthRaw,
    isBotAuthor,
    isDocFile,
    isFixSubject,
    isTestFile,
    mergeHealthRaw
} from '../healthChecks';
import { mergeResults } from '../mergeStats';
import { ContributionResult } from '../gitAnalyzer';

function raw(overrides: Partial<HealthRaw> = {}): HealthRaw {
    return { ...emptyHealthRaw(), ...overrides };
}

describe('isFixSubject', () => {
    it('matches conventional fix, bug, hotfix and revert subjects', () => {
        for (const subject of [
            'fix: handle empty input',
            'fixed crash on startup',
            'bugfix in parser',
            'hotfix release 1.2.1',
            'Revert "feat: add caching"',
            'regression in date parsing',
            'Bug in the importer',
            '修复登录失败',
            '回滚上一次改动'
        ]) {
            expect(isFixSubject(subject), subject).toBe(true);
        }
    });

    it('does not match words that merely contain fix/bug', () => {
        for (const subject of [
            'prefix handling for routes',
            'add fixture data',
            'debug logging cleanup',
            'feat: add user profile',
            'chore: bump dependencies',
            '增加导出功能'
        ]) {
            expect(isFixSubject(subject), subject).toBe(false);
        }
    });

    it('is safe on empty input', () => {
        expect(isFixSubject('')).toBe(false);
    });
});

describe('isTestFile / isDocFile', () => {
    it('recognizes test files across layouts and ecosystems', () => {
        for (const file of [
            'src/__tests__/a.ts',
            'test/foo.py',
            'tests/helper.rb',
            'src/foo.test.ts',
            'src/foo.spec.js',
            'pkg/foo_test.go',
            'test_bar.py',
            'core/MyTests.java',
            'api/Tests.cs',
            'src\\__tests__\\win.ts'
        ]) {
            expect(isTestFile(file), file).toBe(true);
        }
    });

    it('does not treat lookalike paths as tests', () => {
        for (const file of ['src/testable.ts', 'contest/entry.ts', 'src/latest.ts', 'src/attest.go']) {
            expect(isTestFile(file), file).toBe(false);
        }
    });

    it('recognizes documentation', () => {
        expect(isDocFile('README.md')).toBe(true);
        expect(isDocFile('docs/guide.rst')).toBe(true);
        expect(isDocFile('src/index.ts')).toBe(false);
    });
});

describe('isBotAuthor', () => {
    it('detects common bot accounts', () => {
        const cases: [string, string][] = [
            ['dependabot[bot]', '49699333+dependabot[bot]@users.noreply.github.com'],
            ['renovate[bot]', 'bot@renovateapp.com'],
            ['github-actions', 'actions@github.com'],
            ['ci-bot', 'bot@example.com'],
            ['Jenkins', 'jenkins@example.com'],
            ['my_robot', 'r@example.com'],
            ['ci', 'ci@example.com']
        ];
        for (const [name, email] of cases) {
            expect(isBotAuthor(name, email), name).toBe(true);
        }
    });

    it('does not flag ordinary people whose names contain bot/ci substrings', () => {
        const cases: [string, string][] = [
            ['Alice', 'alice@example.com'],
            ['Booth Tester', 'booth@example.com'],
            ['Boting Li', 'boting@example.com'],
            ['Bob', 'bob@example.com'],
            ['Cindy Wu', 'cindy@example.com']
        ];
        for (const [name, email] of cases) {
            expect(isBotAuthor(name, email), name).toBe(false);
        }
    });
});

describe('mergeHealthRaw', () => {
    it('sums totals and merges per-file maps', () => {
        const target = raw({
            totalCommits: 1,
            fixCommits: 1,
            fileFixCommits: { 'a.ts': 1 },
            fileSourceChanges: { 'a.ts': 2 },
            fileSourceChangesWithTest: { 'a.ts': 1 }
        });
        mergeHealthRaw(target, raw({
            totalCommits: 2,
            fixCommits: 2,
            fileFixCommits: { 'a.ts': 1, 'b.ts': 2 },
            fileSourceChanges: { 'a.ts': 3, 'b.ts': 4 },
            fileSourceChangesWithTest: { 'b.ts': 1 }
        }));

        expect(target.totalCommits).toBe(3);
        expect(target.fixCommits).toBe(3);
        expect(target.fileFixCommits).toEqual({ 'a.ts': 2, 'b.ts': 2 });
        expect(target.fileSourceChanges).toEqual({ 'a.ts': 5, 'b.ts': 4 });
        expect(target.fileSourceChangesWithTest).toEqual({ 'a.ts': 1, 'b.ts': 1 });
    });

    it('tolerates an undefined source', () => {
        const target = raw({ totalCommits: 5 });
        mergeHealthRaw(target, undefined);
        expect(target.totalCommits).toBe(5);
    });
});

describe('buildHealthReport', () => {
    it('ranks risky files by fix commits and applies the minimum-change threshold', () => {
        const report = buildHealthReport(
            raw({
                totalCommits: 10,
                fixCommits: 6,
                fileFixCommits: { 'hot.ts': 5, 'warm.ts': 2, 'rare.ts': 1, 'below.ts': 2 }
            }),
            [
                { file: 'hot.ts', totalCommits: 6 },
                { file: 'warm.ts', totalCommits: 10 },
                { file: 'rare.ts', totalCommits: 20 },
                { file: 'below.ts', totalCommits: 1 }
            ],
            {}
        );

        expect(report.riskyFiles.map(f => f.file)).toEqual(['hot.ts', 'warm.ts', 'rare.ts']);
        expect(report.riskyFiles[0]).toMatchObject({ fixCommits: 5, totalCommits: 6, fixRatio: 0.83, severity: 'high' });
        expect(report.riskyFiles[1].fixRatio).toBe(0.2);
        expect(report.riskyFiles[2].fixRatio).toBe(0.05);
    });

    it('falls back to fix commits when a file is missing from fileStats', () => {
        const report = buildHealthReport(
            raw({ totalCommits: 5, fixCommits: 3, fileFixCommits: { 'ghost.ts': 3 } }),
            [],
            {}
        );
        expect(report.riskyFiles[0]).toMatchObject({ file: 'ghost.ts', totalCommits: 3, fixRatio: 1, severity: 'medium' });
    });

    it('caps the risky file list', () => {
        const fileFixCommits: { [file: string]: number } = {};
        const fileStats: { file: string; totalCommits: number }[] = [];
        for (let i = 0; i < HEALTH_THRESHOLDS.maxRiskyFiles + 5; i++) {
            fileFixCommits['f' + i + '.ts'] = 3;
            fileStats.push({ file: 'f' + i + '.ts', totalCommits: 3 });
        }
        const report = buildHealthReport(raw({ totalCommits: 100, fixCommits: 100, fileFixCommits }), fileStats, {});
        expect(report.riskyFiles.length).toBe(HEALTH_THRESHOLDS.maxRiskyFiles);
    });

    it('computes the overall test sync rate and lists the worst source files', () => {
        const report = buildHealthReport(
            raw({
                totalCommits: 20,
                fileSourceChanges: { 'no-tests.ts': 10, 'some-tests.ts': 10, 'well-tested.ts': 10 },
                fileSourceChangesWithTest: { 'no-tests.ts': 0, 'some-tests.ts': 3, 'well-tested.ts': 10 }
            }),
            [],
            {}
        );

        expect(report.summary.sourceChanges).toBe(30);
        expect(report.summary.sourceChangesWithTest).toBe(13);
        expect(report.summary.testSyncRatio).toBe(0.43);

        expect(report.testGapFiles.map(f => f.file)).toEqual(['no-tests.ts', 'some-tests.ts']);
        expect(report.testGapFiles[0]).toMatchObject({ changes: 10, withTest: 0, testRatio: 0, severity: 'high' });
        expect(report.testGapFiles[1]).toMatchObject({ testRatio: 0.3, severity: 'medium' });
    });

    it('reports fully synced repositories as having no test gaps', () => {
        const report = buildHealthReport(
            raw({ totalCommits: 5, fileSourceChanges: { 'a.ts': 6 }, fileSourceChangesWithTest: { 'a.ts': 6 } }),
            [],
            {}
        );
        expect(report.testGapFiles).toEqual([]);
        expect(report.summary.testSyncRatio).toBe(1);
    });

    it('detects bot accounts and sorts them by commit count', () => {
        const report = buildHealthReport(raw({ totalCommits: 10 }), [], {
            'Alice': { author: 'Alice', email: 'alice@example.com', totalCommits: 6 },
            'dependabot[bot]': { author: 'dependabot[bot]', email: 'bot@github.com', totalCommits: 2 },
            'renovate[bot]': { author: 'renovate[bot]', email: 'bot@renovateapp.com', totalCommits: 9 }
        });

        expect(report.bots.map(b => b.author)).toEqual(['renovate[bot]', 'dependabot[bot]']);
        expect(report.notes.some(n => n.includes('机器人'))).toBe(true);
    });

    it('always records the mailmap note and degrades gracefully without data', () => {
        const report = buildHealthReport(undefined, [], {});
        expect(report.summary.totalCommits).toBe(0);
        expect(report.summary.testSyncRatio).toBe(1);
        expect(report.riskyFiles).toEqual([]);
        expect(report.notes.some(n => n.includes('mailmap'))).toBe(true);
        expect(report.notes.some(n => n.includes('没有可分析'))).toBe(true);
    });
});

describe('mergeResults health merging', () => {
    const base: ContributionResult = {
        authorStats: {},
        fileStats: [],
        ownership: [],
        wordFreq: {},
        commitDetails: {},
        heatmapDetails: {},
        health: raw({ totalCommits: 1, fixCommits: 1, fileFixCommits: { 'a.ts': 1 } })
    };

    it('sums health counters across repositories', () => {
        const merged = mergeResults([
            base,
            { ...base, health: raw({ totalCommits: 2, fixCommits: 0, fileFixCommits: { 'a.ts': 2 } }) }
        ]);
        expect(merged.health?.totalCommits).toBe(3);
        expect(merged.health?.fixCommits).toBe(1);
        expect(merged.health?.fileFixCommits).toEqual({ 'a.ts': 3 });
    });

    it('passes health through untouched for a single repository', () => {
        const merged = mergeResults([base]);
        expect(merged.health?.totalCommits).toBe(1);
    });
});
