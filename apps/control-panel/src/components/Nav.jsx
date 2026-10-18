import { NavLink } from 'react-router-dom';
import { supportFeedbackEnabled } from '../support-feedback-config.js';

function Nav() {
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
  if (supportFeedbackEnabled()) links.splice(5, 0, { to: '/support', label: 'Support' });

  return (
    <header className="nav">
      <div className="brand">
        <img className="brand-logo brand-logo--dark" src="/brand/lythaus-v1/lythaus-wordmark-white.5ba0451347e2.svg" alt="Lythaus" width="115" height="32" />
        <img className="brand-logo brand-logo--light" src="/brand/lythaus-v1/lythaus-wordmark-black.e450176663e0.svg" alt="Lythaus" width="115" height="32" />
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
