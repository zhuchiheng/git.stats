"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitContributionAnalyzer = void 0;
var simple_git_1 = require("simple-git");
var moment_1 = require("moment");
var fs = require("fs");
var path = require("path");
var GitContributionAnalyzer = /** @class */ (function () {
    function GitContributionAnalyzer(git, config) {
        if (config === void 0) { config = {}; }
        this.repoPath = '';
        this.git = git;
        this.config = {
            excludePatterns: __spreadArray([
                '**/*.pb.go', // Go protobuf
                '**/*.pb.js', // JavaScript protobuf
                '**/*.pb.ts', // TypeScript protobuf
                '**/*_pb2.py', // Python protobuf v2
                '**/*_pb3.py', // Python protobuf v3
                '**/generated/**', // 通用生成目录
                '**/*.pb.cs'
            ], (config.excludePatterns || []), true)
        };
    }
    GitContributionAnalyzer.prototype.isProtobufGeneratedFile = function (filePath) {
        console.log("\nChecking file: ".concat(filePath));
        // 检查文件路径是否包含protobuf目录
        if (filePath.includes('Protos/') || filePath.includes('Protos\\')) {
            console.log("File is in Protos directory: ".concat(filePath));
            // 对于C#文件，仍然检查内容以确认
            if (filePath.toLowerCase().endsWith('.cs')) {
                try {
                    console.log("Reading C# file content: ".concat(filePath));
                    var content = fs.readFileSync(filePath, 'utf8');
                    // 只读取前几行来判断
                    var firstFewLines = content.split('\n').slice(0, 5).join('\n');
                    console.log('First few lines:', firstFewLines);
                    // 如果文件不存在，这里会抛出错误
                    return true;
                }
                catch (error) {
                    console.error("Error reading C# file ".concat(filePath, ":"), error);
                    // 如果文件不存在，仍然基于路径判断
                    return true;
                }
            }
            return true;
        }
        // 检查文件是否存在
        if (!fs.existsSync(filePath)) {
            console.log("File does not exist: ".concat(filePath));
            return false;
        }
        // 对于C#文件，检查文件内容
        if (filePath.toLowerCase().endsWith('.cs')) {
            try {
                console.log("Reading C# file content: ".concat(filePath));
                var content = fs.readFileSync(filePath, 'utf8');
                var firstFewLines_1 = content.split('\n').slice(0, 20).join('\n');
                // 检查是否包含protobuf生成文件的特征
                var markers = [
                    'Generated by the protocol buffer compiler',
                    '<auto-generated>',
                    'DO NOT EDIT',
                    'using pb = global::Google.Protobuf',
                    'using pbc = global::Google.Protobuf.Collections',
                    'namespace Google.Protobuf',
                    '#pragma warning disable'
                ];
                var isGenerated = markers.some(function (marker) { return firstFewLines_1.includes(marker); });
                if (isGenerated) {
                    console.log("Found protobuf generated C# file: ".concat(filePath));
                    console.log('First few lines:', firstFewLines_1);
                }
                return isGenerated;
            }
            catch (error) {
                console.error("Error reading C# file ".concat(filePath, ":"), error);
                return false;
            }
        }
        // 对于其他文件，使用文件名模式匹配
        var isExcluded = this.config.excludePatterns.some(function (pattern) {
            var regexPattern = pattern
                .replace(/\./g, '\\.')
                .replace(/\*\*/g, '.*')
                .replace(/\*/g, '[^/]*');
            var regex = new RegExp(regexPattern);
            var matches = regex.test(filePath);
            if (matches) {
                console.log("File matches exclude pattern ".concat(pattern, ": ").concat(filePath));
            }
            return matches;
        });
        return isExcluded;
    };
    GitContributionAnalyzer.prototype.shouldIncludeFile = function (file) {
        // 首先检查文件路径中是否包含Protos目录
        if (file.includes('Protos/') || file.includes('Protos\\')) {
            console.log("Excluding file from Protos directory: ".concat(file));
            return false;
        }
        var fullPath = path.join(this.repoPath, file);
        var shouldExclude = this.isProtobufGeneratedFile(fullPath);
        if (shouldExclude) {
            console.log("Excluding generated file: ".concat(file));
        }
        return !shouldExclude;
    };
    GitContributionAnalyzer.prototype.getLastCommitTime = function () {
        return __awaiter(this, void 0, void 0, function () {
            var log, dateStr, lastCommitTime, error_1, currentTime;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        console.log('Getting last commit time...');
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, this.git.log([
                                '-1', // 只获取最后一条提交
                                '--pretty=format:%aI' // ISO 8601 格式的作者日期
                            ])];
                    case 2:
                        log = _a.sent();
                        console.log('Last commit log:', log);
                        // 由于我们使用了自定义格式，日期会直接在 log.latest.hash 中
                        if (log && log.latest && log.latest.hash) {
                            dateStr = log.latest.hash.trim();
                            lastCommitTime = (0, moment_1.default)(dateStr);
                            if (lastCommitTime.isValid()) {
                                console.log('Last commit time:', lastCommitTime.format('YYYY-MM-DD HH:mm:ss'));
                                return [2 /*return*/, lastCommitTime];
                            }
                            else {
                                console.log('Invalid date format:', dateStr);
                            }
                        }
                        else {
                            console.log('No commit found or invalid log format:', log);
                        }
                        return [3 /*break*/, 4];
                    case 3:
                        error_1 = _a.sent();
                        console.error('Error getting last commit time:', error_1);
                        return [3 /*break*/, 4];
                    case 4:
                        currentTime = (0, moment_1.default)();
                        console.log('Using current time as fallback:', currentTime.format('YYYY-MM-DD HH:mm:ss'));
                        return [2 /*return*/, currentTime];
                }
            });
        });
    };
    GitContributionAnalyzer.prototype.getContributionStats = function () {
        return __awaiter(this, arguments, void 0, function (days, startDateStr, endDateStr) {
            var endDate, startDate, logs, stats, content, commits, _i, commits_1, commitBlock, lines, hash, author, dateStr, subject, date, dateKey, hourKey, i, line, _a, ins, del, file, insertions, deletions, author, author, currentDate, dateKey, author, hour, hourKey, error_2;
            if (days === void 0) { days = 7; }
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        console.log("Starting contribution analysis for the last ".concat(days, " days"));
                        console.log("Repository path: ".concat(this.repoPath));
                        console.log('Custom date range:', startDateStr, 'to', endDateStr);
                        if (!(startDateStr && endDateStr)) return [3 /*break*/, 1];
                        // 使用自定义日期范围
                        startDate = (0, moment_1.default)(startDateStr).startOf('day');
                        endDate = (0, moment_1.default)(endDateStr).endOf('day');
                        console.log('Using custom date range');
                        return [3 /*break*/, 3];
                    case 1:
                        // 使用预设时间范围，从最后一次提交时间开始计算
                        console.log('Using preset time range');
                        return [4 /*yield*/, this.getLastCommitTime()];
                    case 2:
                        endDate = _b.sent();
                        if (!endDate.isValid()) {
                            console.log('Invalid end date, using current time');
                            endDate = (0, moment_1.default)();
                        }
                        console.log('End date (last commit):', endDate.format('YYYY-MM-DD HH:mm:ss'));
                        // 从最后提交时间开始往前推
                        startDate = endDate.clone().subtract(days - 1, 'days').startOf('day');
                        console.log('Start date:', startDate.format('YYYY-MM-DD HH:mm:ss'));
                        // 确保包含最后一天的所有提交
                        endDate = endDate.clone().endOf('day');
                        console.log('Adjusted end date:', endDate.format('YYYY-MM-DD HH:mm:ss'));
                        _b.label = 3;
                    case 3:
                        console.log("Analyzing commits from ".concat(startDate.format('YYYY-MM-DD HH:mm:ss'), " to ").concat(endDate.format('YYYY-MM-DD HH:mm:ss')));
                        _b.label = 4;
                    case 4:
                        _b.trys.push([4, 6, , 7]);
                        return [4 /*yield*/, this.git.log([
                                '--all', // 获取所有分支
                                '--no-merges', // 不包括合并提交
                                '--numstat', // 获取更改统计
                                '--date=iso-strict', // ISO格式的日期
                                '--pretty=format:commit %H%n%an%n%aI%n%s%n', // 自定义输出格式
                                '--since', startDate.format('YYYY-MM-DD HH:mm:ss'), // 使用精确时间
                                '--until', endDate.format('YYYY-MM-DD HH:mm:ss'), // 使用精确时间
                                '--invert-grep', // 反向匹配，排除匹配的提交
                                '--grep=^WIP', // 排除 WIP 提交
                                '--grep=^stash', // 排除 stash 提交
                                '--grep=^\\[STASH\\]', // 排除 [STASH] 提交
                                '--grep=^\\[stash\\]' // 排除 [stash] 提交
                            ])];
                    case 5:
                        logs = _b.sent();
                        if (!logs || !logs.all || logs.all.length === 0) {
                            console.log('No commits found in the specified date range');
                            return [2 /*return*/, {}];
                        }
                        console.log("Found ".concat(logs.all.length, " commits in the date range"));
                        stats = {};
                        content = logs.all[0].hash;
                        commits = content.split('\ncommit ');
                        for (_i = 0, commits_1 = commits; _i < commits_1.length; _i++) {
                            commitBlock = commits_1[_i];
                            if (!commitBlock.trim())
                                continue;
                            lines = commitBlock.split('\n');
                            if (lines.length < 4)
                                continue; // 至少需要4行：hash, author, date, subject
                            hash = lines[0].trim();
                            author = lines[1].trim();
                            dateStr = lines[2].trim();
                            subject = lines[3].trim();
                            // 跳过 stash 相关的提交
                            if (author.toLowerCase().includes('stash') ||
                                subject.toLowerCase().includes('stash') ||
                                subject.startsWith('WIP') ||
                                subject.startsWith('[STASH]') ||
                                subject.startsWith('[stash]')) {
                                continue;
                            }
                            date = (0, moment_1.default)(dateStr);
                            if (!date.isValid()) {
                                continue;
                            }
                            // 初始化作者统计
                            if (!stats[author]) {
                                stats[author] = {
                                    author: author,
                                    email: '', // simple-git的log命令没有返回email
                                    startDate: startDate,
                                    endDate: endDate,
                                    totalCommits: 0,
                                    totalInsertions: 0,
                                    totalDeletions: 0,
                                    totalFiles: 0,
                                    dailyStats: {},
                                    hourlyStats: {}
                                };
                            }
                            dateKey = date.format('YYYY-MM-DD');
                            if (!stats[author].dailyStats[dateKey]) {
                                stats[author].dailyStats[dateKey] = {
                                    commits: 0,
                                    insertions: 0,
                                    deletions: 0,
                                    files: 0
                                };
                            }
                            hourKey = date.format('HH');
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
                            for (i = 4; i < lines.length; i++) {
                                line = lines[i].trim();
                                if (!line)
                                    continue;
                                _a = line.split('\t'), ins = _a[0], del = _a[1], file = _a[2];
                                if (!file)
                                    continue;
                                // 检查是否应该包含此文件
                                if (!this.shouldIncludeFile(file)) {
                                    console.log("Skipping generated file in commit ".concat(hash, ": ").concat(file));
                                    continue;
                                }
                                insertions = ins === '-' ? 0 : parseInt(ins) || 0;
                                deletions = del === '-' ? 0 : parseInt(del) || 0;
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
                        for (author in stats) {
                            // 确保 startDate 和 endDate 被正确设置到返回的统计对象中
                            stats[author].startDate = startDate;
                            stats[author].endDate = endDate;
                        }
                        // 在返回统计之前，确保每个作者的统计数据包含完整的日期范围
                        for (author in stats) {
                            currentDate = startDate.clone();
                            while (currentDate.isSameOrBefore(endDate, 'day')) {
                                dateKey = currentDate.format('YYYY-MM-DD');
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
                        for (author in stats) {
                            // 为每个小时创建统计项
                            for (hour = 0; hour < 24; hour++) {
                                hourKey = hour.toString().padStart(2, '0');
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
                        return [2 /*return*/, stats];
                    case 6:
                        error_2 = _b.sent();
                        console.error('Error analyzing git log:', error_2);
                        throw error_2;
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    GitContributionAnalyzer.prototype.analyzeRepository = function (repoPath, startDate, endDate) {
        return __awaiter(this, void 0, void 0, function () {
            var git, stats, result, commits, _i, commits_2, commitData, lines, author, email, dateStr, hash, insertions, deletions, filesChanged, _a, lines_1, line, parts, ins, dels, file, insCount, delCount, date, dateKey, hourKey, author, currentDate, dateKey, hour, hourKey, error_3;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        this.repoPath = repoPath;
                        git = (0, simple_git_1.default)(repoPath);
                        stats = {};
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, git.raw([
                                'log',
                                '--all',
                                '--no-merges',
                                '--numstat',
                                '--format=commit:%H%nauthor:%aN%nemail:%aE%ndate:%aI',
                                '--since', startDate.format('YYYY-MM-DD HH:mm:ss'),
                                '--until', endDate.format('YYYY-MM-DD HH:mm:ss')
                            ])];
                    case 2:
                        result = _b.sent();
                        commits = result.split('\ncommit:').filter(function (c) { return c.trim(); });
                        for (_i = 0, commits_2 = commits; _i < commits_2.length; _i++) {
                            commitData = commits_2[_i];
                            lines = commitData.trim().split('\n');
                            author = '', email = '', dateStr = '', hash = '';
                            insertions = 0, deletions = 0, filesChanged = 0;
                            // 解析提交头部信息
                            for (_a = 0, lines_1 = lines; _a < lines_1.length; _a++) {
                                line = lines_1[_a];
                                if (line.startsWith('commit:')) {
                                    hash = line.substring(7).trim();
                                }
                                else if (line.startsWith('author:')) {
                                    author = line.substring(7).trim();
                                }
                                else if (line.startsWith('email:')) {
                                    email = line.substring(6).trim();
                                }
                                else if (line.startsWith('date:')) {
                                    dateStr = line.substring(5).trim();
                                }
                                else if (line.trim() && !line.startsWith('commit:')) {
                                    parts = line.split('\t');
                                    if (parts.length === 3) {
                                        ins = parts[0], dels = parts[1], file = parts[2];
                                        // 检查是否应该包含此文件
                                        if (!this.shouldIncludeFile(file)) {
                                            continue;
                                        }
                                        insCount = ins === '-' ? 0 : parseInt(ins) || 0;
                                        delCount = dels === '-' ? 0 : parseInt(dels) || 0;
                                        insertions += insCount;
                                        deletions += delCount;
                                        filesChanged++;
                                    }
                                }
                            }
                            date = (0, moment_1.default)(dateStr);
                            if (!date.isValid()) {
                                continue;
                            }
                            // 初始化作者统计
                            if (!stats[author]) {
                                stats[author] = {
                                    author: author,
                                    email: email,
                                    startDate: startDate,
                                    endDate: endDate,
                                    totalCommits: 0,
                                    totalInsertions: 0,
                                    totalDeletions: 0,
                                    totalFiles: 0,
                                    dailyStats: {},
                                    hourlyStats: {}
                                };
                            }
                            dateKey = date.format('YYYY-MM-DD');
                            hourKey = date.format('HH');
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
                        for (author in stats) {
                            currentDate = startDate.clone().startOf('day');
                            while (currentDate.isSameOrBefore(endDate, 'day')) {
                                dateKey = currentDate.format('YYYY-MM-DD');
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
                            for (hour = 0; hour < 24; hour++) {
                                hourKey = hour.toString().padStart(2, '0');
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
                        return [2 /*return*/, stats];
                    case 3:
                        error_3 = _b.sent();
                        throw error_3;
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    return GitContributionAnalyzer;
}());
exports.GitContributionAnalyzer = GitContributionAnalyzer;
