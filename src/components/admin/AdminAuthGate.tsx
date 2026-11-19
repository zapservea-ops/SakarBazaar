import { Link } from 'react-router-dom';
import type { User } from 'firebase/auth';
import type { AdminRole } from '../../types/sakarbazaar';

interface AdminAuthGateProps {
  authReady: boolean;
  user: User | null;
  isAuthorizedEditor: boolean;
  adminRole: AdminRole;
  authError: string | null;
  onSignIn: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onRefreshToken: () => Promise<void>;
}

export function AdminAuthGate({
  authReady,
  user,
  isAuthorizedEditor,
  adminRole,
  authError,
  onSignIn,
  onSignOut,
  onRefreshToken,
}: AdminAuthGateProps) {
  if (!authReady) {
    return (
      <main id="top" className="wrap sb-page">
        <div className="card snap" style={{ maxWidth: '58ch', margin: '24px auto' }}>
          <h1 style={{ font: '700 22px var(--serif)', margin: '0 0 8px' }}>
            Checking Private Newsroom Session…
          </h1>
          <p className="meta" style={{ margin: 0 }}>
            Verifying Google authentication state with Firebase.
          </p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main id="top" className="wrap sb-page">
        <section className="card snap sb-admin-auth-card">
          <span className="pill sb-pill-teal">Private Newsroom · Restricted Access</span>
          <h1 style={{ font: '700 28px var(--serif)', margin: '12px 0 8px' }}>
            SakarBazaar Newsroom &amp; Intelligence Admin
          </h1>
          <p style={{ color: 'var(--muted)', margin: '0 0 18px', lineHeight: 1.6 }}>
            Sign in using an authorized <strong>Owner</strong> or <strong>Publisher</strong> Google
            account to manage bilingual news, compressed photographs, YouTube video reports,
            featured placement, paid disclosures, and the verified IPO Intelligence desk.
          </p>

          {authError && (
            <div className="sb-admin-alert err" role="alert" style={{ marginBottom: '14px' }}>
              {authError}
            </div>
          )}

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              type="button"
              className="btn sb-admin-touch-btn"
              onClick={() => void onSignIn()}
            >
              Sign in with Google
            </button>
            <Link to="/" className="btn ghost sb-admin-touch-btn">
              Return to Public Website
            </Link>
          </div>

          <div className="sb-note-box" style={{ marginTop: '18px' }}>
            <strong>Authorized access only:</strong> Only Google accounts registered by the Owner
            (or the bootstrapped Owner account) can enter this workspace. Public readers never see
            or link to this route.
          </div>
        </section>
      </main>
    );
  }

  if (!isAuthorizedEditor || adminRole === 'none') {
    return (
      <main id="top" className="wrap sb-page">
        <section className="card snap sb-admin-auth-card">
          <span className="pill sb-pill-amber">Access Denied · Unauthorized Account</span>
          <h1 style={{ font: '700 26px var(--serif)', margin: '12px 0 8px' }}>
            Account Not Authorized
          </h1>
          <p style={{ color: 'var(--muted)', margin: '0 0 14px', lineHeight: 1.6 }}>
            You are signed in as <strong>{user.email || 'Unknown email'}</strong> (verified:{' '}
            {user.emailVerified ? 'Yes' : 'No'}), which does not have Owner or Publisher access in
            SakarBazaar.
          </p>
          <p style={{ color: 'var(--muted)', margin: '0 0 18px', fontSize: '14px' }}>
            If you are the Publisher (family operator), ask the Owner to add your exact Google email
            address in <strong>Admin Settings → Authorized Operators</strong>, then refresh your
            session or sign in again.
          </p>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn ghost sb-admin-touch-btn"
              onClick={() => void onRefreshToken()}
            >
              Re-check Access
            </button>
            <button
              type="button"
              className="btn sb-admin-touch-btn"
              onClick={() => void onSignOut()}
            >
              Switch Google Account
            </button>
            <Link to="/" className="btn ghost sb-admin-touch-btn">
              Go to Homepage
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return null;
}
