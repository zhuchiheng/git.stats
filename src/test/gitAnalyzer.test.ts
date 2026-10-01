import { describe, it, expect } from 'vitest';
import moment from 'moment';
import { DEFAULT_EXCLUDE_PATTERNS, computeStreakStats, isGeneratedFile, parseGitLog } from '../gitAnalyzer';

const DEFAULT_PATTERNS = DEFAULT_EXCLUDE_PATTERNS;

describe('isGeneratedFile', () => {
    it('flags files inside a Protos/ directory (forward slashes)', () => {
        expect(isGeneratedFile('Protos/Foo.cs', DEFAULT_PATTERNS)).toBe(true);
        expect(isGeneratedFile('src/Protos/generated.cs', DEFAULT_PATTERNS)).toBe(true);
    });

    it('flags files inside a Protos/ directory (backslashes)', () => {
        expect(isGeneratedFile('project\\Protos\\Foo.cs', DEFAULT_PATTERNS)).toBe(true);
    });

    it('does not treat Protos2 as a Protos directory', () => {
        expect(isGeneratedFile('src/Protos2/x.cs', DEFAULT_PATTERNS)).toBe(false);
    });

    it('matches default generated-code patterns', () => {
        expect(isGeneratedFile('api/a.pb.go', DEFAULT_PATTERNS)).toBe(true);
        expect(isGeneratedFile('deep/nested/generated/x.py', DEFAULT_PATTERNS)).toBe(true);
    });

    it('keeps ordinary source files', () => {
        expect(isGeneratedFile('src/x.ts', DEFAULT_PATTERNS)).toBe(false);
        expect(isGeneratedFile('README.md', DEFAULT_PATTERNS)).toBe(false);
    });

    it('excludes vendored dependencies at any depth', () => {
        expect(isGeneratedFile('node_modules/eslint/lib/rules/index.js', DEFAULT_PATTERNS)).toBe(true);
        expect(isGeneratedFile('packages/app/node_modules/x/index.js', DEFAULT_PATTERNS)).toBe(true);
        expect(isGeneratedFile('vendor/github.com/pkg/errors/errors.go', DEFAULT_PATTERNS)).toBe(true);
        // Not a vendored directory, just a similarly named one.
        expect(isGeneratedFile('src/node_modules_docs/a.ts', DEFAULT_PATTERNS)).toBe(false);
    });
});

describe('computeStreakStats', () => {
    it('counts sparse consecutive days only', () => {
        const dailyStats = {
            '2024-01-01': { commits: 1, insertions: 0, deletions: 0, files: 0 },
            '2024-01-02': { commits: 2, insertions: 0, deletions: 0, files: 0 },
            '2024-01-04': { commits: 1, insertions: 0, deletions: 0, files: 0 }
        };
        const stats = computeStreakStats(
            dailyStats,
            moment('2024-01-01', 'YYYY-MM-DD'),
            moment('2024-01-04', 'YYYY-MM-DD')
        );
        expect(stats.longestStreak).toBe(2);
        expect(stats.currentStreak).toBe(1);
    });
});

