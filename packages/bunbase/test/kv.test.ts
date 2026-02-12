import { beforeEach, describe, expect, it } from 'bun:test'
import { PostgresKVStore } from '../src/kv/postgres-kv.ts'

// Mock SQL pool for testing
function createMockSQL() {
	const store = new Map<string, { value: any; expires_at: Date | null }>()

	const mockSQL: any = async (
		strings: TemplateStringsArray,
		...values: any[]
	) => {
		const query = strings.join('?')

		// Handle CREATE TABLE
		if (query.includes('CREATE TABLE IF NOT EXISTS kv_store')) {
			return []
		}

		// Handle CREATE INDEX
		if (query.includes('CREATE INDEX')) {
			return []
		}

		// Handle SELECT
		if (query.includes('SELECT value FROM kv_store')) {
			const key = values[0]
			const entry = store.get(key)
			if (!entry) return []
			if (entry.expires_at && entry.expires_at < new Date()) {
				store.delete(key)
				return []
			}
			return [{ value: entry.value }]
		}

		// Handle INSERT
		if (query.includes('INSERT INTO kv_store')) {
			const [key, value, expires_at] = values
			store.set(key, {
				value: JSON.parse(value),
				expires_at: expires_at ? new Date(expires_at) : null,
			})
			return []
		}

		// Handle DELETE
		if (query.includes('DELETE FROM kv_store WHERE key')) {
			const key = values[0]
			store.delete(key)
			return []
		}

		// Handle SELECT 1 (has check)
		if (query.includes('SELECT 1 FROM kv_store')) {
			const key = values[0]
			const entry = store.get(key)
			if (!entry) return []
			if (entry.expires_at && entry.expires_at < new Date()) {
				store.delete(key)
				return []
			}
			return [{ '?column?': 1 }]
		}

		// Handle SELECT key (list)
		if (query.includes('SELECT key FROM kv_store')) {
			const now = new Date()
			const results: any[] = []

			if (query.includes('WHERE key LIKE')) {
				const prefix = values[0].replace('%', '')
				for (const [key, entry] of store.entries()) {
					if (key.startsWith(prefix)) {
						if (!entry.expires_at || entry.expires_at > now) {
							results.push({ key })
						}
					}
				}
			} else {
				for (const [key, entry] of store.entries()) {
					if (!entry.expires_at || entry.expires_at > now) {
						results.push({ key })
					}
				}
			}

			return results
		}

		return []
	}

	return mockSQL
}

describe('PostgresKVStore', () => {
	let kv: PostgresKVStore
	let mockSQL: any

	beforeEach(async () => {
		mockSQL = createMockSQL()
		kv = new PostgresKVStore(mockSQL)
		await kv.ensureTable()
	})

	describe('set() and get()', () => {
		it('should store and retrieve a string value', async () => {
			await kv.set('key1', 'value1')
			const value = await kv.get<string>('key1')
			expect(value).toBe('value1')
		})

		it('should store and retrieve an object', async () => {
			const obj = { name: 'Alice', age: 30 }
			await kv.set('user:1', obj)
			const value = await kv.get<typeof obj>('user:1')
			expect(value).toEqual(obj)
		})

		it('should store and retrieve an array', async () => {
			const arr = [1, 2, 3, 4, 5]
			await kv.set('numbers', arr)
			const value = await kv.get<number[]>('numbers')
			expect(value).toEqual(arr)
		})

		it('should return null for non-existent key', async () => {
			const value = await kv.get('non-existent')
			expect(value).toBeNull()
		})

		it('should overwrite existing value', async () => {
			await kv.set('key1', 'first')
			await kv.set('key1', 'second')
			const value = await kv.get<string>('key1')
			expect(value).toBe('second')
		})
	})

	describe('set() with TTL', () => {
		it('should store value with TTL', async () => {
			await kv.set('temp', 'expires-soon', { ttl: 3600 })
			const value = await kv.get<string>('temp')
			expect(value).toBe('expires-soon')
		})

		it('should return null for expired value', async () => {
			// Set with negative TTL to simulate expiration
			await kv.set('expired', 'old-value', { ttl: -1 })
			const value = await kv.get('expired')
			expect(value).toBeNull()
		})
	})

	describe('delete()', () => {
		it('should delete an existing key', async () => {
			await kv.set('delete-me', 'value')
			await kv.delete('delete-me')
			const value = await kv.get('delete-me')
			expect(value).toBeNull()
		})

		it('should not throw when deleting non-existent key', async () => {
			await expect(kv.delete('non-existent')).resolves.toBeUndefined()
		})
	})

	describe('has()', () => {
		it('should return true for existing key', async () => {
			await kv.set('exists', 'value')
			const exists = await kv.has('exists')
			expect(exists).toBe(true)
		})

		it('should return false for non-existent key', async () => {
			const exists = await kv.has('does-not-exist')
			expect(exists).toBe(false)
		})

		it('should return false for expired key', async () => {
			await kv.set('expired', 'value', { ttl: -1 })
			const exists = await kv.has('expired')
			expect(exists).toBe(false)
		})
	})

	describe('list()', () => {
		beforeEach(async () => {
			await kv.set('user:1', { name: 'Alice' })
			await kv.set('user:2', { name: 'Bob' })
			await kv.set('post:1', { title: 'Hello' })
			await kv.set('post:2', { title: 'World' })
			await kv.set('config', { theme: 'dark' })
		})

		it('should list all keys', async () => {
			const keys = await kv.list()
			expect(keys.length).toBe(5)
		})

		it('should list keys with prefix', async () => {
			const keys = await kv.list('user:')
			expect(keys.length).toBe(2)
			expect(keys).toContain('user:1')
			expect(keys).toContain('user:2')
		})

		it('should return empty array when no matches', async () => {
			const keys = await kv.list('nonexistent:')
			expect(keys).toEqual([])
		})

		it('should sort keys alphabetically', async () => {
			const keys = await kv.list('user:')
			expect(keys).toEqual(['user:1', 'user:2'])
		})
	})

	describe('ensureTable()', () => {
		it('should create kv_store table', async () => {
			// This test verifies that ensureTable doesn't throw
			await expect(kv.ensureTable()).resolves.toBeUndefined()
		})
	})

	describe('complex data types', () => {
		it('should handle nested objects', async () => {
			const nested = {
				user: {
					profile: {
						name: 'Alice',
						address: {
							city: 'NYC',
							country: 'USA',
						},
					},
				},
			}
			await kv.set('nested', nested)
			const value = await kv.get<typeof nested>('nested')
			expect(value).toEqual(nested)
		})

		it('should handle null values', async () => {
			await kv.set('null-value', null)
			const value = await kv.get('null-value')
			expect(value).toBeNull()
		})

		it('should handle boolean values', async () => {
			await kv.set('bool-true', true)
			await kv.set('bool-false', false)
			expect(await kv.get('bool-true')).toBe(true)
			expect(await kv.get('bool-false')).toBe(false)
		})

		it('should handle number values', async () => {
			await kv.set('int', 42)
			await kv.set('float', 3.14)
			expect(await kv.get('int')).toBe(42)
			expect(await kv.get('float')).toBe(3.14)
		})
	})
})
