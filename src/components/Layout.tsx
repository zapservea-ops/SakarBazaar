import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { useSakarBazaar } from '../context/SakarBazaarContext';
import { Footer } from './Footer';
import { Header } from './Header';
import { TopStrip } from './TopStrip';

export function Layout({ children }: { children: ReactNode }) {
  const { theme, lang, ist, toggleLang, toggleTheme } = useSakarBazaar();
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) {
      const target = document.getElementById(hash.slice(1));
      if (target) {
        target.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname, hash]);

  return (
    <>
      <TopStrip
        isOpen={ist.isOpen}
        statusText={ist.statusText}
        clockText={ist.clockText}
        lang={lang}
        theme={theme}
        onToggleLang={toggleLang}
        onToggleTheme={toggleTheme}
      />
      <Header />
      {children}
      <Footer />
    </>
  );
}
