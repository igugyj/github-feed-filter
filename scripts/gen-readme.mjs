// Fill README.template.md with build metadata, test counts and coverage
// results, then write the result to dist/README.md.
//
// Environment:
//   GFF_VERSION   version shown in the banner and README (default: package.json)
//   GFF_BRANCH    source branch (default: current git branch)
//   GFF_COMMIT    source commit SHA (default: current git HEAD)
//   GFF_DATE      build date string (default: current UTC time)
//   GFF_TRIGGER   trigger description (default: "manual")
//   GFF_TAG       tag name, may be empty
//   GFF_REPO      owner/name (default: parsed from package.json)
//   GFF_RUN_URL   workflow run URL (default: repository Actions page)
//
// Inputs:
//   coverage/coverage-summary.json   c8 json-summary report
//   .ci/tests.log                    output of `npm run coverage`
//   .ci/dom.log                      output of `npm run test:dom`
//   dist/main.js                     built userscript (size only)
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const env = (name, fallback = '') => process.env[name] || fallback;

function git(args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

const version = env('GFF_VERSION', pkg.version).replace(/^v/, '');
const branch = env('GFF_BRANCH') || git(['rev-parse', '--abbrev-ref', 'HEAD']) || 'main';
const commit = env('GFF_COMMIT') || git(['rev-parse', 'HEAD']) || 'unknown';
const commitShort = commit.slice(0, 7);
const date = env('GFF_DATE') || new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
const trigger = env('GFF_TRIGGER', 'manual');
const tag = env('GFF_TAG');

const repo = env(
  'GFF_REPO',
  (pkg.repository?.url || 'https://github.com/igugyj/github-feed-filter.git')
    .replace(/^git\+/, '')
    .replace(/^https?:\/\/github\.com\//, '')
    .replace(/\.git$/, '')
);
const repoUrl = `https://github.com/${repo}`;
const runUrl = env('GFF_RUN_URL', `${repoUrl}/actions`);
const sourceUrl = `${repoUrl}/tree/${branch}`;
const commitUrl = `${repoUrl}/commit/${commit}`;
const rawUrl = `https://raw.githubusercontent.com/${repo}/release/main.js`;

// ---- bundle size ----------------------------------------------------------

const bundlePath = join(root, 'dist', 'main.js');
if (!existsSync(bundlePath)) {
  throw new Error('dist/main.js is missing; build the userscript before generating the README');
}
const bundleBytes = statSync(bundlePath).size;
const bundleSize = `${(bundleBytes / 1024).toFixed(1)} KB (${bundleBytes.toLocaleString('en-US')} bytes)`;

// ---- test counts ----------------------------------------------------------

function readLog(name) {
  const file = join(root, '.ci', name);
  if (!existsSync(file)) {
    console.warn(`[gen-readme] warning: ${file} is missing`);
    return '';
  }
  return readFileSync(file, 'utf8');
}

function count(text, pattern) {
  const match = text.match(pattern);
  return match ? Number(match[1]) : null;
}

const testsLog = readLog('tests.log');
const domLog = readLog('dom.log');
const unitCount = count(testsLog, /(\d+) unit tests passed/);
const sourceCount = count(testsLog, /(\d+) source tests passed/);
const domCount = count(domLog, /(\d+) DOM tests passed/);
const counts = [unitCount, sourceCount, domCount];
const totalCount = counts.every(n => n !== null)
  ? counts.reduce((sum, n) => sum + n, 0)
  : null;
const show = n => (n === null ? '-' : String(n));

// ---- coverage -------------------------------------------------------------

const summaryPath = join(root, 'coverage', 'coverage-summary.json');
if (!existsSync(summaryPath)) {
  throw new Error('coverage/coverage-summary.json is missing; run `npm run coverage` first');
}
const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));

const metrics = [
  ['Lines', 'lines'],
  ['Statements', 'statements'],
  ['Functions', 'functions'],
  ['Branches', 'branches']
];

const coverageRows = metrics
  .map(([label, key]) => {
    const m = summary.total[key];
    return `| ${label} | ${m.covered.toLocaleString('en-US')} | ${m.total.toLocaleString('en-US')} | ${m.pct}% |`;
  })
  .join('\n');

function relative(file) {
  const normalized = file.replace(/\\/g, '/');
  const index = normalized.indexOf('/src/');
  return index >= 0 ? normalized.slice(index + 1) : normalized;
}

const files = Object.keys(summary)
  .filter(key => key !== 'total')
  .sort((a, b) => relative(a).localeCompare(relative(b)));

const coverageTable = [
  '| File | Lines | Statements | Branches | Functions |',
  '| --- | ---: | ---: | ---: | ---: |',
  ...files.map(file => {
    const m = summary[file];
    return `| \`${relative(file)}\` | ${m.lines.pct}% | ${m.statements.pct}% | ${m.branches.pct}% | ${m.functions.pct}% |`;
  }),
  `| **Total** | **${summary.total.lines.pct}%** | **${summary.total.statements.pct}%** | **${summary.total.branches.pct}%** | **${summary.total.functions.pct}%** |`
].join('\n');

// ---- render ---------------------------------------------------------------

const replacements = {
  VERSION: version,
  BRANCH: branch,
  SOURCE_URL: sourceUrl,
  COMMIT_SHORT: commitShort,
  COMMIT_URL: commitUrl,
  DATE: date,
  TRIGGER: trigger,
  TAG: tag || '-',
  RUN_URL: runUrl,
  RAW_URL: rawUrl,
  BUNDLE_SIZE: bundleSize,
  TEST_UNIT: show(unitCount),
  TEST_SOURCE: show(sourceCount),
  TEST_DOM: show(domCount),
  TEST_TOTAL: show(totalCount),
  COVERAGE_ROWS: coverageRows,
  COVERAGE_TABLE: coverageTable,
  REPO_URL: repoUrl
};

let readme = readFileSync(join(root, 'README.template.md'), 'utf8');
readme = readme.replace(/\{\{([A-Z0-9_]+)\}\}/g, (match, key) => {
  if (!(key in replacements)) {
    throw new Error(`README.template.md uses an unknown placeholder: ${match}`);
  }
  return replacements[key];
});

mkdirSync(join(root, 'dist'), { recursive: true });
const outfile = join(root, 'dist', 'README.md');
writeFileSync(outfile, readme);
console.log(`[gen-readme] ${outfile} written for v${version} (${branch}@${commitShort})`);
