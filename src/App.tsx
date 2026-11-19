import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { SakarBazaarProvider } from './context/SakarBazaarContext';
import { AdminPage } from './pages/AdminPage';
import { ArticleDetailPage } from './pages/ArticleDetailPage';
import { CalendarPage } from './pages/CalendarPage';
import { ChangeLedgerPage } from './pages/ChangeLedgerPage';
import { ExplainerDetailPage } from './pages/ExplainerDetailPage';
import { ExplainersPage } from './pages/ExplainersPage';
import { HomePage } from './pages/HomePage';
import { IntelligencePage } from './pages/IntelligencePage';
import { IpoDeskPage } from './pages/IpoDeskPage';
import { IpoDetailPage } from './pages/IpoDetailPage';
import { MarketsPage } from './pages/MarketsPage';
import { NewsListPage } from './pages/NewsListPage';
import { SearchPage } from './pages/SearchPage';
import { SupportingPage } from './pages/SupportingPage';
import { WatchlistPage } from './pages/WatchlistPage';

export default function App() {
  return (
    <BrowserRouter>
      <SakarBazaarProvider>
        <ErrorBoundary>
          <Layout>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/intelligence" element={<IntelligencePage />} />
              <Route path="/change-ledger" element={<ChangeLedgerPage />} />
              <Route path="/markets" element={<MarketsPage />} />
              <Route path="/ipo" element={<IpoDeskPage />} />
              <Route path="/ipo/:slug" element={<IpoDetailPage />} />
              <Route path="/news" element={<NewsListPage />} />
              <Route path="/news/:category" element={<NewsListPage />} />
              <Route path="/article/:slug" element={<ArticleDetailPage />} />
              <Route path="/calendar" element={<CalendarPage />} />
              <Route path="/watchlist" element={<WatchlistPage />} />
              <Route path="/explainers" element={<ExplainersPage />} />
              <Route path="/explainers/:slug" element={<ExplainerDetailPage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/editorial" element={<Navigate to="/admin" replace />} />
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/newsroom" element={<Navigate to="/admin" replace />} />
              <Route path="/about" element={<SupportingPage page="about" />} />
              <Route path="/disclaimer" element={<SupportingPage page="disclaimer" />} />
              <Route path="/privacy" element={<SupportingPage page="privacy" />} />
              <Route path="/contact" element={<SupportingPage page="contact" />} />
              <Route path="/rss" element={<SupportingPage page="rss" />} />
              <Route path="/sitemap" element={<SupportingPage page="sitemap" />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </ErrorBoundary>
      </SakarBazaarProvider>
    </BrowserRouter>
  );
}
