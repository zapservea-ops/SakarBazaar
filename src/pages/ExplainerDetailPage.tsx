import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EditorialArt } from '../components/EditorialArt';
import { PageBackNav } from '../components/PageBackNav';
import { useSakarBazaar } from '../context/SakarBazaarContext';
import { EXPLAINERS_CATALOG } from '../data/sampleData';

export function ExplainerDetailPage() {
  const { slug } = useParams();
  const { lang, ui } = useSakarBazaar();

  const explainer = EXPLAINERS_CATALOG.find((item) => item.slug === slug);

  useEffect(() => {
    if (explainer) {
      const title = lang === 'hi' ? explainer.titleHi : explainer.title;
      document.title = `${title} – SakarBazaar`;
    } else {
      document.title = `Explainer Not Found – SakarBazaar`;
    }
  }, [explainer, lang]);

  if (!explainer) {
    return (
      <main className="wrap sb-page">
        <PageBackNav
          parentPath="/explainers"
          parentLabel={ui.explainersPageTitle}
          currentLabel="Not found"
        />
        <div className="card" style={{ padding: '24px' }}>
          <h1 style={{ font: '700 26px var(--serif)', margin: '0 0 8px' }}>
            {ui.noResultsTitle}
          </h1>
          <Link to="/explainers" className="btn">
            {ui.explainersPageTitle}
          </Link>
        </div>
      </main>
    );
  }

  const title = lang === 'hi' ? explainer.titleHi : explainer.title;
  const summary = lang === 'hi' ? explainer.summaryHi : explainer.summary;
  const tag = lang === 'hi' ? explainer.tagHi : explainer.tag;
  const otherExplainers = EXPLAINERS_CATALOG.filter((e) => e.slug !== explainer.slug).slice(0, 4);

  return (
    <main id="top" className="wrap sb-page">
      <PageBackNav
        parentPath="/explainers"
        parentLabel={ui.explainersPageTitle}
        currentLabel={tag}
      />

      <div className="sb-article-layout">
        <article className="sb-article-main">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="pill">{tag}</span>
            <span className="meta">{explainer.readTime} · {ui.educationalBadge}</span>
          </div>

          <h1>{title}</h1>
          <p className="sb-article-lead">{summary}</p>

          {explainer.disclaimer && (
            <div
              className="sb-note-box"
              style={{
                borderLeft: '4px solid var(--down)',
                color: 'var(--ink)',
                marginBottom: '20px',
              }}
            >
              {explainer.disclaimer}
            </div>
          )}

          <figure style={{ margin: '0 0 20px' }}>
            <EditorialArt variant={explainer.illustration} label={title} />
          </figure>

          <aside className="sb-takeaways">
            <h3>{ui.keyTakeaways}</h3>
            <ul>
              {explainer.keyPoints.map((pt, idx) => (
                <li key={idx}>{pt}</li>
              ))}
            </ul>
          </aside>

          <div className="sb-article-body">
            {explainer.sections.map((sec, idx) => (
              <section key={idx}>
                <h2>{sec.heading}</h2>
                {sec.paragraphs.map((p, pIdx) => (
                  <p key={pIdx}>{p}</p>
                ))}
              </section>
            ))}
          </div>

          {explainer.glossaryTerms && explainer.glossaryTerms.length > 0 && (
            <section style={{ marginTop: '24px' }}>
              <h2 style={{ font: '700 22px var(--serif)', margin: '0 0 8px' }}>
                {ui.keyTerms}
              </h2>
              <div className="sb-glossary-grid">
                {explainer.glossaryTerms.map((item) => (
                  <div className="card sb-glossary-item" key={item.term}>
                    <strong style={{ color: 'var(--teal)' }}>{item.term}</strong>
                    <p style={{ margin: '6px 0 0', fontSize: '14px', color: 'var(--muted)' }}>
                      {item.meaning}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </article>

        <aside>
          <section className="card snap">
            <div className="sec-h">
              <h2>{ui.moreExplainers}</h2>
            </div>
            {otherExplainers.map((item) => (
              <div className="row" style={{ gridTemplateColumns: '1fr', gap: '4px' }} key={item.id}>
                <span className="cat">{lang === 'hi' ? item.tagHi : item.tag}</span>
                <Link to={`/explainers/${item.slug}`} style={{ fontWeight: 600 }}>
                  {lang === 'hi' ? item.titleHi : item.title}
                </Link>
                <small>{item.readTime}</small>
              </div>
            ))}
            <div style={{ marginTop: '12px' }}>
              <Link to="/explainers" className="btn ghost" style={{ width: '100%' }}>
                {ui.allExplainers}
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </main>
  );
}
