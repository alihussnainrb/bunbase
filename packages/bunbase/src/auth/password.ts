/**
 * Hash a password using Argon2id (Bun default)
 */
export async function hashPassword(password: string): Promise<string> {
	return await Bun.password.hash(password)
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(
	password: string,
	hash: string,
): Promise<boolean> {
	return await Bun.password.verify(password, hash)
}
