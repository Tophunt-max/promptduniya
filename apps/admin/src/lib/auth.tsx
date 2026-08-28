import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  api,
  ApiError,
  refreshAccessToken,
  setAccessToken,
  setSignedOutHandler,
} from './api';

/**
 * Session state for the admin SPA.
 *
 * On mount we attempt a silent refresh: the httpOnly cookie the API set at login
 * is replayed by the browser, so a reload restores the session without the SPA
 * ever storing a credential. Role checks here are for navigation only — the API
 * re-authorises every single request.
 */

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  username: string;
  roles: string[];
  isAdmin: boolean;
  isEditor: boolean;
  emailVerified: boolean;
}

interface AuthState {
  user: AdminUser | null;
  /** True until the initial silent-refresh attempt settles. */
  loading: boolean;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

interface MeResponse {
  user: AdminUser;
}

interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  user: AdminUser;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  const clear = useCallback(() => {
    setAccessToken(null);
    setUser(null);
  }, []);

  // Restore a session on first load, then keep the token fresh.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const refreshed = await refreshAccessToken();
      if (cancelled) return;
      if (!refreshed) {
        setLoading(false);
        return;
      }
      try {
        const me = await api.get<MeResponse>('/v1/auth/me');
        if (!cancelled) setUser(me.user);
      } catch {
        if (!cancelled) clear();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clear]);

  // Access tokens are short-lived; refresh on a timer so a long editing session
  // never dies mid-save.
  useEffect(() => {
    if (!user) return;
    const timer = setInterval(
      () => {
        void refreshAccessToken();
      },
      10 * 60 * 1000,
    );
    return () => clearInterval(timer);
  }, [user]);

  useEffect(() => {
    setSignedOutHandler(clear);
    return () => setSignedOutHandler(null);
  }, [clear]);

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await api.post<LoginResponse>('/v1/auth/login', { email, password });
    if (!result.user.isEditor && !result.user.isAdmin) {
      setAccessToken(null);
      throw new ApiError(
        { code: 'forbidden', message: 'This account does not have admin access.' },
        403,
      );
    }
    setAccessToken(result.accessToken);
    setUser(result.user);
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.post('/v1/auth/logout');
    } catch {
      // Clearing local state matters more than a clean server round trip.
    }
    clear();
  }, [clear]);

  const value = useMemo<AuthState>(
    () => ({ user, loading, signIn, signOut }),
    [user, loading, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
