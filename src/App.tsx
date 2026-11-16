import { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth-context';
import ProtectedRoute from '@/components/ProtectedRoute';
import HomeRoute from '@/components/HomeRoute';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import Admin from './pages/Admin';
import Login from './pages/Login';
import ResetPassword from './pages/ResetPassword';
import Settings from './pages/Settings';
import Discovery from './pages/Discovery';
import ProductIntel from './pages/ProductIntel';
import Sprint from './pages/Sprint';
import ReportPage from './pages/ReportPage';
import ShareReport from './pages/ShareReport';
import StartRouter from './pages/StartRouter';
import Portfolio from './pages/Portfolio';
import PortfolioWorkspace from './pages/PortfolioWorkspace';
import SharePortfolio from './pages/SharePortfolio';
import Privacy from './pages/Privacy';
import Bridge from './pages/Bridge';
import NotFound from './pages/NotFound';

const Roadmap = lazy(() => import('./pages/Roadmap'));

function App() {
  return (
    <Router>
      <AuthProvider>
        <TooltipProvider delayDuration={250}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/privacy" element={<Privacy />} />
            {/* Public by design: exchanges a one-time Builder Journal launch
                token for a session (Spec 4); ProtectedRoute would drop the
                query string it needs. */}
            <Route path="/bridge" element={<Bridge />} />
            {/* Public by design: share links open for logged-out visitors. */}
            <Route path="/share/:token" element={<ShareReport />} />
            <Route path="/portfolio/share/:token" element={<SharePortfolio />} />
            {/* Public by design: the roadmap is the same for everyone. */}
            <Route
              path="/roadmap"
              element={
                <Suspense fallback={<div className="h-[100dvh] bg-[#1c140b]" />}>
                  <Roadmap />
                </Suspense>
              }
            />
            {/* Landing page when signed out, the chat when signed in. */}
            <Route path="/" element={<HomeRoute />} />
            <Route
              path="/settings"
              element={
                <ProtectedRoute>
                  <Settings />
                </ProtectedRoute>
              }
            />
            <Route
              path="/discovery"
              element={
                <ProtectedRoute>
                  <Discovery />
                </ProtectedRoute>
              }
            />
            <Route
              path="/start"
              element={
                <ProtectedRoute>
                  <StartRouter />
                </ProtectedRoute>
              }
            />
            <Route
              path="/portfolio"
              element={
                <ProtectedRoute>
                  <Portfolio />
                </ProtectedRoute>
              }
            />
            <Route
              path="/portfolio/project/:projectId"
              element={
                <ProtectedRoute>
                  <PortfolioWorkspace />
                </ProtectedRoute>
              }
            />
            <Route
              path="/product/:productId/intel"
              element={
                <ProtectedRoute>
                  <ProductIntel />
                </ProtectedRoute>
              }
            />
            <Route
              path="/sprint/:sessionId"
              element={
                <ProtectedRoute>
                  <Sprint />
                </ProtectedRoute>
              }
            />
            <Route
              path="/report/:sessionId"
              element={
                <ProtectedRoute>
                  <ReportPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute requireRole="admin">
                  <Admin />
                </ProtectedRoute>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <Toaster position="top-center" closeButton />
        </TooltipProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
