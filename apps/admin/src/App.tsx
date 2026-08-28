import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AdminLayout } from './components/layout';
import { Spinner } from './components/ui';
import { AuthProvider, useAuth } from './lib/auth';
import { ArticlesPage } from './pages/articles';
import { BillingPage } from './pages/billing';
import { CategoriesPage } from './pages/categories';
import { CouponsPage } from './pages/coupons';
import { DashboardPage } from './pages/dashboard';
import { LoginPage } from './pages/login';
import { MediaPage } from './pages/media';
import { ModerationPage } from './pages/moderation';
import { PlansPage } from './pages/plans';
import { PromptEditPage } from './pages/prompt-edit';
import { PromptsPage } from './pages/prompts';
import { SettingsPage } from './pages/settings';
import { UsersPage } from './pages/users';

/**
 * Route table.
 *
 * The guards below only shape navigation — every endpoint the SPA calls is
 * independently authorised by the API, so a user who forces a URL still gets a
 * 403 from the server.
 */

function RequireEditor({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Restoring your session" />;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <Spinner label="Restoring your session" />;
  if (!user) return <Navigate to="/login" replace />;
  if (!user.isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />

          <Route
            element={
              <RequireEditor>
                <AdminLayout />
              </RequireEditor>
            }
          >
            <Route index element={<DashboardPage />} />
            <Route path="prompts" element={<PromptsPage />} />
            <Route path="prompts/new" element={<PromptEditPage />} />
            <Route path="prompts/:id" element={<PromptEditPage />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="articles" element={<ArticlesPage />} />
            <Route path="media" element={<MediaPage />} />
            <Route path="moderation" element={<ModerationPage />} />

            <Route
              path="plans"
              element={
                <RequireAdmin>
                  <PlansPage />
                </RequireAdmin>
              }
            />
            <Route
              path="coupons"
              element={
                <RequireAdmin>
                  <CouponsPage />
                </RequireAdmin>
              }
            />
            <Route
              path="billing"
              element={
                <RequireAdmin>
                  <BillingPage />
                </RequireAdmin>
              }
            />
            <Route
              path="users"
              element={
                <RequireAdmin>
                  <UsersPage />
                </RequireAdmin>
              }
            />
            <Route
              path="settings"
              element={
                <RequireAdmin>
                  <SettingsPage />
                </RequireAdmin>
              }
            />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
