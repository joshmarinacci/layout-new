// Collects informational metrics: codebase size, production bundle size and benchmark results.
//
//   npm run metrics            build, run benchmarks, print a report compared with the last record
//   npm run metrics -- --record    also append this run to metrics/history.jsonl (commit that file)
//
// Benchmarks are noisy (CI runners especially), so treat changes under ~10% as noise.
// Runs on Node's built-in TypeScript support: erasable type syntax only, no local imports.

import {execSync} from 'node:child_process';
import {appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {cpus, platform} from 'node:os';
import {extname, join} from 'node:path';
import {gzipSync} from 'node:zlib';

interface AreaSize {
    files: number;
    lines: number;
}

interface BenchSummary {
    meanMs: number;
    p99Ms: number;
    rmePercent: number;
    samples: number;
}

interface Metrics {
    date: string;
    commit: string;
    /** Benchmarks only compare meaningfully on the same kind of machine. */
    environment: string;
    codebase: Record<string, AreaSize>;
    bundle: {jsBytes: number; jsGzipBytes: number; cssBytes: number; cssGzipBytes: number};
    benchmarks: Record<string, BenchSummary>;
}

const AREAS = ['src', 'test', 'e2e', 'bench', 'scripts'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.css']);
const RESULTS_DIR = 'bench/results';
const HISTORY = 'metrics/history.jsonl';
const LATEST = 'metrics/latest.json';

function filesUnder(dir: string): string[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).flatMap(name => {
        const path = join(dir, name);
        if (name === 'node_modules' || name === 'results') return [];
        return statSync(path).isDirectory() ? filesUnder(path) : [path];
    });
}

function codebaseSize(): Record<string, AreaSize> {
    const sizes: Record<string, AreaSize> = {};
    for (const area of AREAS) {
        const files = filesUnder(area).filter(file => SOURCE_EXTENSIONS.has(extname(file)));
        sizes[area] = {
            files: files.length,
            lines: files.reduce((total, file) => total + readFileSync(file, 'utf8').split('\n').length, 0),
        };
    }
    return sizes;
}

function bundleSize(dist: string): Metrics['bundle'] {
    const assets = filesUnder(join(dist, 'assets'));
    const total = (extension: string, gzip: boolean) =>
        assets
            .filter(file => extname(file) === extension)
            .reduce((sum, file) => {
                const bytes = readFileSync(file);
                return sum + (gzip ? gzipSync(bytes).length : bytes.length);
            }, 0);
    return {
        jsBytes: total('.js', false),
        jsGzipBytes: total('.js', true),
        cssBytes: total('.css', false),
        cssGzipBytes: total('.css', true),
    };
}

function benchmarkResults(): Record<string, BenchSummary> {
    const results: Record<string, BenchSummary> = {};
    if (!existsSync(RESULTS_DIR)) return results;
    for (const file of readdirSync(RESULTS_DIR)
        .filter(name => name.endsWith('.json'))
        .sort()) {
        const data = JSON.parse(readFileSync(join(RESULTS_DIR, file), 'utf8'));
        results[file.replace(/\.json$/, '')] = {
            meanMs: data.latency.mean,
            p99Ms: data.latency.p99,
            rmePercent: data.latency.rme,
            samples: data.latency.samplesCount,
        };
    }
    return results;
}

function lastRecord(): Metrics | null {
    if (!existsSync(HISTORY)) return null;
    const lines = readFileSync(HISTORY, 'utf8').trim().split('\n').filter(Boolean);
    return lines.length ? (JSON.parse(lines[lines.length - 1]) as Metrics) : null;
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

function change(current: number, previous: number | undefined) {
    if (previous === undefined || previous === 0) return '';
    const percent = ((current - previous) / previous) * 100;
    if (Math.abs(percent) < 0.05) return ' (±0%)';
    return ` (${percent > 0 ? '+' : ''}${percent.toFixed(1)}%)`;
}

function report(metrics: Metrics, previous: Metrics | null): string {
    const out: string[] = [];
    out.push(`## Metrics for ${metrics.commit}`);
    out.push(`Environment: ${metrics.environment}`);
    if (previous) {
        out.push(`Compared with the last recorded run (${previous.commit}, ${previous.date.slice(0, 10)}).`);
        if (previous.environment !== metrics.environment)
            out.push(
                `Note: that run was on a different machine (${previous.environment}); benchmark changes are not comparable.`,
            );
    }
    out.push('', '### Codebase size', '', '| Area | Files | Lines |', '| --- | ---: | ---: |');
    for (const [area, size] of Object.entries(metrics.codebase)) {
        const before = previous?.codebase[area];
        out.push(
            `| ${area} | ${size.files}${change(size.files, before?.files)} | ${size.lines}${change(size.lines, before?.lines)} |`,
        );
    }
    const b = metrics.bundle,
        pb = previous?.bundle;
    out.push('', '### Production bundle', '', '| Asset | Size | Gzipped |', '| --- | ---: | ---: |');
    out.push(
        `| JavaScript | ${kb(b.jsBytes)}${change(b.jsBytes, pb?.jsBytes)} | ${kb(b.jsGzipBytes)}${change(b.jsGzipBytes, pb?.jsGzipBytes)} |`,
    );
    out.push(
        `| CSS | ${kb(b.cssBytes)}${change(b.cssBytes, pb?.cssBytes)} | ${kb(b.cssGzipBytes)}${change(b.cssGzipBytes, pb?.cssGzipBytes)} |`,
    );
    out.push(
        '',
        '### Benchmarks',
        '',
        '| Benchmark | Mean | p99 | ± | Samples |',
        '| --- | ---: | ---: | ---: | ---: |',
    );
    for (const [name, result] of Object.entries(metrics.benchmarks)) {
        const before = previous?.benchmarks[name];
        out.push(
            `| ${name} | ${result.meanMs.toFixed(3)} ms${change(result.meanMs, before?.meanMs)} | ` +
                `${result.p99Ms.toFixed(3)} ms | ${result.rmePercent.toFixed(1)}% | ${result.samples} |`,
        );
    }
    if (!Object.keys(metrics.benchmarks).length) out.push('| (no results: run `npm run bench` first) | | | | |');
    return out.join('\n');
}

const args = new Set(process.argv.slice(2));
const dist = 'dist';
if (!existsSync(join(dist, 'assets'))) {
    console.error('No production build found in dist/. Run `npx vite build` first (npm run metrics does this).');
    process.exit(1);
}

let commit = 'uncommitted';
try {
    commit = execSync('git rev-parse --short HEAD', {encoding: 'utf8'}).trim();
} catch {
    /* Not a git checkout. */
}

const metrics: Metrics = {
    date: new Date().toISOString(),
    commit,
    environment: `${platform()} · ${cpus()[0]?.model.trim() ?? 'unknown CPU'} · Node ${process.versions.node}`,
    codebase: codebaseSize(),
    bundle: bundleSize(dist),
    benchmarks: benchmarkResults(),
};
const previous = lastRecord();
const markdown = report(metrics, previous);

mkdirSync('metrics', {recursive: true});
writeFileSync(LATEST, JSON.stringify(metrics, null, 2) + '\n');
console.log(markdown);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown + '\n');
if (args.has('--record')) {
    appendFileSync(HISTORY, JSON.stringify(metrics) + '\n');
    console.log(`\nRecorded in ${HISTORY}.`);
}
