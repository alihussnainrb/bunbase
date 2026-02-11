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
	/** Content-Type header (e.g., 'image/png', 'application/pdf') */
	contentType?: string
	/** Custom metadata key-value pairs */
	metadata?: Record<string, string>

	// S3-specific options (ignored by local adapter)

	/** S3 Access Control List policy */
	acl?: 'private' | 'public-read' | 'public-read-write' | 'aws-exec-read' |
	      'authenticated-read' | 'bucket-owner-read' | 'bucket-owner-full-control' |
	      'log-delivery-write'

	/** Content-Disposition header (e.g., 'attachment; filename="file.pdf"') */
	contentDisposition?: string

	/** S3 storage class */
	storageClass?: 'STANDARD' | 'DEEP_ARCHIVE' | 'EXPRESS_ONEZONE' | 'GLACIER' |
	               'GLACIER_IR' | 'INTELLIGENT_TIERING' | 'ONEZONE_IA' | 'OUTPOSTS' |
	               'REDUCED_REDUNDANCY' | 'SNOW' | 'STANDARD_IA'

	/** Request payer configuration (for requester pays buckets) */
	requestPayer?: boolean

	/** Multipart upload: size of each part in bytes (min: 5MB, max: 5120MB) */
	partSize?: number

	/** Multipart upload: number of parts to upload in parallel (max: 255) */
	queueSize?: number

	/** Number of retry attempts for failed uploads (max: 255) */
	retry?: number
}
