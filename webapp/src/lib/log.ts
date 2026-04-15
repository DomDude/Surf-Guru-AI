/**
 * Tiny structured logger for route.ts orchestration steps.
 * Prints one JSON line per call — zero dependencies, zero config.
 * Upgrade to Pino / Sentry in Phase 5.
 */

export function logStep(params: {
  traceId: string;
  step: number;
  label: string;
  spot?: string;
  duration_ms?: number;
  meta?: Record<string, unknown>;
}): void {
  const { traceId, step, label, spot, duration_ms, meta } = params;
  console.log(
    JSON.stringify({
      traceId,
      step,
      label,
      ...(spot !== undefined && { spot }),
      ...(duration_ms !== undefined && { duration_ms }),
      ...(meta !== undefined && { meta }),
    })
  );
}

export function logError(params: {
  traceId: string;
  step: number;
  label: string;
  error: unknown;
  meta?: Record<string, unknown>;
}): void {
  const { traceId, step, label, error, meta } = params;
  console.error(
    JSON.stringify({
      traceId,
      step,
      label,
      error: error instanceof Error ? { message: error.message, stack: error.stack } : String(error),
      ...(meta !== undefined && { meta }),
    })
  );
}
