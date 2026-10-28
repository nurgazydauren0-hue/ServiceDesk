'use client';

import { Settings } from 'lucide-react';
import './navigation-motion.css';

export function AnimatedNavIcon({ kind, size = 19, success = false }) {
  const className = `animated-nav-icon ani-${kind}${kind === 'create' && success ? ' is-success' : ''}`;
  const props = {
    width: size,
    height: size,
    className,
    'aria-hidden': true,
    focusable: false,
  };
  if (kind === 'settings') return <Settings {...props} strokeWidth={1.8} />;

  const icons = {
    dashboard: (
      <>
        <rect className="ani-tile" x="3" y="3" width="7" height="7" rx="1.4" />
        <rect className="ani-tile" x="14" y="3" width="7" height="7" rx="1.4" />
        <rect className="ani-tile" x="3" y="14" width="7" height="7" rx="1.4" />
        <rect className="ani-tile" x="14" y="14" width="7" height="7" rx="1.4" />
      </>
    ),
    tickets: (
      <g className="ani-ticket">
        <path d="M4 5h16a1 1 0 0 1 1 1v3a3 3 0 0 0 0 6v3a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3a3 3 0 0 0 0-6V6a1 1 0 0 1 1-1Z" />
        <path d="M15 5v2m0 4v2m0 4v2" />
      </g>
    ),
    create: (
      <>
        <g className="ani-create-plus"><path d="M12 5v14M5 12h14" /></g>
        <g className="ani-create-check">
          <circle cx="12" cy="12" r="10" />
          <path d="m7 12 3.2 3.2L17 8.5" />
        </g>
      </>
    ),
    'my-tickets': (
      <>
        <path className="ani-filter-line" d="M3 6h18" />
        <path className="ani-filter-line" d="M6 12h12" />
        <path className="ani-filter-line" d="M9 18h6" />
      </>
    ),
    team: (
      <>
        <g className="ani-person ani-person-back">
          <path d="M16 3a3 3 0 0 1 0 6m1 5a4 4 0 0 1 4 4v2" />
        </g>
        <g className="ani-person ani-person-front">
          <circle cx="9" cy="7" r="3.5" />
          <path d="M2 21v-2a6 6 0 0 1 6-6h2a6 6 0 0 1 6 6v2" />
        </g>
      </>
    ),
    reports: (
      <>
        <path d="M3 3v18h18" />
        <path className="ani-report-bar" d="M7 17V12" />
        <path className="ani-report-bar" d="M12 17V7" />
        <path className="ani-report-bar" d="M17 17V4" />
      </>
    ),
    profile: (
      <>
        <circle className="ani-profile-head" cx="12" cy="7" r="4" />
        <path d="M4 21v-2a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v2" />
      </>
    ),
    signout: (
      <>
        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
        <g className="ani-exit-arrow"><path d="M9 12h12m-4-4 4 4-4 4" /></g>
      </>
    ),
    support: <path className="ani-support-arrow" d="M7 17 17 7M7 7h10v10" />,
    headset: (
      <g className="ani-headset">
        <path d="M3 14v-3a9 9 0 0 1 18 0v3m0 3v1a4 4 0 0 1-4 4h-3" />
        <rect x="2" y="10" width="5" height="8" rx="2" />
        <rect x="17" y="10" width="5" height="8" rx="2" />
      </g>
    ),
  };

  return (
    <svg {...props} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      {icons[kind]}
    </svg>
  );
}

export default AnimatedNavIcon;
