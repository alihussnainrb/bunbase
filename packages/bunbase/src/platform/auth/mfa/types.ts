/**
 * MFA Types
 * Types for Multi-Factor Authentication (OTP, TOTP, Backup Codes)
 */

import type { UserId, ChallengeId } from '../../core/types.ts'

// ====================================================================
// OTP (One-Time Password)
// ====================================================================

/**
 * OTP delivery method
 */
export type OTPDeliveryMethod = 'email' | 'sms'

/**
 * OTP code
 */
export interface OTPCode {
	id: string
	challengeId: ChallengeId
	deliveryMethod: OTPDeliveryMethod
	recipient: string
	codeHash: string
	attempts: number
	maxAttempts: number
	expiresAt: Date
	verifiedAt: Date | null
	createdAt: Date
}

/**
 * OTP request data
 */
export interface OTPRequestData {
	identifier: string // Email or phone number
	deliveryMethod: OTPDeliveryMethod
	userId?: UserId
	expiresInSeconds?: number
	maxAttempts?: number
}

/**
 * OTP verification data
 */
export interface OTPVerificationData {
	challengeId: ChallengeId
	code: string
}

/**
 * OTP verification result
 */
export interface OTPVerificationResult {
	valid: boolean
	userId?: UserId
	identifier?: string
}

// ====================================================================
// TOTP (Time-Based One-Time Password)
// ====================================================================

/**
 * TOTP algorithm
 */
export type TOTPAlgorithm = 'SHA1' | 'SHA256' | 'SHA512'

/**
 * MFA factor status
 */
export type MFAFactorStatus = 'pending' | 'active' | 'disabled'

/**
 * MFA factor type
 */
export type MFAFactorType = 'totp'

/**
 * MFA factor (TOTP authenticator)
 */
export interface MFAFactor {
	id: string
	userId: UserId
	type: MFAFactorType
	name: string | null
	secret: string
	algorithm: TOTPAlgorithm
	digits: number
	period: number
	status: MFAFactorStatus
	enrollmentChallengeId: ChallengeId | null
	verifiedAt: Date | null
	lastUsedAt: Date | null
	createdAt: Date
	updatedAt: Date
}

/**
 * TOTP enrollment data
 */
export interface TOTPEnrollmentData {
	userId: UserId
	name?: string
	algorithm?: TOTPAlgorithm
	digits?: number
	period?: number
}

/**
 * TOTP enrollment result
 */
export interface TOTPEnrollmentResult {
	factorId: string
	secret: string
	qrCodeDataUrl: string
	challengeId: ChallengeId
	otpauthUrl: string
}

/**
 * TOTP verification data
 */
export interface TOTPVerificationData {
	userId: UserId
	code: string
	factorId?: string
}

/**
 * TOTP enrollment verification data
 */
export interface TOTPEnrollmentVerificationData {
	challengeId: ChallengeId
	code: string
}

/**
 * TOTP enrollment verification result
 */
export interface TOTPEnrollmentVerificationResult {
	factorId: string
	backupCodes: string[]
}

// ====================================================================
// BACKUP CODES
// ====================================================================

/**
 * MFA backup code
 */
export interface MFABackupCode {
	id: string
	userId: UserId
	codeHash: string
	usedAt: Date | null
	createdAt: Date
}

/**
 * Backup code verification data
 */
export interface BackupCodeVerificationData {
	userId: UserId
	code: string
}

/**
 * Backup code verification result
 */
export interface BackupCodeVerificationResult {
	valid: boolean
	remainingCodes: number
}

// ====================================================================
// STEP-UP AUTHENTICATION
// ====================================================================

/**
 * Step-up authentication method
 */
export type StepUpMethod = 'password' | 'totp' | 'backup_code'

/**
 * Step-up session
 */
export interface StepUpSession {
	id: string
	userId: UserId
	sessionId: string
	method: StepUpMethod
	expiresAt: Date
	createdAt: Date
}

/**
 * Step-up verification data
 */
export interface StepUpVerificationData {
	userId: UserId
	sessionId: string
	method: StepUpMethod
	credential: string // Password, TOTP code, or backup code
}

/**
 * Step-up verification result
 */
export interface StepUpVerificationResult {
	valid: boolean
	stepUpSessionId: string
	expiresAt: Date
}

// ====================================================================
// MFA STATUS
// ====================================================================

/**
 * User MFA status
 */
export interface UserMFAStatus {
	userId: UserId
	hasMFA: boolean
	hasTotp: boolean
	activeFactorCount: number
	backupCodesRemaining: number
	factors: Array<{
		id: string
		type: MFAFactorType
		name: string | null
		status: MFAFactorStatus
		lastUsedAt: Date | null
	}>
}
