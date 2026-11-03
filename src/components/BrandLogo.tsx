import React from 'react';

interface BrandLogoProps {
  className?: string;
}

/**
 * Hexagonal Power-Plug Emblem extracted from the uploaded Key Visual
 */
export const BrandLogo: React.FC<BrandLogoProps> = ({ className = 'w-9 h-9' }) => {
  return (
    <svg
      viewBox="0 0 120 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="brandRedGrad" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ff2a2a" />
          <stop offset="50%" stopColor="#e60012" />
          <stop offset="100%" stopColor="#8a000b" />
        </linearGradient>
        <linearGradient id="brandCarbonGrad" x1="0" y1="0" x2="0" y2="120" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#222227" />
          <stop offset="100%" stopColor="#0a0a0d" />
        </linearGradient>
      </defs>

      {/* Outer Tech Hexagon */}
      <polygon
        points="60,5 110,33 110,87 60,115 10,87 10,33"
        fill="url(#brandCarbonGrad)"
        stroke="url(#brandRedGrad)"
        strokeWidth="6.5"
        strokeLinejoin="round"
      />

      {/* Inner Bevel Frame */}
      <polygon
        points="60,14 101,37 101,83 60,106 19,83 19,37"
        fill="none"
        stroke="#ff3b3b"
        strokeOpacity="0.28"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />

      {/* Stylized Power Plug Icon from Key Visual */}
      <path
        d="M35 42 C35 38 38 35 42 35 H78 C82 35 85 38 85 42 V56 C85 65 77 71 60 71 C43 71 35 65 35 56 V42 Z"
        fill="url(#brandRedGrad)"
      />
      {/* Prongs */}
      <rect x="44" y="68" width="9" height="23" rx="4.5" fill="#f8fafc" />
      <rect x="67" y="68" width="9" height="23" rx="4.5" fill="#f8fafc" />

      {/* Top HUD Stripes */}
      <line x1="45" y1="25" x2="75" y2="25" stroke="#ff2a2a" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
};
