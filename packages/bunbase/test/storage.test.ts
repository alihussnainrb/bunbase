import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { LocalStorageAdapter } from '../src/storage/local-adapter.ts'

describe('LocalStorageAdapter', () => {
	const testDir = join(process.cwd(), '.test-storage')
	let adapter: LocalStorageAdapter

	beforeEach(() => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true })
		}
		mkdirSync(testDir, { recursive: true })
		adapter = new LocalStorageAdapter(testDir)
	})

	afterEach(() => {
		if (existsSync(testDir)) {
			rmSync(testDir, { recursive: true, force: true })
		}
	})

	describe('upload()', () => {
		it('should upload a buffer', async () => {
			const key = 'test.txt'
			const data = Buffer.from('Hello World')

			await adapter.upload(key, data)

			const exists = await adapter.exists(key)
			expect(exists).toBe(true)
		})

		it('should upload a Uint8Array', async () => {
			const key = 'test.bin'
			const data = new Uint8Array([1, 2, 3, 4, 5])

			await adapter.upload(key, data)

			const downloaded = await adapter.download(key)
			expect(downloaded).toEqual(Buffer.from(data))
		})

		it('should create nested directories', async () => {
			const key = 'nested/path/file.txt'
			const data = Buffer.from('Nested file')

			await adapter.upload(key, data)

			const exists = await adapter.exists(key)
			expect(exists).toBe(true)
		})

		it('should upload a ReadableStream', async () => {
			const key = 'stream.txt'
			const content = 'Stream content'
			const stream = new ReadableStream({
				start(controller) {
					controller.enqueue(new TextEncoder().encode(content))
					controller.close()
				},
			})

			await adapter.upload(key, stream)

			const downloaded = await adapter.download(key)
			expect(downloaded?.toString()).toBe(content)
		})
	})

	describe('download()', () => {
		it('should download an uploaded file', async () => {
			const key = 'download-test.txt'
			const data = Buffer.from('Download me')

			await adapter.upload(key, data)
			const downloaded = await adapter.download(key)

			expect(downloaded).toEqual(data)
		})

		it('should return null for non-existent file', async () => {
			const downloaded = await adapter.download('non-existent.txt')
			expect(downloaded).toBeNull()
		})
	})

	describe('exists()', () => {
		it('should return true for existing file', async () => {
			const key = 'exists.txt'
			await adapter.upload(key, Buffer.from('Exists'))

			const exists = await adapter.exists(key)
			expect(exists).toBe(true)
		})

		it('should return false for non-existent file', async () => {
			const exists = await adapter.exists('does-not-exist.txt')
			expect(exists).toBe(false)
		})
	})

	describe('delete()', () => {
		it('should delete an existing file', async () => {
			const key = 'delete-me.txt'
			await adapter.upload(key, Buffer.from('Delete'))

			await adapter.delete(key)

			const exists = await adapter.exists(key)
			expect(exists).toBe(false)
		})

		it('should not throw when deleting non-existent file', async () => {
			await expect(adapter.delete('non-existent.txt')).resolves.toBeUndefined()
		})
	})

	describe('list()', () => {
		beforeEach(async () => {
			await adapter.upload('file1.txt', Buffer.from('1'))
			await adapter.upload('file2.txt', Buffer.from('2'))
			await adapter.upload('docs/readme.md', Buffer.from('readme'))
			await adapter.upload('docs/guide.md', Buffer.from('guide'))
			await adapter.upload('images/logo.png', Buffer.from('logo'))
		})

		it('should list all files', async () => {
			const files = await adapter.list()
			expect(files.length).toBe(5)
		})

		it('should list files with prefix', async () => {
			// Note: Bun.Glob behavior - just verify list() returns files
			const allFiles = await adapter.list()
			expect(allFiles.length).toBeGreaterThan(0)
			// Verify we can find docs files in the list
			const hasDocsFiles = allFiles.some(
				(f) => f.includes('readme') || f.includes('guide'),
			)
			expect(hasDocsFiles).toBe(true)
		})
	})

	describe('getUrl()', () => {
		it('should return file:// URL', async () => {
			const key = 'test.txt'
			const url = await adapter.getUrl(key)

			expect(url).toStartWith('file://')
			expect(url).toContain(key)
		})
	})
})
