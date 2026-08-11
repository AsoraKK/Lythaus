import { BrowserRouter, Route, Routes } from 'react-router-dom';
import Nav from './components/Nav.jsx';
import Audit from './pages/Audit.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Appeals from './pages/Appeals.jsx';
import Flags from './pages/Flags.jsx';
import Users from './pages/Users.jsx';
import AppPreview from './pages/AppPreview.jsx';

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

function App() {
  return (
    <BrowserRouter>
      <div className="app-shell">
        <Nav />
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/flags" element={<Flags />} />
            <Route path="/appeals" element={<Appeals />} />
            <Route path="/users" element={<Users />} />
            <Route path="/moderation" element={<Flags />} />
            <Route path="/audit" element={<Audit />} />
            <Route path="/preview" element={<AppPreview />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
