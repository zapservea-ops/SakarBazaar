import type { IllustrationVariant } from '../types/sakarbazaar';

interface EditorialArtProps {
  variant: IllustrationVariant;
  label: string;
  compact?: boolean;
}

export function EditorialArt({ variant, label, compact = false }: EditorialArtProps) {
  const className = compact ? 'sb-thumb-art' : 'sb-hero-art';

  return (
    <div className={className}>
      <svg viewBox="0 0 640 360" role="img" aria-label={label}>
        {variant === 'rbi-dial' && (
          <>
            <rect width="640" height="360" fill="var(--teal-soft)" />
            <g stroke="var(--teal)" strokeWidth="3" fill="none">
              <circle cx="320" cy="180" r="118" />
              <path d="M320 32v26M320 302v26M172 180h26M442 180h26M215 75l14 20M411 265l14 20M425 75l-14 20M229 265l-14 20" />
            </g>
            <circle cx="320" cy="180" r="84" fill="var(--teal)" />
            <circle cx="320" cy="180" r="20" fill="var(--bg)" />
            <rect x="70" y="60" width="130" height="14" fill="#0b4f4f" />
            <rect x="70" y="86" width="80" height="12" fill="#8a929b" />
            <rect x="470" y="262" width="96" height="14" fill="#0b4f4f" />
            <rect x="450" y="284" width="116" height="14" fill="#d99a00" />
          </>
        )}

        {variant === 'markets-pulse' && (
          <>
            <rect width="640" height="360" fill="var(--teal-soft)" />
            <path d="M60 280H580" stroke="var(--line)" strokeWidth="3" />
            <path d="M60 210H580" stroke="var(--line)" strokeWidth="2" strokeDasharray="8 8" />
            <path d="M60 140H580" stroke="var(--line)" strokeWidth="2" strokeDasharray="8 8" />
            <polyline
              points="70,255 150,230 220,242 300,175 385,190 475,112 565,92"
              fill="none"
              stroke="var(--teal)"
              strokeWidth="10"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="475" cy="112" r="14" fill="var(--amber)" />
            <circle cx="565" cy="92" r="12" fill="var(--up)" />
            <rect x="70" y="54" width="140" height="14" fill="var(--teal)" />
            <rect x="70" y="78" width="92" height="10" fill="var(--muted)" />
          </>
        )}

        {variant === 'ipo-book' && (
          <>
            <rect width="640" height="360" fill="var(--chip)" />
            <rect x="120" y="210" width="76" height="90" rx="6" fill="var(--teal)" opacity="0.65" />
            <rect x="224" y="160" width="76" height="140" rx="6" fill="var(--teal)" opacity="0.82" />
            <rect x="328" y="110" width="76" height="190" rx="6" fill="var(--teal)" />
            <rect x="432" y="70" width="76" height="230" rx="6" fill="var(--amber)" />
            <line x1="90" y1="300" x2="550" y2="300" stroke="var(--ink)" strokeWidth="3" />
            <rect x="120" y="52" width="150" height="14" fill="var(--ink)" />
            <rect x="120" y="76" width="96" height="10" fill="var(--muted)" />
          </>
        )}

        {variant === 'economy-cpi' && (
          <>
            <rect width="640" height="360" fill="var(--chip)" />
            <circle cx="240" cy="185" r="95" fill="var(--teal-soft)" stroke="var(--teal)" strokeWidth="6" />
            <path d="M240 185 L240 90 A95 95 0 0 1 335 185 Z" fill="var(--amber)" />
            <rect x="378" y="112" width="180" height="22" rx="4" fill="var(--teal)" />
            <rect x="378" y="154" width="140" height="22" rx="4" fill="var(--up)" />
            <rect x="378" y="196" width="110" height="22" rx="4" fill="var(--amber)" />
            <rect x="378" y="238" width="160" height="12" rx="3" fill="var(--muted)" opacity="0.5" />
          </>
        )}

        {variant === 'corporate-corridor' && (
          <>
            <rect width="640" height="360" fill="var(--teal-soft)" />
            <rect x="92" y="96" width="136" height="196" rx="6" fill="var(--surface)" stroke="var(--teal)" strokeWidth="3" />
            <rect x="252" y="64" width="136" height="228" rx="6" fill="var(--teal)" />
            <rect x="412" y="128" width="136" height="164" rx="6" fill="var(--surface)" stroke="var(--ink)" strokeWidth="3" />
            <rect x="280" y="94" width="80" height="14" fill="var(--amber)" />
            <rect x="280" y="124" width="80" height="14" fill="var(--bg)" opacity="0.7" />
            <rect x="280" y="154" width="80" height="14" fill="var(--bg)" opacity="0.7" />
          </>
        )}

        {variant === 'banking-ledger' && (
          <>
            <rect width="640" height="360" fill="var(--teal-soft)" />
            <rect x="110" y="74" width="420" height="212" rx="12" fill="var(--surface)" stroke="var(--teal)" strokeWidth="3" />
            <rect x="144" y="108" width="150" height="18" rx="3" fill="var(--teal)" />
            <rect x="144" y="146" width="352" height="12" rx="3" fill="var(--line)" />
            <rect x="144" y="176" width="290" height="12" rx="3" fill="var(--line)" />
            <rect x="144" y="212" width="110" height="38" rx="6" fill="var(--up)" />
            <rect x="274" y="212" width="110" height="38" rx="6" fill="var(--amber)" />
          </>
        )}

        {variant === 'tech-grid' && (
          <>
            <rect width="640" height="360" fill="var(--strip)" />
            <g stroke="#2a343e" strokeWidth="2">
              <line x1="160" y1="40" x2="160" y2="320" />
              <line x1="320" y1="40" x2="320" y2="320" />
              <line x1="480" y1="40" x2="480" y2="320" />
              <line x1="80" y1="120" x2="560" y2="120" />
              <line x1="80" y1="240" x2="560" y2="240" />
            </g>
            <circle cx="160" cy="120" r="18" fill="#4fb3ad" />
            <circle cx="320" cy="240" r="22" fill="#f0b429" />
            <circle cx="480" cy="120" r="18" fill="#3ccf91" />
            <path d="M160 120 L320 240 L480 120" fill="none" stroke="#4fb3ad" strokeWidth="4" />
          </>
        )}

        {variant === 'personal-finance' && (
          <>
            <rect width="640" height="360" fill="var(--chip)" />
            <rect x="130" y="84" width="380" height="192" rx="14" fill="var(--surface)" stroke="var(--line)" strokeWidth="3" />
            <circle cx="206" cy="180" r="46" fill="var(--teal)" />
            <path d="M188 180 l14 14 l26 -28" fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            <rect x="282" y="140" width="184" height="18" rx="4" fill="var(--ink)" />
            <rect x="282" y="172" width="144" height="14" rx="4" fill="var(--muted)" opacity="0.6" />
            <rect x="282" y="202" width="110" height="14" rx="4" fill="var(--amber)" />
          </>
        )}
      </svg>
    </div>
  );
}
