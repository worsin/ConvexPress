"use node";

export const MAX_STREAMED_SNAPSHOT_BYTES = 3 * 1024 ** 3;
const IDLE_TIMEOUT_MS = 30_000;

/** Read on demand, cancel on timeout/consumer failure, and count actual bytes. */
export async function* boundedResponseStream(body: ReadableStream<Uint8Array>, options: {
  maximumBytes?: number; expectedBytes?: number; idleTimeoutMs?: number;
} = {}): AsyncGenerator<Uint8Array> {
  const reader = body.getReader();
  let total = 0;
  let complete = false;
  try {
    for (;;) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      let next: ReadableStreamReadResult<Uint8Array>;
      try {
        next = await Promise.race([
          reader.read(),
          new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("Snapshot stream timed out")), options.idleTimeoutMs ?? IDLE_TIMEOUT_MS); }),
        ]);
      } finally { if (timer) clearTimeout(timer); }
      if (next.done) break;
      total += next.value.byteLength;
      if (total > (options.maximumBytes ?? MAX_STREAMED_SNAPSHOT_BYTES)) throw new Error("Snapshot stream exceeds the supported capacity");
      yield next.value;
    }
    if (total === 0 || (options.expectedBytes !== undefined && total !== options.expectedBytes)) throw new Error("Snapshot stream length is invalid");
    complete = true;
  } finally {
    if (!complete) void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** At most one multipart buffer is retained; the producer advances on demand. */
export async function* snapshotParts(source: AsyncIterable<Uint8Array>, chunkSize: number): AsyncGenerator<Uint8Array> {
  let buffer = new Uint8Array(chunkSize);
  let length = 0;
  let total = 0;
  for await (const chunk of source) {
    if (!(chunk instanceof Uint8Array)) throw new Error("Invalid snapshot stream chunk");
    total += chunk.byteLength;
    if (total > MAX_STREAMED_SNAPSHOT_BYTES) throw new Error("Snapshot stream exceeds the supported capacity");
    for (let offset = 0; offset < chunk.length;) {
      const count = Math.min(chunk.length - offset, chunkSize - length);
      buffer.set(chunk.subarray(offset, offset + count), length);
      offset += count; length += count;
      if (length === chunkSize) {
        yield buffer;
        buffer = new Uint8Array(chunkSize); length = 0;
      }
    }
  }
  if (total === 0) throw new Error("Snapshot stream is empty");
  if (length) yield buffer.subarray(0, length);
}

export function snapshotReadable(source: AsyncIterable<Uint8Array>): ReadableStream<Uint8Array> {
  const iterator = source[Symbol.asyncIterator]();
  return new ReadableStream({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) controller.close(); else controller.enqueue(next.value);
      } catch (error) { controller.error(error); await iterator.return?.(); }
    },
    async cancel() { await iterator.return?.(); },
  }, { highWaterMark: 0 });
}
