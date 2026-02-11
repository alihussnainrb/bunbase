import { prettyPrint } from './pretty-print'
import { LoggerSession } from './session'
import type { LoggerOptions } from './types'

const LEVELS = {
	DEBUG: 10,
	INFO: 20,
	WARNING: 30,
	ERROR: 40,
	CRITICAL: 50,
} as const

type LogLevel = keyof typeof LEVELS

const levelMap: Record<string, number> = {
	debug: LEVELS.DEBUG,
	info: LEVELS.INFO,
	warn: LEVELS.WARNING,
	warning: LEVELS.WARNING,
	error: LEVELS.ERROR,
	critical: LEVELS.CRITICAL,
}

export type LogListener = (level: LogLevel, msg: string, args?: unknown) => void

export class Logger {
	private readonly listeners: LogListener[] = []
	private readonly minLevel: number

	constructor(
		private readonly options: LoggerOptions = {},
		private readonly meta: Record<string, unknown> = {},
		private readonly coreListeners: LogListener[] = [],
	) {
		this.minLevel = options.level
			? (levelMap[options.level] ?? LEVELS.INFO)
			: LEVELS.INFO
	}

	/** Create a child logger with additional metadata */
	public child(meta: Record<string, unknown>): Logger {
		return new Logger(
			this.options,
			{ ...this.meta, ...meta },
			this.coreListeners,
		)
	}

	/** Start a structured logging session with clack-style output */
	public session(title: string): LoggerSession {
		return new LoggerSession(title)
	}

	private shouldLog(messageLevel: number): boolean {
		return messageLevel >= this.minLevel
	}

	private _log(level: LogLevel, msg: string, args?: unknown): void {
		const time: number = Date.now()
		const meta: Record<string, unknown> = {
			...this.meta,
			...(args && typeof args === 'object'
				? (args as Record<string, unknown>)
				: {}),
		}
		const isVerbose = this.options.verbose ?? false
		prettyPrint({ level, time, msg, ...meta }, !isVerbose)

		this.coreListeners.forEach((listener) => {
			listener(level, msg, meta)
		})
		this.listeners.forEach((listener) => {
			listener(level, msg, meta)
		})
	}

	public info(message: string, args?: unknown): void {
		if (this.shouldLog(LEVELS.INFO)) this._log('INFO', message, args)
	}

	public error(message: string, args?: unknown): void {
		if (this.shouldLog(LEVELS.ERROR)) this._log('ERROR', message, args)
	}

	public debug(message: string, args?: unknown): void {
		if (this.shouldLog(LEVELS.DEBUG)) this._log('DEBUG', message, args)
	}

	public warn(message: string, args?: unknown): void {
		if (this.shouldLog(LEVELS.WARNING)) this._log('WARNING', message, args)
	}

	public addListener(listener: LogListener): void {
		this.listeners.push(listener)
	}
}
