/**
 * Benchmark script to compare Bunbase vs raw Bun.serve performance
 */

interface BenchmarkResult {
	server: string
	requests: number
	totalTime: number
	avgLatency: number
	requestsPerSecond: number
	minLatency: number
	maxLatency: number
	p50: number
	p95: number
	p99: number
}

async function benchmark(
	url: string,
	requests: number,
): Promise<BenchmarkResult> {
	const latencies: number[] = []
	const start = performance.now()

	// Warmup
	for (let i = 0; i < 100; i++) {
		await fetch(url)
	}

	// Actual benchmark
	for (let i = 0; i < requests; i++) {
		const reqStart = performance.now()
		const response = await fetch(url)
		await response.text()
		const reqEnd = performance.now()
		latencies.push(reqEnd - reqStart)
	}

	const end = performance.now()
	const totalTime = end - start

	latencies.sort((a, b) => a - b)

	return {
		server: url.includes('3000') ? 'Bunbase' : 'Raw Bun.serve',
		requests,
		totalTime,
		avgLatency: latencies.reduce((a, b) => a + b, 0) / latencies.length,
		requestsPerSecond: (requests / totalTime) * 1000,
		minLatency: Math.min(...latencies),
		maxLatency: Math.max(...latencies),
		p50: latencies[Math.floor(latencies.length * 0.5)],
		p95: latencies[Math.floor(latencies.length * 0.95)],
		p99: latencies[Math.floor(latencies.length * 0.99)],
	}
}

function printResults(results: BenchmarkResult[]) {
	console.log('\n='.repeat(80))
	console.log('PERFORMANCE COMPARISON: Bunbase vs Raw Bun.serve')
	console.log('='.repeat(80))

	for (const result of results) {
		console.log(`\n${result.server}:`)
		console.log(`  Total Requests:    ${result.requests.toLocaleString()}`)
		console.log(`  Total Time:        ${result.totalTime.toFixed(2)}ms`)
		console.log(
			`  Requests/sec:      ${result.requestsPerSecond.toFixed(2)} req/s`,
		)
		console.log(`  Avg Latency:       ${result.avgLatency.toFixed(3)}ms`)
		console.log(`  Min Latency:       ${result.minLatency.toFixed(3)}ms`)
		console.log(`  Max Latency:       ${result.maxLatency.toFixed(3)}ms`)
		console.log(`  P50 Latency:       ${result.p50.toFixed(3)}ms`)
		console.log(`  P95 Latency:       ${result.p95.toFixed(3)}ms`)
		console.log(`  P99 Latency:       ${result.p99.toFixed(3)}ms`)
	}

	// Calculate overhead
	const bunbaseResult = results.find((r) => r.server === 'Bunbase')
	const rawResult = results.find((r) => r.server === 'Raw Bun.serve')

	if (bunbaseResult && rawResult) {
		const overhead =
			((bunbaseResult.avgLatency - rawResult.avgLatency) / rawResult.avgLatency) *
			100
		const throughputDiff =
			((rawResult.requestsPerSecond - bunbaseResult.requestsPerSecond) /
				bunbaseResult.requestsPerSecond) *
			100

		console.log('\n' + '='.repeat(80))
		console.log('OVERHEAD ANALYSIS:')
		console.log('='.repeat(80))
		console.log(
			`  Latency Overhead:    ${overhead > 0 ? '+' : ''}${overhead.toFixed(2)}%`,
		)
		console.log(
			`  Throughput Diff:     ${throughputDiff > 0 ? '+' : ''}${throughputDiff.toFixed(2)}%`,
		)
		console.log(
			`  \n  Raw Bun.serve is ${(rawResult.requestsPerSecond / bunbaseResult.requestsPerSecond).toFixed(2)}x faster than Bunbase`,
		)
	}

	console.log('\n' + '='.repeat(80) + '\n')
}

async function main() {
	const TOTAL_REQUESTS = 10000

	console.log('Starting benchmark...')
	console.log(`Total requests per server: ${TOTAL_REQUESTS.toLocaleString()}\n`)

	console.log('Waiting 2 seconds for servers to be ready...')
	await Bun.sleep(2000)

	console.log('\nBenchmarking Bunbase (port 3000)...')
	const bunbaseResult = await benchmark(
		'http://localhost:3000/hello',
		TOTAL_REQUESTS,
	)

	console.log('Benchmarking Raw Bun.serve (port 3001)...')
	const rawResult = await benchmark(
		'http://localhost:3001/hello',
		TOTAL_REQUESTS,
	)

	printResults([bunbaseResult, rawResult])
}

main().catch(console.error)
