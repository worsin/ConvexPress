/** Integer millisecond intervals [start,end). A disjoint dyadic cover lets a
 * point query use one index range per bit, independent of catalog age/size. */
export const SALE_TIME_END = 2 ** 53;
export const MAX_SALE_BUCKETS = 106;
export function saleIntervalBuckets(start: number, end: number): string[] {
    if (!Number.isSafeInteger(start) || start < 0 || !Number.isInteger(end) || end > SALE_TIME_END || end <= start)
        throw Error("Invalid sale interval");
    const buckets: string[] = [];
    while (start < end) {
        let level = 53, size = 2 ** level;
        while (size > end - start || start % size !== 0) {
            level--;
            size /= 2;
        }
        buckets.push(`${level}:${start / size}`);
        start += size;
    }
    if (buckets.length > MAX_SALE_BUCKETS)
        throw Error("Sale interval exceeds its index budget");
    return buckets;
}
export function salePointBuckets(now: number): string[] {
    if (!Number.isSafeInteger(now) || now < 0)
        throw Error("Invalid sale index time");
    return Array.from({ length: 54 }, (_, level) => `${level}:${Math.floor(now / 2 ** level)}`);
}
