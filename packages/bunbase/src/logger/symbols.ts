import isUnicodeSupported from 'is-unicode-supported'
import pc from 'picocolors'

const unicode = isUnicodeSupported()
const u = (c: string, fallback: string) => (unicode ? c : fallback)

// ── Box-drawing ──────────────────────────────────────────
export const S_BAR_START: string = u('┌', 'T')
export const S_BAR: string = u('│', '|')
export const S_BAR_END: string = u('└', '-')

// ── Step symbols ─────────────────────────────────────────
export const S_STEP_SUBMIT: string = u('◇', 'o')
export const S_RADIO_ACTIVE: string = u('●', '>')
export const S_SUCCESS: string = u('✔', '√')
export const S_ERROR: string = u('✖', 'x')
export const S_WARN: string = u('▲', '!')
export const S_INFO: string = u('●', '•')

// ── Colored helpers ──────────────────────────────────────
export const bar = (): string => pc.gray(S_BAR)
export const barStart = (text: string) => `${pc.gray(S_BAR_START)}  ${text}`
export const barEnd = (text: string) => `${pc.gray(S_BAR_END)}  ${text}`

export const stepInfo = (label: string, detail?: string) =>
	`${pc.green(S_STEP_SUBMIT)}  ${label}${detail ? `: ${detail}` : ''}`
export const stepActive = (label: string, detail?: string) =>
	`${pc.cyan(S_RADIO_ACTIVE)}  ${label}${detail ? `: ${detail}` : ''}`
export const stepSuccess = (label: string, detail?: string) =>
	`${pc.green(S_SUCCESS)}  ${label}${detail ? `: ${detail}` : ''}`
export const stepError = (label: string, detail?: string) =>
	`${pc.red(S_ERROR)}  ${label}${detail ? `: ${detail}` : ''}`
export const stepWarn = (label: string, detail?: string) =>
	`${pc.yellow(S_WARN)}  ${label}${detail ? `: ${detail}` : ''}`
