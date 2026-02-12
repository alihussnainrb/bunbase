export { LocalStorageAdapter } from './local-adapter.ts'
export { type S3Config, S3StorageAdapter } from './s3-adapter.ts'
export type { StorageAdapter, UploadOptions } from './types.ts'

import { LocalStorageAdapter } from './local-adapter.ts'
import { type S3Config, S3StorageAdapter } from './s3-adapter.ts'
import type { StorageAdapter } from './types.ts'

export interface StorageConfig {
	adapter?: 'local' | 's3'
	local?: { directory?: string }
	s3?: S3Config
}

export function createStorage(config?: StorageConfig): StorageAdapter {
	if (!config || config.adapter === 'local' || !config.adapter) {
		const dir = config?.local?.directory ?? '.storage'
		return new LocalStorageAdapter(dir)
	}

	if (config.adapter === 's3') {
		if (!config.s3) throw new Error('S3 config required when adapter is "s3"')
		return new S3StorageAdapter(config.s3)
	}

	throw new Error(`Unknown storage adapter: ${config.adapter}`)
}
