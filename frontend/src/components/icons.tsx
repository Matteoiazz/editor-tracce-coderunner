// Icone SVG dell'interfaccia: tratto da 1.75 su griglia 16x16, estremi arrotondati.

import type { ReactNode, SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 16, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const IconCheck = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 8.5l3 3 6-7" />
  </Icon>
);

export const IconCross = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />
  </Icon>
);

/** Da fare: cerchio vuoto. */
export const IconTodo = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="4.5" />
  </Icon>
);

/** Attenzione: cerchio con trattino. */
export const IconWarning = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 5v3.5M8 11h.01" />
  </Icon>
);

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 3.5v9M3.5 8h9" />
  </Icon>
);

export const IconImport = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 2.5v7.5M5 7l3 3 3-3M3 11.5v1.5h10v-1.5" />
  </Icon>
);

export const IconExport = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 10V2.5M5 5.5l3-3 3 3M3 11.5v1.5h10v-1.5" />
  </Icon>
);

export const IconNewExam = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 2.5h5.5L12 5v8.5H4z" />
    <path d="M8 7.5v4M6 9.5h4" />
  </Icon>
);

export const IconRun = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 3.5v9l7-4.5z" />
  </Icon>
);

export const IconCompute = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 4.5h4M3 8h10M3 11.5h7" />
    <path d="M11 3l2 1.5-2 1.5" />
  </Icon>
);

export const IconGenerate = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.5 5L3 8l2.5 3M10.5 5L13 8l-2.5 3" />
  </Icon>
);

export const IconTrash = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.5 8.5h6l.5-8.5" />
  </Icon>
);

export const IconChevron = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 4l4 4-4 4" />
  </Icon>
);

export const IconClose = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 5l6 6M11 5l-6 6" />
  </Icon>
);

export const IconUndo = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.5 4L3 6.5 5.5 9" />
    <path d="M3 6.5h6.5a3.5 3.5 0 010 7H7" />
  </Icon>
);

export const IconRedo = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10.5 4L13 6.5 10.5 9" />
    <path d="M13 6.5H6.5a3.5 3.5 0 000 7H9" />
  </Icon>
);

export const IconBulletList = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6.5 4.5h7M6.5 8h7M6.5 11.5h7" />
    <path d="M3 4.5h.01M3 8h.01M3 11.5h.01" strokeWidth={2.4} />
  </Icon>
);

export const IconNumberedList = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 4.5h6.5M7 8h6.5M7 11.5h6.5" />
    <path d="M2.5 3.5l1-.5v3M2.5 9.5c0-.8 2-1 2 0 0 .7-2 1.3-2 2h2" strokeWidth={1.3} />
  </Icon>
);

export const IconInlineCode = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.5 5L2.5 8l3 3M10.5 5l3 3-3 3" />
  </Icon>
);
