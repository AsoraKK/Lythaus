import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: 'Overview', end: true },
  { to: '/flags', label: 'Flags' },
  { to: '/appeals', label: 'Appeals' },
  { to: '/authenticity', label: 'Authenticity beta' },
  { to: '/accounts', label: 'Accounts' },
  { to: '/waitlist', label: 'Waitlist' },
  { to: '/audit', label: 'Audit' },
  { to: '/production-auth-acceptance', label: 'Auth acceptance' }
];

function Nav() {
  return (
    <header className="nav">
      <div className="brand">
        <span className="brand-mark">Lythaus</span>
        <span className="brand-sub">Control Panel</span>
      </div>
      <nav className="nav-links">
        {links.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.end}
            className={({ isActive }) =>
              isActive ? 'nav-link active' : 'nav-link'
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
      <div className="nav-meta">Beta Ops</div>
    </header>
  );
}

export default Nav;
