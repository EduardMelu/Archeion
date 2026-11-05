import type { ReactNode } from "react";

function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const Play = () => (
  <Icon>
    <path d="M4.5 2.75v10.5L13 8z" />
  </Icon>
);
export const Pause = () => (
  <Icon>
    <path d="M5 3v10M11 3v10" />
  </Icon>
);
export const Previous = () => (
  <Icon>
    <path d="M12.5 3v10L5 8zM3.5 3v10" />
  </Icon>
);
export const Next = () => (
  <Icon>
    <path d="M3.5 3v10L11 8zM12.5 3v10" />
  </Icon>
);
export const Restart = () => (
  <Icon>
    <path d="M3.5 8a4.5 4.5 0 1 0 1.4-3.3M3 2.5v3h3" />
  </Icon>
);
export const Sun = () => (
  <Icon>
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.4 1.4M11.6 11.6 13 13M13 3l-1.4 1.4M4.4 11.6 3 13" />
  </Icon>
);
export const Moon = () => (
  <Icon>
    <path d="M13 9.5A5.5 5.5 0 0 1 6.5 3a5.5 5.5 0 1 0 6.5 6.5z" />
  </Icon>
);
export const Plus = () => (
  <Icon>
    <path d="M8 3v10M3 8h10" />
  </Icon>
);
export const Minus = () => (
  <Icon>
    <path d="M3 8h10" />
  </Icon>
);
export const Fit = () => (
  <Icon>
    <path d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />
  </Icon>
);
export const Close = () => (
  <Icon>
    <path d="m3.5 3.5 9 9M12.5 3.5l-9 9" />
  </Icon>
);
