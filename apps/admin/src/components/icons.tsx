/**
 * Icon set for the console.
 *
 * Hand-rolled inline SVG rather than an icon package, matching what the public
 * site does in `apps/web/src/components/ui/icon.tsx`. The console previously had
 * no icons at all, which left the sidebar as a plain list of words — fine to
 * read, slow to scan, and the main reason it looked unfinished.
 *
 * All icons share a 24-box, 1.75 stroke weight and round caps so they sit
 * together evenly at the 18px the sidebar uses.
 */

export interface IconProps {
  size?: number;
  className?: string;
}

function Svg({ size = 18, className, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

/* ------------------------------- Navigation ------------------------------- */

export const DashboardIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
    <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
  </Svg>
);

export const PromptsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l1.9 4.6 4.6 1.9-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z" />
    <path d="M18 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" />
  </Svg>
);

export const CategoriesIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 7.5A1.5 1.5 0 014.5 6h4l2 2.5h7A1.5 1.5 0 0119 10v7a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 013 17z" />
  </Svg>
);

export const ArticlesIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 4h9l5 5v11a1 1 0 01-1 1H5a1 1 0 01-1-1V5a1 1 0 011-1z" />
    <path d="M14 4v5h5M8 13h8M8 17h5" />
  </Svg>
);

export const MediaIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="4.5" width="18" height="15" rx="2" />
    <circle cx="8.5" cy="10" r="1.6" />
    <path d="M4 17l5-4.5 4 3.5 3-2.5 4 3.5" />
  </Svg>
);

export const ModerationIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l7.5 3v5.5c0 4.6-3.1 7.8-7.5 9.5-4.4-1.7-7.5-4.9-7.5-9.5V6z" />
    <path d="M12 9v3.5M12 16h.01" />
  </Svg>
);

export const PlansIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 8l3.5 2.5L12 4l4.5 6.5L20 8v10a1 1 0 01-1 1H5a1 1 0 01-1-1z" />
  </Svg>
);

export const CouponsIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 9.5V7a1 1 0 011-1h16a1 1 0 011 1v2.5a2.5 2.5 0 000 5V17a1 1 0 01-1 1H4a1 1 0 01-1-1v-2.5a2.5 2.5 0 000-5z" />
    <path d="M13 8.5l-2 7" />
  </Svg>
);

export const BillingIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2.5" y="5.5" width="19" height="13" rx="2" />
    <path d="M2.5 10h19M6 14.5h4" />
  </Svg>
);

export const UsersIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="9" cy="8" r="3.2" />
    <path d="M3.5 19.5c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
    <path d="M16 5.5a3 3 0 010 5.8M17.5 14.8c2 .6 3.5 2.3 3.5 4.7" />
  </Svg>
);

export const SettingsIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.5v2.2M12 19.3v2.2M4.2 7l1.9 1.1M17.9 15.9l1.9 1.1M4.2 17l1.9-1.1M17.9 8.1l1.9-1.1" />
  </Svg>
);

/* --------------------------------- Chrome --------------------------------- */

export const MenuIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
);

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Svg>
);

export const SunIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
  </Svg>
);

export const MoonIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z" />
  </Svg>
);

export const LogOutIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M15 4h3a1 1 0 011 1v14a1 1 0 01-1 1h-3" />
    <path d="M10 8l-4 4 4 4M6 12h9" />
  </Svg>
);

export const ExternalIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4h6v6M20 4l-8.5 8.5" />
    <path d="M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5" />
  </Svg>
);

/* --------------------------------- Metrics -------------------------------- */

export const TrendUpIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 16l5-5 3.5 3.5L20 7" />
    <path d="M15 7h5v5" />
  </Svg>
);

export const EyeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);

export const CopyIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15H4.5a1 1 0 01-1-1V4.5a1 1 0 011-1H14a1 1 0 011 1V5" />
  </Svg>
);

export const RupeeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4h10M7 9h10M15.5 4c0 4-3.5 5-8.5 5 4 0 7 3 9 11" />
  </Svg>
);

export const CrownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8l3.5 3L12 4.5 17.5 11 21 8l-1.5 10h-15z" />
  </Svg>
);

/** Used for the AI Studio, where generation is the whole point. */
export const SparkleIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M11 3l2.1 5L18 10l-4.9 2L11 17l-2.1-5L4 10l4.9-2z" />
    <path d="M18.5 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" />
  </Svg>
);

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5" />
  </Svg>
);


/**
 * Content automation. A chip, because the distinction the console has to make
 * everywhere is between work a person did and work the machine did, and the
 * sparkle already means "generate this one thing for me".
 */
export const AutomationIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="7" y="7" width="10" height="10" rx="2.5" />
    <path d="M10.5 3.5v3M13.5 3.5v3M10.5 17.5v3M13.5 17.5v3M3.5 10.5h3M3.5 13.5h3M17.5 10.5h3M17.5 13.5h3" />
  </Svg>
);

/** Re-run or refresh. */
export const RefreshIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 11a8 8 0 1 0-2.5 5.8" />
    <path d="M20 5.5V11h-5.5" />
  </Svg>
);

/** Start a run now. */
export const PlayIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 5.5l10 6.5-10 6.5z" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4.5 12.5l5 5 10-11" />
  </Svg>
);

export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);

/** Trend discovery — a radar sweep rather than a rising line (that is TrendUp). */
export const RadarIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4" />
    <path d="M12 12l6-4.5" />
  </Svg>
);
