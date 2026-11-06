/** Logo institucional de Rubrifact usado en la barra superior. */
export const RubrifactLogo = () => (
  <svg
    className="rubri-logo"
    viewBox="0 0 48 48"
    role="img"
    aria-label="Rubrifact"
  >
    <defs>
      <linearGradient id="rubri-cube" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#0A8F4E" />
        <stop offset="100%" stopColor="#024D28" />
      </linearGradient>
    </defs>
    <path
      d="M24 3 43 13.5v21L24 45 5 34.5v-21z"
      fill="url(#rubri-cube)"
      stroke="#C5A059"
      strokeWidth="1.6"
    />
    <path
      d="M24 3v42M5 13.5 24 24l19-10.5"
      fill="none"
      stroke="#C5A059"
      strokeWidth="1.2"
      opacity="0.65"
    />
  </svg>
);

export default RubrifactLogo;
