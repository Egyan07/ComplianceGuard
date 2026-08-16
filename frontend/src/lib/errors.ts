/**
 * Shared error-message extraction for UI catch blocks.
 *
 * Replaces the `catch (err: any) { setError(err.message) }` pattern: the caught
 * value is `unknown`, and this is the single place that decides how to render
 * it. Preserves the previous behavior for `Error` instances (the common case
 * — axios rejects with Error) and adds sane handling for string throws and
 * non-Error values.
 */
export function getErrorMessage(
  err: unknown,
  fallback = 'An unexpected error occurred.',
): string {
  if (err instanceof Error) return err.message || fallback;
  if (typeof err === 'string') return err;
  return fallback;
}
