import { Link } from 'react-router-dom';
import { useSakarBazaar } from '../context/SakarBazaarContext';
import { IPO_STATUS_LABELS } from '../data/i18n';
import type { IpoRow } from '../types/sakarbazaar';
import { getVerifiedIpoCounts } from '../utils/marketFormat';

interface IpoDeskSidebarProps {
  records: IpoRow[];
}

export function IpoDeskSidebar({ records }: IpoDeskSidebarProps) {
  const { lang, ui } = useSakarBazaar();
  const counts = getVerifiedIpoCounts(records);

  return (
    <section className="desk" aria-label="IPO desk verification status">
      <span
        className="tag c"
        style={{ background: 'none', color: '#f0b429', padding: 0 }}
      >
        IPO desk · verification status
      </span>
      <h3>
        {counts.confirmedOpen} confirmed open · {counts.confirmedUpcoming} upcoming
      </h3>
      <p style={{ margin: '0 0 12px', fontSize: '13px', color: '#b8c2cc' }}>
        {counts.awaitingVerification} dossier awaiting official SEBI / exchange verification:
      </p>

      {records.map((item) => (
        <Link className="l" key={item.id} to={`/ipo/${item.slug}`}>
          <span>
            {item.company}
            <small>
              {item.priceBand ?? 'Price band TBD'} · {item.issueSize ?? 'Size TBD'}
            </small>
          </span>
          <span className="tag c">
            {item.verificationStatus === 'awaiting_verification'
              ? 'AWAITING'
              : IPO_STATUS_LABELS[lang][item.status]}
          </span>
        </Link>
      ))}

      <Link
        className="btn ghost"
        to="/ipo"
        style={{ display: 'block', textAlign: 'center', marginTop: '10px' }}
      >
        {ui.openTracker}
      </Link>
    </section>
  );
}
