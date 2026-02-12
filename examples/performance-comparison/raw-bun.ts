/**
 * Raw Bun.serve hello world for performance comparison
 */

Bun.serve({
	port: 3001,
	fetch(req) {
		const url = new URL(req.url)

		if (url.pathname === '/hello') {
			return new Response(JSON.stringify({ message: 'Hello World' }), {
				headers: { 'Content-Type': 'application/json' },
			})
		}

		return new Response('Not Found', { status: 404 })
	},
})

console.log('Raw Bun.serve listening on http://localhost:3001')
