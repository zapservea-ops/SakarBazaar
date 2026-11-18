import { ArrowLeft } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useSakarBazaar } from '../context/SakarBazaarContext';

interface PageBackNavProps {
  parentPath: string;
  parentLabel: string;
  currentLabel: string;
  grandparentPath?: string;
  grandparentLabel?: string;
}

export function PageBackNav({
  parentPath,
  parentLabel,
  currentLabel,
  grandparentPath,
  grandparentLabel,
}: PageBackNavProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { ui } = useSakarBazaar();

  function handleBack() {
    if (window.history.length > 1 && location.key !== 'default') {
      navigate(-1);
    } else {
      navigate(parentPath);
    }
  }

  return (
    <div className="sb-page-nav">
      <button type="button" className="btn ghost sb-back-btn" onClick={handleBack}>
        <ArrowLeft size={16} aria-hidden="true" />
        <span>{ui.backButton}</span>
      </button>

      <nav className="sb-breadcrumb" aria-label="Breadcrumb">
        <Link to="/">{ui.backToMarkets}</Link>
        {grandparentPath && grandparentLabel && (
          <>
            <span aria-hidden="true">/</span>
            <Link to={grandparentPath}>{grandparentLabel}</Link>
          </>
        )}
        <span aria-hidden="true">/</span>
        {parentPath !== '/' ? (
          <>
            <Link to={parentPath}>{parentLabel}</Link>
            <span aria-hidden="true">/</span>
          </>
        ) : null}
        <span className="sb-crumb-current">{currentLabel}</span>
      </nav>
    </div>
  );
}
