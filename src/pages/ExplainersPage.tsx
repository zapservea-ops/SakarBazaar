import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { EditorialArt } from '../components/EditorialArt';
import { PageBackNav } from '../components/PageBackNav';
import { useSakarBazaar } from '../context/SakarBazaarContext';
import { EXPLAINERS_CATALOG } from '../data/sampleData';

export function ExplainersPage() {
  const { lang, ui } = useSakarBazaar();

  useEffect(() => {
    document.title = `${ui.explainersPageTitle} – SakarBazaar`;
  }, [ui.explainersPageTitle]);

  return (
    <main id="top" className="wrap sb-page">
      <PageBackNav
        parentPath="/"
        parentLabel={ui.backToMarkets}
        currentLabel={ui.explainersPageTitle}
      />

      <div className="sb-page-head">
        <div>
          <h1>{ui.explainersPageTitle}</h1>
          <p>{ui.explainersPageSubtitle}</p>
        </div>
        <span className="pill">{ui.financialEducation}</span>
      </div>

      <div className="sb-explainer-grid">
        {EXPLAINERS_CATALOG.map((exp) => {
          const title = lang === 'hi' ? exp.titleHi : exp.title;
          const summary = lang === 'hi' ? exp.summaryHi : exp.summary;
          const tag = lang === 'hi' ? exp.tagHi : exp.tag;

          return (
            <article className="card sb-explainer-card" key={exp.id}>
              <Link to={`/explainers/${exp.slug}`} aria-label={title}>
                <EditorialArt variant={exp.illustration} label={title} />
              </Link>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
                <span className="pill">{tag}</span>
                <span className="meta">{exp.readTime}</span>
              </div>
              <h3>
                <Link to={`/explainers/${exp.slug}`}>{title}</Link>
              </h3>
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: '15px', flex: 1 }}>
                {summary}
              </p>
              <div>
                <Link to={`/explainers/${exp.slug}`} className="btn ghost">
                  {ui.readGuide}
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
