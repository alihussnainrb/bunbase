const res = await fetch('http://localhost:3003/math/add', {
	method: 'POST',
	headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({ a: 10, b: 5 }),
})

const data = (await res.json()) as any
console.log('Response:', JSON.stringify(data))

if (res.ok && data.data?.result === 15) {
	console.log('SUCCESS: Module loaded and action executed')
	process.exit(0)
} else {
	console.error('FAILURE: Unexpected response')
	process.exit(1)
}
