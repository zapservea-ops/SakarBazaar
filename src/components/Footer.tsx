import { Link } from 'react-router-dom';
import { useSakarBazaar } from '../context/SakarBazaarContext';

export function Footer() {
  const { copy, ui } = useSakarBazaar();

  return (
    <footer>
      <div className="wrap">
        <div>
          <h4>{ui.footerSections}</h4>
          <Link to="/markets">{copy.markets}</Link>
          <Link to="/ipo">{copy.ipo}</Link>
          <Link to="/news">{copy.news}</Link>
          <Link to="/calendar">{copy.calendar}</Link>
          <Link to="/explainers">{copy.explain}</Link>
          <Link to="/editorial">{copy.editorial}</Link>
        </div>
        <div>
          <h4>{ui.footerCompany}</h4>
          <Link to="/about">{ui.aboutLink}</Link>
          <Link to="/disclaimer">{ui.disclaimerLink}</Link>
          <Link to="/privacy">{ui.privacyLink}</Link>
          <Link to="/contact">{ui.contactLink}</Link>
          <Link to="/rss">{ui.rssLink}</Link>
          <Link to="/sitemap">{ui.sitemapLink}</Link>
        </div>
        <div>
          <h4>{ui.footerDataNoteTitle}</h4>
          <p style={{ margin: 0 }}>{ui.footerDataNoteBody}</p>
        </div>
      </div>
    </footer>
  );
}
