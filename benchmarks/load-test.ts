#!/usr/bin/env bun

/**
 * Load Testing Suite for Bunbase
 *
 * Runs performance benchmarks using autocannon to establish baseline metrics
 * and identify performance regressions.
 *
 * Usage:
 *   bun run benchmarks/load-test.ts
 *   bun run benchmarks/load-test.ts --scenario=simple-get
 *   bun run benchmarks/load-test.ts --duration=60 --connections=200
 */

import autocannon from 'autocannon'
import { parseArgs } from 'node:util'
import {
	type BenchmarkScenario,
	apiEndpointScenarios,
} from './scenarios/api-endpoints'

interface LoadTestOptions {
	scenario?: string
	url?: string
	duration?: number
	connections?: number
	pipelining?: number
	workers?: number
	warmup?: boolean
}

interface LoadTestResult {
	scenario: string
	url: string
	duration: number
	connections: number
	throughput: {
		mean: number
		min: number
		max: number
		total: number
	}
	latency: {
		mean: number
		p50: number
		p75: number
		p90: number
		p95: number
		p99: number
		p999: number
		max: number
	}
	requests: {
		total: number
		average: number
		sent: number
	}
	errors: number
	timeouts: number
	non2xx: number
}

const COLORS = {
	reset: '\x1b[0m',
	bold: '\x1b[1m',
	green: '\x1b[32m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	cyan: '\x1b[36m',
	red: '\x1b[31m',
}

/**
 * Run load test for a specific scenario
 */
async function runLoadTest(
	scenario: BenchmarkScenario,
	options: LoadTestOptions,
): Promise<LoadTestResult> {
	const url = options.url ?? 'http://localhost:3000'
	const duration = options.duration ?? 30
	const connections = options.connections ?? 100
	const pipelining = options.pipelining ?? 1
	const workers = options.workers ?? undefined

	console.log(`\n${COLORS.bold}${COLORS.blue}Running: ${scenario.name}${COLORS.reset}`)
	console.log(`${COLORS.cyan}Description: ${scenario.description}${COLORS.reset}`)
	console.log(`URL: ${url}`)
	console.log(`Duration: ${duration}s | Connections: ${connections} | Pipelining: ${pipelining}\n`)

	const result = await autocannon({
		url,
		connections,
		duration,
		pipelining,
		workers,
		requests: scenario.requests?.map((req) => ({
			...req,
			headers: {
				'Content-Type': 'application/json',
				...req.headers,
			},
		})),
	})

	return {
		scenario: scenario.name,
		url,
		duration,
		connections,
		throughput: {
			mean: result.throughput.mean,
			min: result.throughput.min,
			max: result.throughput.max,
			total: result.throughput.total,
		},
		latency: {
			mean: result.latency.mean,
			p50: result.latency.p50,
			p75: result.latency.p75,
			p90: result.latency.p90,
			p95: result.latency.p95,
			p99: result.latency.p99,
			p999: result.latency.p999,
			max: result.latency.max,
		},
		requests: {
			total: result.requests.total,
			average: result.requests.average,
			sent: result.requests.sent,
		},
		errors: result.errors,
		timeouts: result.timeouts,
		non2xx: result.non2xx,
	}
}

/**
 * Warm up the server before benchmarking
 */
async function warmupServer(url: string): Promise<void> {
	console.log(`${COLORS.yellow}Warming up server...${COLORS.reset}`)

	await autocannon({
		url,
		connections: 10,
		duration: 5,
	})

	console.log(`${COLORS.green}Warmup complete!${COLORS.reset}\n`)
}

/**
 * Format number with commas
 */
function formatNumber(num: number): string {
	return num.toLocaleString('en-US', { maximumFractionDigits: 2 })
}

/**
 * Format bytes
 */
function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`
	return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/**
 * Print results table
 */
function printResults(results: LoadTestResult[]): void {
	console.log(`\n${COLORS.bold}${COLORS.green}=== Benchmark Results ===${COLORS.reset}\n`)

	// Summary table
	console.log('┌────────────────────────────────┬──────────────┬────────────┬──────────┬─────────┐')
	console.log('│ Scenario                       │ Throughput   │ Latency    │ Errors   │ Success │')
	console.log('├────────────────────────────────┼──────────────┼────────────┼──────────┼─────────┤')

	for (const result of results) {
		const throughput = `${formatNumber(result.requests.average)} req/s`
		const latency = `${result.latency.p99.toFixed(2)}ms p99`
		const errors = result.errors + result.timeouts + result.non2xx
		const errorRate = ((errors / result.requests.sent) * 100).toFixed(2)
		const successRate = (100 - Number(errorRate)).toFixed(2)

		const scenarioName = result.scenario.padEnd(30).substring(0, 30)
		const throughputStr = throughput.padEnd(12)
		const latencyStr = latency.padEnd(10)
		const errorsStr = String(errors).padEnd(8)
		const successStr = `${successRate}%`.padEnd(7)

		console.log(`│ ${scenarioName} │ ${throughputStr} │ ${latencyStr} │ ${errorsStr} │ ${successStr} │`)
	}

	console.log('└────────────────────────────────┴──────────────┴────────────┴──────────┴─────────┘')

	// Detailed results
	for (const result of results) {
		console.log(`\n${COLORS.bold}${COLORS.cyan}${result.scenario}${COLORS.reset}`)
		console.log(`  Requests: ${formatNumber(result.requests.total)} total, ${formatNumber(result.requests.average)} req/s avg`)
		console.log(`  Throughput: ${formatBytes(result.throughput.mean)}/s mean, ${formatBytes(result.throughput.total)} total`)
		console.log(`  Latency:`)
		console.log(`    Mean: ${result.latency.mean.toFixed(2)}ms`)
		console.log(`    p50:  ${result.latency.p50.toFixed(2)}ms`)
		console.log(`    p95:  ${result.latency.p95.toFixed(2)}ms`)
		console.log(`    p99:  ${result.latency.p99.toFixed(2)}ms`)
		console.log(`    p999: ${result.latency.p999.toFixed(2)}ms`)
		console.log(`    Max:  ${result.latency.max.toFixed(2)}ms`)

		if (result.errors > 0 || result.timeouts > 0 || result.non2xx > 0) {
			console.log(`  ${COLORS.red}Errors: ${result.errors} | Timeouts: ${result.timeouts} | Non-2xx: ${result.non2xx}${COLORS.reset}`)
		}
	}

	console.log(`\n${COLORS.green}Benchmark complete!${COLORS.reset}`)
}

/**
 * Save results to JSON file
 */
async function saveResults(results: LoadTestResult[]): Promise<void> {
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
	const filename = `benchmarks/results/results-${timestamp}.json`

	await Bun.write(
		filename,
		JSON.stringify(
			{
				timestamp: new Date().toISOString(),
				results,
			},
			null,
			2,
		),
	)

	console.log(`\n${COLORS.green}Results saved to: ${filename}${COLORS.reset}`)
}

/**
 * Main function
 */
async function main(): Promise<void> {
	const { values } = parseArgs({
		args: process.argv.slice(2),
		options: {
			scenario: { type: 'string' },
			url: { type: 'string' },
			duration: { type: 'string' },
			connections: { type: 'string' },
			pipelining: { type: 'string' },
			workers: { type: 'string' },
			warmup: { type: 'boolean', default: true },
			help: { type: 'boolean', short: 'h' },
		},
	})

	if (values.help) {
		console.log(`
${COLORS.bold}Bunbase Load Testing Suite${COLORS.reset}

${COLORS.cyan}Usage:${COLORS.reset}
  bun run benchmarks/load-test.ts [options]

${COLORS.cyan}Options:${COLORS.reset}
  --scenario <name>       Run specific scenario (default: all)
  --url <url>             Base URL (default: http://localhost:3000)
  --duration <seconds>    Test duration (default: 30)
  --connections <n>       Concurrent connections (default: 100)
  --pipelining <n>        Requests per connection (default: 1)
  --workers <n>           Number of worker threads (default: CPU cores)
  --warmup                Warm up server before tests (default: true)
  --help, -h              Show this help message

${COLORS.cyan}Available Scenarios:${COLORS.reset}
${apiEndpointScenarios.map((s) => `  - ${s.name}: ${s.description}`).join('\n')}

${COLORS.cyan}Examples:${COLORS.reset}
  bun run benchmarks/load-test.ts
  bun run benchmarks/load-test.ts --scenario=simple-get --duration=60
  bun run benchmarks/load-test.ts --connections=200 --warmup=false
		`)
		process.exit(0)
	}

	const options: LoadTestOptions = {
		scenario: values.scenario,
		url: values.url,
		duration: values.duration ? Number(values.duration) : undefined,
		connections: values.connections ? Number(values.connections) : undefined,
		pipelining: values.pipelining ? Number(values.pipelining) : undefined,
		workers: values.workers ? Number(values.workers) : undefined,
		warmup: values.warmup,
	}

	console.log(`${COLORS.bold}${COLORS.blue}Bunbase Load Testing Suite${COLORS.reset}`)
	console.log(`${COLORS.cyan}Press Ctrl+C to stop${COLORS.reset}\n`)

	// Filter scenarios
	const scenarios = options.scenario
		? apiEndpointScenarios.filter((s) => s.name === options.scenario)
		: apiEndpointScenarios

	if (scenarios.length === 0) {
		console.error(`${COLORS.red}Error: Scenario "${options.scenario}" not found${COLORS.reset}`)
		process.exit(1)
	}

	// Warmup
	if (options.warmup) {
		await warmupServer(options.url ?? 'http://localhost:3000')
	}

	// Run tests
	const results: LoadTestResult[] = []

	for (const scenario of scenarios) {
		const result = await runLoadTest(scenario, options)
		results.push(result)

		// Small delay between tests
		if (scenarios.length > 1) {
			await new Promise((resolve) => setTimeout(resolve, 2000))
		}
	}

	// Print results
	printResults(results)

	// Save results
	await saveResults(results)
}

// Run
main().catch((error) => {
	console.error(`${COLORS.red}Error:${COLORS.reset}`, error)
	process.exit(1)
})
