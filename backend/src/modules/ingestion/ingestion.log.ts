import { Transform } from 'node:stream';

/**
 * Counts bytes through a download stream and logs every `everyMib` mebibytes.
 * Use after axios `responseType: 'stream'` so progress is visible on large bodies.
 */
export function byteProgressTransform(label: string, everyMib = 5): Transform {
  let total = 0;
  let lastLog = 0;
  const step = everyMib * 1024 * 1024;
  return new Transform({
    transform(chunk: Buffer, _enc, cb) {
      total += chunk.length;
      if (total - lastLog >= step) {
        ingestLog(`${label}: … ${(total / 1e6).toFixed(1)} MB received`);
        lastLog = total;
      }
      cb(null, chunk);
    },
    flush(cb) {
      ingestLog(`${label}: body stream finished`, {
        totalMib: (total / 1e6).toFixed(2),
      });
      cb();
    },
  });
}

/**
 * Structured logs for ingestion (manual script + cron). Prefix: [ingest]
 */
export function ingestLog(
  message: string,
  meta?: Record<string, string | number | boolean | undefined>
): void {
  if (meta && Object.keys(meta).length > 0) {
    // eslint-disable-next-line no-console
    console.log(`[ingest] ${message}`, meta);
  } else {
    // eslint-disable-next-line no-console
    console.log(`[ingest] ${message}`);
  }
}

export function ingestWarn(
  message: string,
  meta?: Record<string, unknown>
): void {
  // eslint-disable-next-line no-console
  console.warn(
    `[ingest] ${message}`,
    meta && Object.keys(meta).length ? meta : ''
  );
}

export function maskDatabaseUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '***';
    return u.toString();
  } catch {
    return '(unparseable DATABASE_URL)';
  }
}
