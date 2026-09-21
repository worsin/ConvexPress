/** Keep query errors explicit instead of losing the reactive subscription. */
export function recoverableCanonicalRead(read: unknown, previous: unknown): {preparing:boolean;value:unknown} {
	if (read instanceof Error) {
		const data = "data" in read ? read.data : null;
		if (data && typeof data === "object" && "code" in data &&
			(data.code === "EVENT_CALENDAR_INDEX_PENDING" || data.code === "POST_DISCOVERY_INITIALIZING"))
			return {preparing:true,value:previous};
		throw read;
	}
	return {preparing:false,value:read};
}