describe('parseGitLog', () => {
    const RAW = [
        '\u0000abc123',
        'Alice',
        'alice@x.com',
        '2024-01-02T10:00:00+08:00',
        'feat: add <script>',
        '2\t1\tsrc/a.ts',
        '-\t-\tbinary.bin',
        '\u0000def456',
        'Bob',
        'b@x.com',
        '2024-01-03T11:00:00+08:00',
        'fix bug',
        '1\t0\ta.pb.go',
        '\u0000bad000',
        'stash bot',
        's@x.com',
        '2024-01-05T09:00:00+08:00',
        'WIP stuff',
        '5\t5\tskip.ts',
        '\u0000dead00',
        'Alice',
        'alice@x.com',
        'not-a-date',
        'broken date commit',
        '1\t1\tignored.ts',
        ''
    ].join('\n');

    const parsed = parseGitLog(RAW, file => file !== 'a.pb.go');

    it('collects one entry per valid author with emails filled', () => {
        expect(Object.keys(parsed.stats).sort()).toEqual(['Alice', 'Bob']);
        expect(parsed.stats['Alice']!.email).toBe('alice@x.com');
        expect(parsed.stats['Bob']!.email).toBe('b@x.com');
    });

    it('counts commits, insertions, deletions and files per author', () => {
        const alice = parsed.stats['Alice']!;
        expect(alice.totalCommits).toBe(1);
        expect(alice.totalInsertions).toBe(2);
        expect(alice.totalDeletions).toBe(1);
        expect(alice.totalFiles).toBe(2);
        expect(alice.dailyStats['2024-01-02']).toEqual({
            commits: 1,
            insertions: 2,
            deletions: 1,
            files: 2
        });
    });

    it('treats binary numstat rows (-) as zero line counts', () => {
        const bin = parsed.fileChanges.get('binary.bin');
        expect(bin).toEqual({ commits: 1, insertions: 0, deletions: 0 });
    });

    it('respects the includeFile filter', () => {
        expect(parsed.fileChanges.has('a.pb.go')).toBe(false);
        const a = parsed.fileChanges.get('src/a.ts');
        expect(a).toEqual({ commits: 1, insertions: 2, deletions: 1 });
        // Ownership lines = insertions + deletions.
        expect(parsed.fileAuthorLines.get('src/a.ts')?.get('Alice')).toBe(3);
    });

    it('keeps html-like subjects intact in commit details', () => {
        const details = parsed.commitDetails['2024-01-02'];
        expect(details).toEqual([{ t: '10:00', a: 'Alice', m: 'feat: add <script>' }]);
    });

    it('records heatmap details keyed by day-hour', () => {
        const entry = parsed.heatmapDetails['2-10'];
        expect(entry).toEqual([{ d: '2024-01-02', t: '10:00', a: 'Alice', m: 'feat: add <script>' }]);
    });

    it('fills weekly-hourly buckets by weekday and hour', () => {
        expect(parsed.stats['Alice']!.weeklyHourly[2][10]).toBe(1);
        expect(parsed.stats['Bob']!.weeklyHourly[3][11]).toBe(1);
    });

    it('skips stash/WIP commits and records with invalid dates', () => {
        expect(Object.keys(parsed.stats)).not.toContain('stash bot');
        expect(parsed.fileChanges.has('skip.ts')).toBe(false);
        expect(parsed.fileChanges.has('ignored.ts')).toBe(false);
        expect(parsed.stats['Alice']!.totalCommits).toBe(1);
    });

    it('returns an empty result for empty input', () => {
        const empty = parseGitLog('', () => true);
        expect(Object.keys(empty.stats)).toHaveLength(0);
        expect(empty.fileChanges.size).toBe(0);
    });

    it('records per-directory author activity for included files only', () => {
        expect(parsed.dirActivity['src']!['Alice']).toEqual({
            commits: 1,
            firstDate: '2024-01-02',
            lastDate: '2024-01-02'
        });
        // binary.bin sits at the repo root → the '/' directory bucket.
        expect(parsed.dirActivity['/']!['Alice']!.commits).toBe(1);
        // Bob's only file is filtered out by includeFile.
        expect(parsed.dirActivity['src']!['Bob']).toBeUndefined();
    });

    it('counts a directory once per commit however many files it touched', () => {
        const raw = [
            '\u0000c1',
            'Alice',
            'alice@x.com',
            '2024-02-01T09:00:00+08:00',
            'work',
            '1\t0\tsrc/a.ts',
            '1\t0\tsrc/b.ts',
            '1\t0\troot.ts',
            '\u0000c2',
            'Bob',
            'b@x.com',
            '2024-03-01T09:00:00+08:00',
            'work',
            '1\t0\tsrc/c.ts',
            ''
        ].join('\n');
        const log = parseGitLog(raw, () => true);

        expect(log.dirActivity['src']!['Alice']).toEqual({
            commits: 1,
            firstDate: '2024-02-01',
            lastDate: '2024-02-01'
        });
        expect(log.dirActivity['src']!['Bob']).toEqual({
            commits: 1,
            firstDate: '2024-03-01',
            lastDate: '2024-03-01'
        });
        expect(log.dirActivity['/']!['Alice']!.commits).toBe(1);
    });
});
