#!/usr/bin/env bun

/**
 * Benchmark Comparison Tool
 *
 * Compares current benchmark results with baseline to detect performance regressions.
 *
 * Usage:
 *   bun run benchmarks/compare.ts <current-results.json> <baseline-results.json>
 *   bun run benchmarks/compare.ts benchmarks/results/results-latest.json benchmarks/results/baseline.json
 */

import { parseArgs } from 'node:util'

interface LoadTestResult {
	scenario: string
	throughput: {
		mean: number
	}
	latency: {
		mean: number
		p50: number
		p95: number
		p99: number
	}
	requests: {
		average: number
	}
	errors: number
	timeouts: number
	non2xx: number
}

interface BenchmarkResults {
	timestamp: string
	results: LoadTestResult[]
}

interface Comparison {
	scenario: string
	metric: string
	current: number
	baseline: number
	change: number
	changePercent: number
	status: 'improved' | 'regressed' | 'stable'
}

const COLORS = {
	reset: '\x1b[0m',
	bold: '\x1b[1m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	red: '\x1b[31m',
	cyan: '\x1b[36m',
}

const THRESHOLDS = {
	throughput: {
		regression: -5, // -5% throughput is regression
		improvement: 5, // +5% throughput is improvement
	},
	latency: {
		regression: 10, // +10% latency is regression
		improvement: -10, // -10% latency is improvement
	},
	errors: {
		regression: 1, // Any increase in errors is regression
	},
}

/**
 * Load results from JSON file
 */
async function loadResults(filePath: string): Promise<BenchmarkResults> {
	try {
		const file = Bun.file(filePath)
		return await file.json()
	} catch (error) {
		throw new Error(`Failed to load results from ${filePath}: ${error}`)
	}
}

/**
 * Calculate percentage change
 */
function calculateChangePercent(current: number, baseline: number): number {
	if (baseline === 0) return 0
	return ((current - baseline) / baseline) * 100
}

/**
 * Determine status based on metric type and change
 */
function determineStatus(
	metric: string,
	changePercent: number,
): 'improved' | 'regressed' | 'stable' {
	if (metric === 'throughput' || metric === 'requests/sec') {
		if (changePercent >= THRESHOLDS.throughput.improvement) return 'improved'
		if (changePercent <= THRESHOLDS.throughput.regression) return 'regressed'
		return 'stable'
	}

	if (metric.includes('latency') || metric.includes('p50') || metric.includes('p95') || metric.includes('p99')) {
		// For latency, lower is better, so signs are inverted
		if (changePercent <= THRESHOLDS.latency.improvement) return 'improved'
		if (changePercent >= THRESHOLDS.latency.regression) return 'regressed'
		return 'stable'
	}

	if (metric === 'errors') {
		if (changePercent > THRESHOLDS.errors.regression) return 'regressed'
		if (changePercent < 0) return 'improved'
		return 'stable'
	}

	return 'stable'
}

/**
 * Compare two result sets
 */
function compareResults(
	current: BenchmarkResults,
	baseline: BenchmarkResults,
): Comparison[] {
	const comparisons: Comparison[] = []

	for (const currentResult of current.results) {
		const baselineResult = baseline.results.find(
			(r) => r.scenario === currentResult.scenario,
		)

		if (!baselineResult) {
			console.warn(`${COLORS.yellow}Warning: No baseline found for scenario "${currentResult.scenario}"${COLORS.reset}`)
			continue
		}

		// Compare throughput
		const throughputChange = calculateChangePercent(
			currentResult.requests.average,
			baselineResult.requests.average,
		)
		comparisons.push({
			scenario: currentResult.scenario,
			metric: 'throughput (req/s)',
			current: currentResult.requests.average,
			baseline: baselineResult.requests.average,
			change: currentResult.requests.average - baselineResult.requests.average,
			changePercent: throughputChange,
			status: determineStatus('throughput', throughputChange),
		})

		// Compare latency metrics
		const latencyMetrics: Array<keyof LoadTestResult['latency']> = ['mean', 'p50', 'p95', 'p99']

		for (const metric of latencyMetrics) {
			const currentValue = currentResult.latency[metric]
			const baselineValue = baselineResult.latency[metric]
			const changePercent = calculateChangePercent(currentValue, baselineValue)

			comparisons.push({
				scenario: currentResult.scenario,
				metric: `latency ${metric} (ms)`,
				current: currentValue,
				baseline: baselineValue,
				change: currentValue - baselineValue,
				changePercent,
				status: determineStatus('latency', changePercent),
			})
		}

		// Compare errors
		const currentErrors = currentResult.errors + currentResult.timeouts + currentResult.non2xx
		const baselineErrors = baselineResult.errors + baselineResult.timeouts + baselineResult.non2xx

		if (currentErrors > 0 || baselineErrors > 0) {
			const errorChange = calculateChangePercent(currentErrors, baselineErrors)
			comparisons.push({
				scenario: currentResult.scenario,
				metric: 'errors',
				current: currentErrors,
				baseline: baselineErrors,
				change: currentErrors - baselineErrors,
				changePercent: errorChange,
				status: determineStatus('errors', errorChange),
			})
		}
	}

	return comparisons
}

/**
 * Format number with sign
 */
function formatNumberWithSign(num: number, decimals: number = 2): string {
	const sign = num > 0 ? '+' : ''
	return `${sign}${num.toFixed(decimals)}`
}

/**
 * Print comparison table
 */
function printComparison(comparisons: Comparison[]): void {
	console.log(`\n${COLORS.bold}${COLORS.cyan}=== Performance Comparison ===${COLORS.reset}\n`)

	// Group by scenario
	const scenarios = [...new Set(comparisons.map((c) => c.scenario))]

	for (const scenario of scenarios) {
		const scenarioComparisons = comparisons.filter((c) => c.scenario === scenario)

		console.log(`${COLORS.bold}${scenario}${COLORS.reset}`)
		console.log('┌─────────────────────────┬────────────┬────────────┬─────────────┬──────────┐')
		console.log('│ Metric                  │ Current    │ Baseline   │ Change      │ Status   │')
		console.log('├─────────────────────────┼────────────┼────────────┼─────────────┼──────────┤')

		for (const comparison of scenarioComparisons) {
			const metricStr = comparison.metric.padEnd(23).substring(0, 23)
			const currentStr = comparison.current.toFixed(2).padStart(10)
			const baselineStr = comparison.baseline.toFixed(2).padStart(10)
			const changeStr = `${formatNumberWithSign(comparison.changePercent)}%`.padStart(11)

			let statusStr: string
			let statusColor: string

			if (comparison.status === 'improved') {
				statusStr = '✓ Better'
				statusColor = COLORS.green
			} else if (comparison.status === 'regressed') {
				statusStr = '✗ Worse'
				statusColor = COLORS.red
			} else {
				statusStr = '- Same'
				statusColor = COLORS.yellow
			}

			console.log(`│ ${metricStr} │ ${currentStr} │ ${baselineStr} │ ${statusColor}${changeStr}${COLORS.reset} │ ${statusColor}${statusStr.padEnd(8)}${COLORS.reset} │`)
		}

		console.log('└─────────────────────────┴────────────┴────────────┴─────────────┴──────────┘')
		console.log('')
	}

	// Summary
	const improved = comparisons.filter((c) => c.status === 'improved').length
	const regressed = comparisons.filter((c) => c.status === 'regressed').length
	const stable = comparisons.filter((c) => c.status === 'stable').length

	console.log(`${COLORS.bold}Summary:${COLORS.reset}`)
	console.log(`  ${COLORS.green}Improved: ${improved}${COLORS.reset}`)
	console.log(`  ${COLORS.red}Regressed: ${regressed}${COLORS.reset}`)
	console.log(`  ${COLORS.yellow}Stable: ${stable}${COLORS.reset}`)

	if (regressed > 0) {
		console.log(`\n${COLORS.red}${COLORS.bold}⚠ Performance regressions detected!${COLORS.reset}`)
		process.exit(1)
	} else {
		console.log(`\n${COLORS.green}✓ No performance regressions${COLORS.reset}`)
	}
}

/**
 * Main function
 */
async function main(): Promise<void> {
	const { values, positionals } = parseArgs({
		args: process.argv.slice(2),
		options: {
			help: { type: 'boolean', short: 'h' },
		},
		allowPositionals: true,
	})

	if (values.help || positionals.length < 2) {
		console.log(`
${COLORS.bold}Benchmark Comparison Tool${COLORS.reset}

${COLORS.cyan}Usage:${COLORS.reset}
  bun run benchmarks/compare.ts <current-results.json> <baseline-results.json>

${COLORS.cyan}Description:${COLORS.reset}
  Compares current benchmark results with baseline to detect performance regressions.

  Status indicators:
    ${COLORS.green}✓ Better${COLORS.reset}  - Performance improved by threshold
    ${COLORS.red}✗ Worse${COLORS.reset}   - Performance regressed by threshold
    ${COLORS.yellow}- Same${COLORS.reset}    - Performance within acceptable range

  Thresholds:
    - Throughput: ±5% change is significant
    - Latency: ±10% change is significant
    - Errors: Any increase is regression

${COLORS.cyan}Examples:${COLORS.reset}
  bun run benchmarks/compare.ts results-latest.json results-baseline.json
  bun run benchmarks/compare.ts benchmarks/results/results-2025-02-14.json benchmarks/results/baseline.json

${COLORS.cyan}Exit Codes:${COLORS.reset}
  0 - No performance regressions
  1 - Performance regressions detected
		`)
		process.exit(values.help ? 0 : 1)
	}

	const [currentPath, baselinePath] = positionals

	console.log(`${COLORS.bold}Loading results...${COLORS.reset}`)
	console.log(`Current:  ${currentPath}`)
	console.log(`Baseline: ${baselinePath}`)

	const current = await loadResults(currentPath)
	const baseline = await loadResults(baselinePath)

	console.log(`\n${COLORS.cyan}Current results: ${current.timestamp}${COLORS.reset}`)
	console.log(`${COLORS.cyan}Baseline results: ${baseline.timestamp}${COLORS.reset}`)

	const comparisons = compareResults(current, baseline)

	printComparison(comparisons)
}

// Run
main().catch((error) => {
	console.error(`${COLORS.red}Error:${COLORS.reset}`, error)
	process.exit(1)
})
