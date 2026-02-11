import pc from 'picocolors'
import {
	bar,
	barEnd,
	barStart,
	stepActive,
	stepError,
	stepInfo,
	stepSuccess,
	stepWarn,
} from './symbols'

/**
 * A structured logging session with clack-style box-drawing output.
 * Created via `logger.session("title")`.
 */
export class LoggerSession {
	private startTime: number

	constructor(
		title: string,
		private output: NodeJS.WritableStream = process.stdout,
	) {
		this.startTime = Date.now()
		this.write(barStart(title))
	}

	private write(line: string): void {
		this.output.write(`${line}\n`)
	}

	/** Static info line: ◇  label: detail */
	info(label: string, detail?: string): this {
		this.write(stepInfo(label, detail))
		return this
	}

	/** In-progress step: ●  label: detail */
	step(label: string, detail?: string): this {
		this.write(stepActive(label, detail))
		return this
	}

	/** Completed step: ✔  label: detail */
	success(label: string, detail?: string): this {
		this.write(stepSuccess(label, detail))
		return this
	}

	/** Warning step: ▲  label: detail */
	warn(label: string, detail?: string): this {
		this.write(stepWarn(label, detail))
		return this
	}

	/** Error step: ✖  label: detail */
	error(label: string, detail?: string): this {
		this.write(stepError(label, detail))
		return this
	}

	/** Empty separator bar: │ */
	bar(): this {
		this.write(bar())
		return this
	}

	/** Close the session with success: └  message (Xms) */
	end(message?: string): void {
		const elapsed = Date.now() - this.startTime
		const msg = message ?? 'Done'
		this.write(bar())
		this.write(barEnd(pc.green(`${msg}`) + pc.gray(` (${elapsed}ms)`)))
		this.write('')
	}

	/** Close the session as error: └  message (Xms) */
	fail(message?: string): void {
		const elapsed = Date.now() - this.startTime
		const msg = message ?? 'Failed'
		this.write(bar())
		this.write(barEnd(pc.red(`${msg}`) + pc.gray(` (${elapsed}ms)`)))
		this.write('')
	}
}
