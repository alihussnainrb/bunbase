import { mkdir, unlink } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { StorageAdapter, UploadOptions } from './types.ts'

/**
 * Local filesystem storage adapter.
 * Uses Bun-native file operations for optimal performance.
 */
export class LocalStorageAdapter implements StorageAdapter {
	constructor(private readonly directory: string) {}

	async upload(
		key: string,
		data: Buffer | Uint8Array | ReadableStream,
		_opts?: UploadOptions,
	): Promise<void> {
		const filePath = join(this.directory, key)
		await mkdir(dirname(filePath), { recursive: true })
		// Convert ReadableStream to Buffer if needed
		if (data instanceof ReadableStream) {
			const reader = data.getReader()
			const chunks: Uint8Array[] = []
			while (true) {
				const { done, value } = await reader.read()
				if (done) break
				chunks.push(value)
			}
			const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0)
			const buffer = new Uint8Array(totalLength)
			let offset = 0
			for (const chunk of chunks) {
				buffer.set(chunk, offset)
				offset += chunk.length
			}
			await Bun.write(filePath, buffer)
		} else {
			await Bun.write(filePath, data)
		}
	}

	async download(key: string): Promise<Buffer | null> {
		const file = Bun.file(join(this.directory, key))
		if (!(await file.exists())) return null
		const arrayBuffer = await file.arrayBuffer()
		return Buffer.from(arrayBuffer)
	}

	async delete(key: string): Promise<void> {
		try {
			await unlink(join(this.directory, key))
		} catch {
			// File doesn't exist, ignore
		}
	}

	async exists(key: string): Promise<boolean> {
		return Bun.file(join(this.directory, key)).exists()
	}

	async list(prefix?: string): Promise<string[]> {
		const pattern = prefix ? `${prefix}**` : '**'
		const glob = new Bun.Glob(pattern)
		const results: string[] = []
		for await (const path of glob.scan({ cwd: this.directory })) {
			results.push(path)
		}
		return results
	}

	async getUrl(key: string): Promise<string> {
		return `file://${join(this.directory, key)}`
	}
}
