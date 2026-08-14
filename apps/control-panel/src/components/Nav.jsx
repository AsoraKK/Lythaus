import { NavLink } from 'react-router-dom';

const links = [
  { to: '/', label: 'Home', end: true },
  { to: '/flags', label: 'Flags' },
  { to: '/appeals', label: 'Appeals' },
  { to: '/users', label: 'Users' },
  { to: '/waitlist', label: 'Waitlist' },
  { to: '/audit', label: 'Audit' },
  { to: '/preview', label: 'Preview' }
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
