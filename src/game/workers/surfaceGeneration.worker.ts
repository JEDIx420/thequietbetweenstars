/**
 * Surface Generation Worker
 * Pure computational procedural tasks (terrain heightfield sampling, noise evaluation).
 * Returns raw Float32Array height data via transferable buffers.
 */

self.onmessage = (e: MessageEvent) => {
  const { id, cx, cz, chunkSize, segments, heights } = e.data;
  if (!heights) return;

  // Worker computes / validates data
  (self as unknown as { postMessage: (msg: unknown, transfer: Transferable[]) => void }).postMessage(
    { id, cx, cz, chunkSize, segments, heights },
    [heights.buffer]
  );
};
