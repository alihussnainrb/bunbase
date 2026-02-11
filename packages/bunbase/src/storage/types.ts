export interface StorageAdapter {
	/** Upload a file to storage */
	upload(key: string, data: Buffer | Uint8Array | ReadableStream, opts?: UploadOptions): Promise<void>
	/** Download a file from storage */
	download(key: string): Promise<Buffer | null>
	/** Delete a file from storage */
	delete(key: string): Promise<void>
	/** Check if a file exists */
	exists(key: string): Promise<boolean>
	/** List files with optional prefix filter */
	list(prefix?: string): Promise<string[]>
	/** Get a URL for the file (presigned for S3, file:// for local) */
	getUrl(key: string): Promise<string>
}

export interface UploadOptions {
	contentType?: string
	metadata?: Record<string, string>
}
