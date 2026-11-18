import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useSakarBazaar } from '../context/SakarBazaarContext';
import { CATEGORY_LABELS, VERIFICATION_STATUS_LABELS } from '../data/i18n';
import type { ArticleRecord } from '../types/sakarbazaar';
import { EditorialArt } from './EditorialArt';

interface HeroSectionProps {
  leadArticle: ArticleRecord;
  secondaryArticle?: ArticleRecord;
}

export function HeroSection({ leadArticle, secondaryArticle }: HeroSectionProps) {
  const { lang, ui } = useSakarBazaar();
  const [copied, setCopied] = useState(false);

  const heroHeadline =
    lang === 'hi' && leadArticle.headlineHi ? leadArticle.headlineHi : leadArticle.headline;
  const heroDeck = lang === 'hi' && leadArticle.deckHi ? leadArticle.deckHi : leadArticle.deck;

  const secondaryHeadline = secondaryArticle
    ? lang === 'hi' && secondaryArticle.headlineHi
      ? secondaryArticle.headlineHi
      : secondaryArticle.headline
    : '';

  async function handleShare() {
    const shareUrl = `${window.location.origin}/article/${leadArticle.slug}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: heroHeadline, url: shareUrl });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1600);
      }
    } catch {
      // User dismissed share sheet or clipboard unavailable
    }
  }

  return (
    <div className="top">
      <article className="card hero">
        <div className="art">
          <EditorialArt
            variant={leadArticle.illustration}
            label={leadArticle.illustrationCaption}
          />
        </div>
        <div className="body">
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="pill">{CATEGORY_LABELS[lang][leadArticle.category]}</span>
            <span
              className={`pill ${
                leadArticle.verificationStatus === 'awaiting_verification' ? 'sb-pill-amber' : ''
              }`}
            >
              {VERIFICATION_STATUS_LABELS[lang][leadArticle.verificationStatus]}
            </span>
            <span className="meta" id="heroTime">
              {leadArticle.publishedAt} · {leadArticle.readTime}
            </span>
          </div>
          <h1>
            <Link to={`/article/${leadArticle.slug}`}>{heroHeadline}</Link>
          </h1>
          <p>{heroDeck}</p>
          <div className="foot">
            <span>{leadArticle.author}</span>
            <span className="sb-hero-actions">
              <button type="button" className="btn ghost" id="share" onClick={handleShare}>
                {copied ? ui.linkCopied : ui.share}
              </button>
              <Link className="btn" to={`/article/${leadArticle.slug}`}>
                {lang === 'hi' ? 'पूरी खबर पढ़ें' : 'Read story & video'}
              </Link>
            </span>
          </div>
        </div>
      </article>

      <div className="quick" id="quick">
        {secondaryArticle && (
          <Link className="card q" to={`/article/${secondaryArticle.slug}`}>
            <div className="ico" style={{ background: '#fdf0c8' }} aria-hidden="true">
              <i style={{ height: '42%' }} />
              <i style={{ height: '74%' }} />
              <i style={{ height: '58%' }} />
              <i style={{ height: '86%' }} />
            </div>
            <span className="meta">
              {CATEGORY_LABELS[lang][secondaryArticle.category]} ·{' '}
              {VERIFICATION_STATUS_LABELS[lang][secondaryArticle.verificationStatus]}
            </span>
            <h3>{secondaryHeadline}</h3>
          </Link>
        )}

        <Link className="card q" to="/ipo/mahanadi-coalfields-limited">
          <div className="ico" style={{ background: 'var(--chip)' }} aria-hidden="true">
            <i style={{ height: '35%' }} />
            <i style={{ height: '65%' }} />
            <i style={{ height: '80%' }} />
            <i style={{ height: '92%' }} />
          </div>
          <span className="meta">IPO Dossier · Awaiting Verification</span>
          <h3>
            {lang === 'hi'
              ? 'महानदी कोलफील्ड्स (MCL): प्रस्तावित ₹8,981.12 Cr OFS विवरण'
              : 'Mahanadi Coalfields (MCL): Proposed ₹8,981.12 Cr OFS dossier'}
          </h3>
        </Link>

        <Link className="card q" to="/explainers/ipo-basics">
          <div className="ico" style={{ background: 'var(--teal-soft)' }} aria-hidden="true">
            <i style={{ height: '48%' }} />
            <i style={{ height: '62%' }} />
            <i style={{ height: '78%' }} />
            <i style={{ height: '54%' }} />
          </div>
          <span className="meta">{ui.educationalBadge}</span>
          <h3>
            {lang === 'hi'
              ? 'IPO बुनियादी बातें: फ्रेश इश्यू बनाम OFS'
              : 'IPO basics: Fresh issue vs Offer for Sale explained'}
          </h3>
        </Link>

        <Link className="card q" to="/explainers/gmp-explained">
          <div className="ico" style={{ background: 'var(--chip)' }} aria-hidden="true">
            <i style={{ height: '70%' }} />
            <i style={{ height: '45%' }} />
            <i style={{ height: '85%' }} />
            <i style={{ height: '40%' }} />
          </div>
          <span className="meta">{ui.educationalBadge}</span>
          <h3>
            {lang === 'hi'
              ? 'GMP क्या है और यह अनियंत्रित क्यों माना जाता है'
              : 'Why Grey Market Premium (GMP) is unregulated & excluded'}
          </h3>
        </Link>
      </div>
    </div>
  );
}
