# Change Log

All notable changes to the "Git Stats Visualizer" extension will be documented in this file.

## [1.5.0] - 2026-10-01

### Added
- **Team Signals section** with three rules for spotting delivery risk:
  - **Burnout / overtime** — share of each author's commits made between 22:00–05:59 (in the commit's own timezone) or on a weekend, ranked by off-hours share
  - **Handover** — directories whose most active author stopped committing there and a different author took over afterwards (parallel work is not counted), reported with the switch date
  - **Knowledge concentration** — per-directory owner share, single-owner directories, and the bus factor (authors needed to cover 80% of a directory's lines)
- `src/teamSignals.ts`: dependency-free report builder with every threshold in `SIGNAL_THRESHOLDS`, covered by 16 unit tests
- Team signals CSV export

### Fixed
- Health Check numbers now follow the selected time range: the cached health counters were not refreshed when the range changed, so the panel kept showing the previous range's report
- Vendored dependencies (`node_modules/**`, `vendor/**`) are excluded from the analysis by default. A repository that once committed `node_modules/` had third-party code dominating the ownership, risk and concentration rankings

### Notes
- Per-directory author activity (commit count plus first/last commit date) is collected while parsing the git log and merged across repositories; a commit touching several files in one directory counts once

## [1.4.0] - 2026-10-01

### Added
- **Health Check section** at the top of the panel, with three rules:
  - **High-risk files (bug density)** — maps `fix`/`bug`/`hotfix`/`revert` commits (English and Chinese keywords) to the files they touched, ranked by fix commits and fix ratio
  - **Test sync** — share of source changes that came with a test change, plus the frequently changed files that need tests most
  - **Author identity** — detected bot accounts (dependabot, renovate, CI users) reported with their commit counts
- `.mailmap` support: the git log now runs with `--use-mailmap`, so aliases and old addresses collapse into a single author instead of splitting one person across several rows
- Health report CSV export
- `src/healthChecks.ts`: dependency-free predicates and report builder, covered by 19 unit tests

### Notes
- Rule thresholds (minimum changes before a file is ranked, severity ratios, list caps) are centralised in `HEALTH_THRESHOLDS` in `src/healthChecks.ts`
- A commit counts as fix-like when its subject matches `fix|fixes|fixed|bug|bugfix|hotfix|revert|regression` on a word boundary, or contains `修复|修正|缺陷|回滚|回退`

## [1.3.1] - 2026-10-01

### Security
- **Webview hardening**: Content Security Policy with a per-panel nonce; all inline event handlers removed and replaced by data attributes plus listeners inside the nonce'd script
- HTML and JSON escaping helpers (`escapeHtml`/`toSafeJson`) applied to values injected into the webview
- Sanitized error messages surfaced through notifications and the webview

### Changed
- Extracted cross-repo merging into a dedicated `src/mergeStats.ts` module covered by unit tests
- Generated-file detection is now pure path matching — no filesystem IO in the analysis hot loop
- Eliminated the double `git log` analysis that ran when merging multiple repositories
- Git log parsing hardened: `%x00` block delimiter, author email (`%ae`), ISO-8601 `--since`/`--until` filters, stash/WIP and malformed-record skipping
- Repository discovery uses a skip-list and depth limit
- Unified error handling for analysis, export and webview messaging
- `package-lock.json` is now tracked; build artifacts (`dist/`, `out/`, `vsix-package/`) are no longer committed
- Unused Moment locale files are pruned from the VSIX package
- CI workflow runs typecheck, ESLint and the unit test suite before packaging
- Pruned unused devDependencies and migrated to ESLint 9 flat config; added a vitest test suite

### Fixed
- Streak stats are recomputed after cross-repo merge instead of being carried over
- `package.json` license field aligned with the Apache-2.0 LICENSE file
- README / README_CN feature list and support links synced with actual behavior

## [1.0.0] - 2026-06-01

### Added
- **7 New Visualization Features:**
  - Hourly commits/lines distribution charts (line/bar)
  - Monthly contribution calendar with color intensity
  - File change leaderboard (top 100 files by commits)
  - Commit message word frequency analysis (with Chinese tokenization support)
  - Author activity heatmap (day × hour grid)
  - Code ownership by directory and by file (primary author + ownership %)
  - Commit streaks tracking (current & longest streak per author)
- **Auto Range & Custom Date Picker** — automatically selects the optimal range, with manual date override support
- **Multi-repo Workspace Support** — dropdown selector to switch between repos, cross-repo stats merging
- **Developer Filter** — filter all charts/tables by a single author
- **CSV Export** — export summary and file stats tables to CSV
- **PNG Export** — export any chart as PNG image
- Draggable floating pie charts for commit & lines-changed distribution
- Streak badges with color-coded indicators (hot/warm/cold)
- "Last 3 Years" time range option

### Changed
- Complete rewrite of visualization layer (moved from D3 to Chart.js v4)
- Upgraded backend data model with `ContributionResult`, `FileChangeStats`, `OwnershipEntry` types
- Default time range changed from 7 days to auto range (full history)
- Bundle chart.js locally instead of loading from CDN

### Fixed
- More informative error message when no Git repositories are found
- Removed unreachable lines in git log parsing for large repos

### Removed
- Terser minification (redundant with webpack production mode)
- D3 visualization bundle (replaced by Chart.js + plain HTML/CSS)

## [0.1.0] - 2023-11-14

### Added
- Initial release
- Interactive pie charts for commit and lines changed distribution
- Draggable chart containers
- Time range selector (Last Week to Last Year)
- Real-time data updates
- Detailed tooltips with percentage and counts
- Modern UI with smooth animations
- Memory-efficient data handling
