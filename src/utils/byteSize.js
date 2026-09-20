/**
 * Accurately estimate memory byte size of various JS data types.
 */
function estimateByteSize(payload) {
  if (payload === null || payload === undefined) return 8;

  if (Buffer.isBuffer(payload)) {
    return payload.length;
  }

  if (typeof payload === 'string') {
    return Buffer.byteLength(payload, 'utf8');
  }

  if (typeof payload === 'number') {
    return 8;
  }

  if (typeof payload === 'boolean') {
    return 4;
  }

  if (typeof payload === 'object') {
    try {
      const json = JSON.stringify(payload);
      return Buffer.byteLength(json, 'utf8');
    } catch {
      return 64; // fallback for non-serializable objects
    }
  }

  return 32;
}

module.exports = { estimateByteSize };
