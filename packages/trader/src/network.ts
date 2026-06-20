export type RetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  label?: string;
};

export async function retryTransient<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts || !isTransientNetworkError(error)) {
        throw error;
      }
      await sleep(baseDelayMs * attempt);
    }
  }

  throw new Error(
    `${options.label ?? "operation"} failed after ${maxAttempts} attempts: ${stringifyError(lastError)}`
  );
}

export function isTransientNetworkError(error: unknown): boolean {
  const message = stringifyError(error).toLowerCase();
  return [
    "fetch failed",
    "und_err_socket",
    "socketerror",
    "socket hang up",
    "other side closed",
    "econnreset",
    "etimedout",
    "timeout",
    "temporarily unavailable",
    "too many requests",
    "429",
    "503",
    "504",
    "service unavailable",
    "bad gateway"
  ].some((fragment) => message.includes(fragment));
}

function stringifyError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
