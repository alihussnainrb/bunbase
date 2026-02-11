import type { StorageAdapter, UploadOptions } from './types.ts'

export interface S3Config {
	bucket: string
	region?: string
	endpoint?: string
	accessKeyId: string
	secretAccessKey: string
}

/**
 * S3-compatible storage adapter.
 * Uses Bun's native S3 support (Bun 1.2+).
 */
export class S3StorageAdapter implements StorageAdapter {
	private client: any

	constructor(private readonly config: S3Config) {
		// Check if Bun.S3Client is available (Bun 1.2+)
		if (typeof (Bun as any).S3Client !== 'function') {
			throw new Error('Bun.S3Client is not available. Requires Bun 1.2+.')
		}
		this.client = new (Bun as any).S3Client({
			accessKeyId: config.accessKeyId,
			secretAccessKey: config.secretAccessKey,
			region: config.region,
			endpoint: config.endpoint,
			bucket: config.bucket,
		})
	}

	async upload(key: string, data: Buffer | Uint8Array | ReadableStream, opts?: UploadOptions): Promise<void> {
		const s3File = this.client.file(key)
		await s3File.write(data, {
			type: opts?.contentType,
		})
	}

	async download(key: string): Promise<Buffer | null> {
		try {
			const s3File = this.client.file(key)
			const arrayBuffer = await s3File.arrayBuffer()
			return Buffer.from(arrayBuffer)
		} catch {
			return null
		}
	}

	async delete(key: string): Promise<void> {
		const s3File = this.client.file(key)
		await s3File.delete()
	}

	async exists(key: string): Promise<boolean> {
		try {
			const s3File = this.client.file(key)
			return await s3File.exists()
		} catch {
			return false
		}
	}

	async list(_prefix?: string): Promise<string[]> {
		// Bun.S3Client does not natively support listing objects.
		// To use list(), install @aws-sdk/client-s3 or use a compatible API.
		throw new Error('S3 list() is not natively supported by Bun.S3Client. Use @aws-sdk/client-s3 for listing.')
	}

	async getUrl(key: string): Promise<string> {
		const s3File = this.client.file(key)
		return s3File.presign({ expiresIn: 3600 })
	}
}
