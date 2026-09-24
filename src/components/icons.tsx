import type { PaneId } from '../types';

const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, viewBox: '0 0 24 24', 'aria-hidden': true } as const;

export const PaneIcon = ({ id }: { id: PaneId }) => {
  switch (id) {
    case 'size':
      return (
        <svg {...s}>
          <rect x="3" y="6" width="18" height="12" rx="1.5" />
          <path d="M7 6v3M11 6v4M15 6v3M19 6v4" />
        </svg>
      );
    case 'occasion':
      return (
        <svg {...s}>
          <path d="M12 3c1.6 3 3 4.2 3 6.4a3 3 0 0 1-6 0C9 7.2 10.4 6 12 3z" />
          <path d="M4 15h16l-2.2 4.5H6.2z" />
        </svg>
      );
    case 'photos':
      return (
        <svg {...s}>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <circle cx="9" cy="10" r="2" />
          <path d="M21 16l-5-5-8 8" />
        </svg>
      );
    case 'layout':
      return (
        <svg {...s}>
          <rect x="4" y="3" width="7" height="18" rx="1" />
          <rect x="13" y="3" width="7" height="8" rx="1" />
          <rect x="13" y="13" width="7" height="8" rx="1" />
        </svg>
      );
    case 'words':
      return (
        <svg {...s}>
          <path d="M5 6h14M12 6v13M9 19h6" />
        </svg>
      );
    case 'back':
      return (
        <svg {...s}>
          <rect x="3" y="5" width="18" height="14" rx="1.5" />
          <path d="M12 8v8M15 8.5h3v3h-3zM14.5 15h4M5.5 9h4M5.5 12h4" />
        </svg>
      );
    case 'print':
      return (
        <svg {...s}>
          <path d="M7 9V3h10v6" />
          <rect x="3" y="9" width="18" height="8" rx="2" />
          <path d="M7 14h10v7H7z" />
        </svg>
      );
    case 'gallery':
      return (
        <svg {...s}>
          <rect x="3" y="3" width="8" height="8" rx="1" />
          <rect x="13" y="3" width="8" height="8" rx="1" />
          <rect x="3" y="13" width="8" height="8" rx="1" />
          <rect x="13" y="13" width="8" height="8" rx="1" />
        </svg>
      );
  }
};
export const UndoIcon = () => (
  <svg {...s} strokeWidth={1.9}>
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </svg>
);
export const RedoIcon = () => (
  <svg {...s} strokeWidth={1.9}>
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </svg>
);
export const SaveIcon = () => (
  <svg {...s} strokeWidth={1.8}>
    <path d="M5 3h11l3 3v15H5z" />
    <path d="M8 3v6h8V3M8 21v-7h8v7" />
  </svg>
);
export const DownloadIcon = () => (
  <svg {...s} strokeWidth={2}>
    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
  </svg>
);
export const CubeIcon = () => (
  <svg {...s} strokeWidth={1.8}>
    <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" />
    <path d="M12 12l8-4.5M12 12L4 7.5M12 12v9" />
  </svg>
);

export const Logo = () => (
  <svg className="logo" viewBox="0 0 120 120" aria-hidden="true">
    <defs>
      <path id="ring" d="M60,60 m-40,0 a40,40 0 1,1 80,0 a40,40 0 1,1 -80,0" />
    </defs>
    <circle cx="60" cy="60" r="52" fill="none" stroke="currentColor" strokeWidth="3.5" />
    <circle cx="60" cy="60" r="31" fill="none" stroke="currentColor" strokeWidth="1.8" />
    <text fontFamily="Hind, sans-serif" fontSize="11.5" fontWeight="600" letterSpacing="2.2" fill="currentColor">
      <textPath href="#ring" startOffset="2%">
        CHITTHI ✦ POSTCARD STUDIO ✦
      </textPath>
    </text>
    <text x="60" y="68" textAnchor="middle" fontFamily="Rozha One, serif" fontSize="21" fill="currentColor">
      चिट्ठी
    </text>
  </svg>
);
