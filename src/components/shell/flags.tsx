import type { Locale } from "@/lib/i18n/config";

// Inline SVG: flag emoji do not render on Windows, and the secretariat's PCs may well be Windows.
// Albania is simplified (the double-headed eagle as shapes) to stay legible at 24 px.
export function Flag({ locale, className }: { locale: Locale; className?: string }) {
  return (
    <svg viewBox="0 0 28 20" className={className} aria-hidden focusable="false">
      <clipPath id={`flag-${locale}`}>
        <rect width="28" height="20" rx="3" />
      </clipPath>
      <g clipPath={`url(#flag-${locale})`}>
        {locale === "sq" ? (
          <>
            <rect width="28" height="20" fill="#e41e20" />
            <g fill="#000">
              <ellipse cx="14" cy="11.5" rx="2.2" ry="4" />
              <circle cx="11.2" cy="6.2" r="1.5" />
              <circle cx="16.8" cy="6.2" r="1.5" />
              <path d="M12 9 5.5 5.5 7 10.5 5 12.5 9 12.5 10.5 14.5Z" />
              <path d="M16 9 22.5 5.5 21 10.5 23 12.5 19 12.5 17.5 14.5Z" />
              <path d="M12.4 14.5h3.2l.8 3H11.6Z" />
            </g>
          </>
        ) : (
          <>
            <rect width="28" height="20" fill="#1c3f94" />
            <path d="M0 0 28 20M28 0 0 20" stroke="#fff" strokeWidth="4" />
            <path d="M0 0 28 20M28 0 0 20" stroke="#d3213c" strokeWidth="1.5" />
            <path d="M14 0v20M0 10h28" stroke="#fff" strokeWidth="6.5" />
            <path d="M14 0v20M0 10h28" stroke="#d3213c" strokeWidth="3.6" />
          </>
        )}
      </g>
      <rect width="28" height="20" rx="3" fill="none" stroke="#1a1d2e" strokeOpacity=".18" />
    </svg>
  );
}
