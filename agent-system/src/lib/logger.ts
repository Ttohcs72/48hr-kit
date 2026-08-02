/**
 * Structured, single-line logs so GitHub Actions run logs stay greppable
 * (e.g. `grep '"level":"error"'` across a run) instead of scattered prose.
 */
type Level = "info" | "warn" | "error";

function log(level: Level, msg: string, extra?: Record<string, unknown>) {
  const line = { ts: new Date().toISOString(), level, msg, ...extra };
  const out = level === "error" ? console.error : console.log;
  out(JSON.stringify(line));
}

export const logger = {
  info: (msg: string, extra?: Record<string, unknown>) => log("info", msg, extra),
  warn: (msg: string, extra?: Record<string, unknown>) => log("warn", msg, extra),
  error: (msg: string, extra?: Record<string, unknown>) => log("error", msg, extra),
};
