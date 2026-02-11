export class Password {
	/**
	 * Hash a password using Argon2id (Bun default)
	 */
	static async hash(password: string): Promise<string> {
		return await Bun.password.hash(password)
	}

	/**
	 * Verify a password against a hash
	 */
	static async verify(password: string, hash: string): Promise<boolean> {
		return await Bun.password.verify(password, hash)
	}
}
