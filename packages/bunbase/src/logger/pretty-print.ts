import pc from 'picocolors'

const stepTag = (step?: string) => (step ? pc.bold(pc.cyan(step)) : '')
const timestampTag = (timestamp: string) => pc.gray(timestamp)
const traceIdTag = (traceId?: string) => (traceId ? pc.gray(traceId) : '')

const levelTags: Record<string, string> = {
	error: pc.red('[ERROR]'),
	info: pc.blue('[INFO]'),
	warn: pc.yellow('[WARN]'),
	debug: pc.gray('[DEBUG]'),
}

const numericTag = (value: string) => pc.green(value)
const stringTag = (value: string) => pc.cyan(value)
const booleanTag = (value: string) => pc.blue(value)

const arrayBrackets = ['[', ']'].map((s) => pc.gray(s))
const objectBrackets = ['{', '}'].map((s) => pc.gray(s))

const prettyPrintObject = (
	obj: Record<string, any>,
	depth: number = 0,
	parentIsLast: boolean = false,
	prefix: string = '',
): string => {
	const tab = prefix + (depth === 0 ? '' : parentIsLast ? '│ ' : '│ ')

	if (depth > 2) return `${tab} └ ${pc.gray('[...]')}`

	const entries = Object.entries(obj)
	return entries
		.map(([key, value], index) => {
			const isLast = index === entries.length - 1
			const isObject = typeof value === 'object' && value !== null
			const branch = isLast ? '└' : '├'

			if (isObject) {
				const subObject = prettyPrintObject(value, depth + 1, isLast, tab)
				const [start, end] = Array.isArray(value)
					? arrayBrackets
					: objectBrackets
				return `${tab}${branch} ${key}: ${start}\n${subObject}\n${tab}${isLast ? ' ' : '│'} ${end}`
			}

			let printedValue = value
			if (typeof value === 'number') printedValue = numericTag(String(value))
			else if (typeof value === 'boolean')
				printedValue = booleanTag(String(value))
			else if (typeof value === 'string') printedValue = stringTag(value)

			return `${tab}${branch} ${key}: ${printedValue}`
		})
		.join('\n')
}

export const prettyPrint = (
	json: Record<string, any>,
	excludeDetails: boolean = false,
): void => {
	const { time, traceId, msg, flows, level, step, ...details } = json
	const levelTag = levelTags[level?.toLowerCase?.()] ?? levelTags.info
	const timestamp = timestampTag(`[${new Date(time).toLocaleTimeString()}]`)
	const objectHasKeys = Object.keys(details).length > 0

	process.stdout.write(
		`${timestamp} ${traceIdTag(traceId)} ${levelTag} ${stepTag(step)} ${msg}\n`,
	)

	if (objectHasKeys && !excludeDetails) {
		process.stdout.write(`${prettyPrintObject(details)}\n`)
	}
}
