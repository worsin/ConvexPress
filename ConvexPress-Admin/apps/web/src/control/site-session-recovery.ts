/** One automatic retry per unresolved target/operator recovery chain. A new
 * client alone does not reset the budget; verified site access does. */
export function createSiteSessionRecovery() {
	let attempted: string | null = null;
	return {
		request(key: string, reconnect: () => void, manual = false): boolean {
			if (!manual && attempted === key) return false;
			attempted = key;
			reconnect();
			return true;
		},
		healthy(key: string) {
			if (attempted === key) attempted = null;
		},
	};
}
