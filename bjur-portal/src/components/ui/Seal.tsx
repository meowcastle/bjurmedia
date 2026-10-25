/** The BJUR seal (design D, as bjur.nyc): vermilion and white, turned -3° by .bj-seal. */
const stroke = { fill: "none", strokeWidth: 0.2609, strokeLinejoin: "miter" } as const;

export function Seal({ className = "bj-seal", style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} viewBox="0 0 100 100" aria-hidden="true">
      <rect width="100" height="100" rx="2" fill="#E04A2E" />
      <rect x="3" y="3" width="47" height="47" fill="#fff" />
      <rect x="50" y="50" width="47" height="47" fill="#fff" />
      <path transform="translate(15 15) scale(23)" stroke="#E04A2E" strokeLinecap="square" {...stroke} d="M0 0V1 M0 0H.52A.25 .25 0 0 1 .52 .5H0 M.5 .5H.6A.25 .25 0 0 1 .6 1H0" />
      <path transform="translate(62 15) scale(23)" stroke="#fff" strokeLinecap="square" {...stroke} d="M.2 0H1 M.8 0V.6A.4 .4 0 0 1 0 .6" />
      <path transform="translate(15 62) scale(23)" stroke="#fff" strokeLinecap="square" {...stroke} d="M0 0V.55A.5 .45 0 0 0 1 .55V0" />
      <path transform="translate(62 62) scale(23)" stroke="#E04A2E" strokeLinecap="square" {...stroke} d="M0 1V0H.55A.25 .25 0 0 1 .55 .5H0" />
      <path transform="translate(62 62) scale(23)" stroke="#E04A2E" strokeLinecap="butt" {...stroke} d="M.3 .5L1 1" />
    </svg>
  );
}
