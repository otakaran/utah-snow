// One-line JSON logs and `key=` redaction (spec §5.2). The repo, /api/snapshot and /api/health are public,
// so every log line and every stored `error` string goes through redact().

const KEY_RE = /\bkey=[^&\s"',;)]*/gi;

/** Replace every `key=<value>` with `key=***`. */
export function redact(s: string): string {
  return s.replace(KEY_RE, 'key=***');
}

/** Short, redacted message for an unknown thrown value. */
export function errorText(err: unknown, max = 300): string {
  const msg = err instanceof Error ? `${err.name === 'Error' ? '' : `${err.name}: `}${err.message}` : String(err);
  return redact(msg).slice(0, max);
}

/** console.log one JSON line (Workers Logs indexes it); string values are redacted. */
export function logLine(fields: Record<string, unknown>): void {
  console.log(redact(JSON.stringify(fields)));
}
