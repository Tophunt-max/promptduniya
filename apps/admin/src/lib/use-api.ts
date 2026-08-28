import { useCallback, useEffect, useRef, useState } from 'react';

import { api, ApiError } from './api';

/**
 * Minimal data-fetching hook.
 *
 * Deliberately dependency-free: the admin console has a handful of screens with
 * simple load/reload semantics, so a query library would be more machinery than
 * the problem needs.
 */

export interface QueryState<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
  /** Re-runs the request, keeping the previous data visible while it loads. */
  reload(): void;
}

export function useQuery<T>(path: string | null, deps: unknown[] = []): QueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [nonce, setNonce] = useState(0);

  // Guards against a slow response from a previous path overwriting a newer one.
  const requestId = useRef(0);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    const id = ++requestId.current;
    setLoading(true);

    api
      .get<T>(path)
      .then((result) => {
        if (requestId.current !== id) return;
        setData(result);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (requestId.current !== id) return;
        setError(cause instanceof ApiError ? cause.message : 'Could not load this data.');
      })
      .finally(() => {
        if (requestId.current === id) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, nonce, ...deps]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, error, loading, reload };
}

/**
 * Wraps a mutation with pending/error state and surfaces field-level validation
 * errors from the API.
 */
export function useMutation() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const run = useCallback(async <T>(action: () => Promise<T>): Promise<T | null> => {
    setPending(true);
    setError(null);
    setFieldErrors({});
    try {
      return await action();
    } catch (cause) {
      if (cause instanceof ApiError) {
        setError(cause.message);
        setFieldErrors(cause.fieldErrors);
      } else {
        setError('Something went wrong.');
      }
      return null;
    } finally {
      setPending(false);
    }
  }, []);

  return { run, pending, error, fieldErrors, setError };
}
