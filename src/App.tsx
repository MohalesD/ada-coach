import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/lib/auth-context';
import ProtectedRoute from '@/components/ProtectedRoute';
import { Toaster } from '@/components/ui/sonner';
import Index from './pages/Index';
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
import NotFound from './pages/NotFound';

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          {/* Public by design: share links open for logged-out visitors. */}
          <Route path="/share/:token" element={<ShareReport />} />
          <Route path="/portfolio/share/:token" element={<SharePortfolio />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Index />
              </ProtectedRoute>
            }
          />
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
      </AuthProvider>
    </Router>
  );
}

export default App;
