import type { LanguageCode, ThemeMode } from '../types/sakarbazaar';

interface TopStripProps {
  isOpen: boolean;
  statusText: string;
  clockText: string;
  lang: LanguageCode;
  theme: ThemeMode;
  onToggleLang: () => void;
  onToggleTheme: () => void;
}

export function TopStrip({
  isOpen,
  statusText,
  clockText,
  lang,
  theme,
  onToggleLang,
  onToggleTheme,
}: TopStripProps) {
  return (
    <div className="strip">
      <div className="wrap">
        <span className={`live${isOpen ? '' : ' closed'}`} id="status">
          <i aria-hidden="true" />
          <span id="statusTxt">{statusText}</span>
        </span>
        <span className="num sb-strip-clock" id="clock">
          {clockText}
        </span>
        <div className="tools">
          <button
            id="lang"
            type="button"
            aria-pressed={lang === 'hi'}
            title="Switch language"
            onClick={onToggleLang}
          >
            EN / हिंदी
          </button>
          <button
            id="theme"
            type="button"
            aria-pressed={theme === 'dark'}
            onClick={onToggleTheme}
          >
            {theme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
      </div>
    </div>
  );
}
