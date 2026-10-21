import React from 'react';

// Shared Heroicons used across components. Each icon declares a tight viewBox
// around its glyph (all centered on 12,12) so every icon renders at the same
// visual size instead of inheriting the uneven insets of the 24x24 grid.
// non-scaling-stroke keeps the stroke width in device pixels so the varying
// viewBox scale doesn't change the visual weight.

interface IconProps {
  size?: number;
  strokeWidth?: number;
}

const OutlineIcon: React.FC<IconProps & { viewBox: string; path: string }> = ({
  size = 14,
  strokeWidth = 1.5,
  viewBox,
  path,
}) => (
  <svg
    width={size}
    height={size}
    viewBox={viewBox}
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    vectorEffect="non-scaling-stroke"
  >
    <path d={path} />
  </svg>
);

// Heroicons: x-mark (outline)
export const XMarkIcon: React.FC<IconProps> = (props) => (
  <OutlineIcon {...props} viewBox="5.5 5.5 13 13" path="M6 18 18 6M6 6l12 12" />
);

// Heroicons: chevron-up (outline)
export const ChevronUpIcon: React.FC<IconProps> = (props) => (
  <OutlineIcon {...props} viewBox="4 7.5 16 9" path="M4.5 15.75l7.5-7.5 7.5 7.5" />
);

// Heroicons: chevron-down (outline)
export const ChevronDownIcon: React.FC<IconProps> = (props) => (
  <OutlineIcon {...props} viewBox="4 7.5 16 9" path="M19.5 8.25l-7.5 7.5-7.5-7.5" />
);

// Heroicons: command-line (outline)
export const CommandLineIcon: React.FC<IconProps> = (props) => (
  <OutlineIcon
    {...props}
    viewBox="2.5 3.25 19 17.5"
    path="m6.75 7.5 3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0 0 21 18V6a2.25 2.25 0 0 0-2.25-2.25H5.25A2.25 2.25 0 0 0 3 6v12a2.25 2.25 0 0 0 2.25 2.25Z"
  />
);

// Heroicons: star (outline)
export const StarOutlineIcon: React.FC<IconProps> = (props) => (
  <OutlineIcon
    {...props}
    viewBox="1.5 2 21 20"
    path="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z"
  />
);

// Heroicons: star (solid)
export const StarSolidIcon: React.FC<IconProps> = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="1.5 2 21 20" fill="currentColor">
    <path
      fillRule="evenodd"
      d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.005Z"
      clipRule="evenodd"
    />
  </svg>
);
// Heroicons: key (outline)
export const KeyIcon: React.FC<IconProps> = (props) => (
  <OutlineIcon
    {...props}
    viewBox="2 2 20 20"
    path="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z"
  />
);
