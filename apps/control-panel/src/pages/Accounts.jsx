import { NavLink, Outlet } from 'react-router-dom';
import './accounts.css';

function Accounts() {
  return <section className="accounts-workspace" aria-labelledby="accounts-title">
    <div className="page-header">
      <h1 id="accounts-title">Accounts</h1>
      <p className="page-subtitle">Registered accounts, verification and recorded history. Waitlist remains separate.</p>
    </div>
    <nav className="accounts-navigation" aria-label="Accounts workspace">
      <NavLink to="/accounts" end className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Account support</NavLink>
      <NavLink to="/accounts/management" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>Account administration</NavLink>
    </nav>
    <Outlet />
  </section>;
}

export default Accounts;
