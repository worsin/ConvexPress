/** ConvexReactClient.query may otherwise return a subscribed local result.
 * The server validates this non-authority key and executes every explicit read. */
export function freshCanonicalRead<Id, Result>(
	postId: Id,
	read: (args: { postId: Id; refreshKey: string }) => Promise<Result>,
): Promise<Result> {
	return read({ postId, refreshKey: crypto.randomUUID() });
}
