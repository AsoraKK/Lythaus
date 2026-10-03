import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Nav from './components/Nav.jsx';
import Audit from './pages/Audit.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Appeals from './pages/Appeals.jsx';
import Flags from './pages/Flags.jsx';
import Users from './pages/Users.jsx';
import AccountSupport from './pages/AccountSupport.jsx';
import Waitlist from './pages/Waitlist.jsx';
import Accounts from './pages/Accounts.jsx';
import ProductionAuthAcceptance from './pages/ProductionAuthAcceptance.jsx';
import SupportFeedback from './pages/SupportFeedback.jsx';
import AdminAccessGate from './components/AdminAccessGate.jsx';
import AuthenticityBeta from './pages/AuthenticityBeta.jsx';

const NotFound = () => (
  <section className="page">
    <div className="page-header">
      <h1>Page not found</h1>
      <p className="page-subtitle">
        The page you requested does not exist in this console.
      </p>
    </div>
  </section>
);

function AccountAlias({ to }) {
  const { search, hash } = useLocation();
  return <Navigate replace to={`${to}${search}${hash}`} />;
}

export function ControlPanelRoutes() {
  return <Routes>
    <Route path="/" element={<Dashboard />} />
    <Route path="/flags" element={<Flags />} />
    <Route path="/appeals" element={<Appeals />} />
    <Route path="/accounts" element={<Accounts />}>
      <Route index element={<AccountSupport inWorkspace />} />
      <Route path="management" element={<Users inWorkspace />} />
    </Route>
    <Route path="/users" element={<AccountAlias to="/accounts/management" />} />
    <Route path="/account-support" element={<AccountAlias to="/accounts" />} />
    <Route path="/waitlist" element={<Waitlist />} />
    <Route path="/support" element={<SupportFeedback />} />
    <Route path="/moderation" element={<Flags />} />
    <Route path="/authenticity" element={<AuthenticityBeta />} />
    <Route path="/audit" element={<Audit />} />
    <Route path="/production-auth-acceptance" element={<ProductionAuthAcceptance />} />
    <Route path="*" element={<NotFound />} />
  </Routes>;
}

function App() {
  return (
    <BrowserRouter>
      <AdminAccessGate>
        <div className="app-shell">
          <Nav />
          <main className="main">
            <ControlPanelRoutes />
          </main>
        </div>
      </AdminAccessGate>
    </BrowserRouter>
  );
}

export default App;
