import React from 'react';

/**
 * LoginMetrologyAnimation
 * ------------------------------------------------------------------
 * Decorative animated panel for the NMC Metrology License Report
 * System login page. Pure CSS keyframes + inline SVG only — no
 * external scripts, no animation libraries, no network assets.
 *
 * Visual concept (science of measurement / legal metrology):
 *  - slow-drifting measurement grid background
 *  - pulsing calibration signal wave with a travelling measurement dot
 *  - very slowly rotating precision gauge ring with a gentle needle sweep
 *  - ruler scale with tick groups fading in and out
 *  - gently swaying balance scale (legal metrology symbol)
 *  - floating SI base-unit symbols: kg m s K A mol cd
 *
 * Motion is intentionally slow and low-opacity (dark blue / gold,
 * government style). Only `transform` and `opacity` are animated for
 * performance. `prefers-reduced-motion` disables all movement.
 */

const SI_UNITS: { label: string; top: string; left: string; delay: string; duration: string; size: string }[] = [
  { label: 'kg',  top: '14%', left: '8%',  delay: '0s',   duration: '16s', size: '1.15rem' },
  { label: 'm',   top: '30%', left: '86%', delay: '2.5s', duration: '18s', size: '1.05rem' },
  { label: 's',   top: '58%', left: '6%',  delay: '5s',   duration: '15s', size: '0.95rem' },
  { label: 'K',   top: '10%', left: '55%', delay: '7s',   duration: '19s', size: '1.0rem'  },
  { label: 'A',   top: '68%', left: '78%', delay: '3.5s', duration: '17s', size: '1.1rem'  },
  { label: 'mol', top: '44%', left: '38%', delay: '9s',   duration: '20s', size: '0.9rem'  },
  { label: 'cd',  top: '78%', left: '30%', delay: '6s',   duration: '16s', size: '0.95rem' },
];

// Ruler tick marks: major tick every 5th position
const RULER_TICKS = Array.from({ length: 45 }, (_, i) => ({
  x: 20 + i * 13.5,
  major: i % 5 === 0,
}));

export default function LoginMetrologyAnimation() {
  return (
    <div className="mla-root" aria-hidden="true">
      <style>{`
        .mla-root {
          position: relative;
          width: 100%;
          height: 300px;
          border-radius: 18px;
          overflow: hidden;
          background: linear-gradient(150deg, rgba(4, 12, 34, 0.55) 0%, rgba(10, 31, 68, 0.45) 55%, rgba(4, 12, 34, 0.55) 100%);
          border: 1px solid rgba(201, 162, 39, 0.22);
          box-shadow: inset 0 0 60px rgba(3, 10, 28, 0.45);
        }

        /* --- Slowly drifting measurement grid ------------------------ */
        .mla-grid {
          position: absolute;
          top: -50%;
          left: -50%;
          width: 200%;
          height: 200%;
          background-image:
            linear-gradient(rgba(127, 168, 201, 0.09) 1px, transparent 1px),
            linear-gradient(90deg, rgba(127, 168, 201, 0.09) 1px, transparent 1px);
          background-size: 44px 44px;
          animation: mla-grid-drift 70s linear infinite;
          will-change: transform;
        }

        @keyframes mla-grid-drift {
          from { transform: translate3d(0, 0, 0); }
          to   { transform: translate3d(44px, 44px, 0); }
        }

        .mla-svg {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }

        /* --- Precision gauge ring ------------------------------------ */
        .mla-gauge-ring {
          transform-origin: 520px 96px;
          animation: mla-rotate-slow 90s linear infinite;
        }

        @keyframes mla-rotate-slow {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }

        .mla-gauge-needle {
          transform-origin: 520px 96px;
          animation: mla-needle-sweep 14s ease-in-out infinite alternate;
        }

        @keyframes mla-needle-sweep {
          from { transform: rotate(-32deg); }
          to   { transform: rotate(38deg); }
        }

        /* --- Calibration wave ---------------------------------------- */
        .mla-wave-gold {
          animation: mla-wave-pulse 9s ease-in-out infinite;
        }

        .mla-wave-blue {
          animation: mla-wave-pulse 9s ease-in-out 4.5s infinite;
        }

        @keyframes mla-wave-pulse {
          0%, 100% { opacity: 0.18; }
          50%      { opacity: 0.55; }
        }

        /* Measurement dot travelling along the calibration wave */
        .mla-wave-dot {
          offset-path: path('M 0 218 Q 40 218 80 196 T 160 218 T 240 240 T 320 205 T 400 218 T 480 232 T 560 210 T 640 218');
          animation: mla-dot-travel 22s linear infinite;
        }

        @keyframes mla-dot-travel {
          0%   { offset-distance: 0%;   opacity: 0; }
          6%   { opacity: 0.9; }
          94%  { opacity: 0.9; }
          100% { offset-distance: 100%; opacity: 0; }
        }

        /* --- Ruler tick groups fading -------------------------------- */
        .mla-ruler-a { animation: mla-tick-fade 10s ease-in-out infinite; }
        .mla-ruler-b { animation: mla-tick-fade 10s ease-in-out 3.3s infinite; }
        .mla-ruler-c { animation: mla-tick-fade 10s ease-in-out 6.6s infinite; }

        @keyframes mla-tick-fade {
          0%, 100% { opacity: 0.22; }
          50%      { opacity: 0.75; }
        }

        /* --- Balance scale gentle sway ------------------------------- */
        .mla-balance {
          transform-origin: 96px 62px;
          animation: mla-balance-sway 12s ease-in-out infinite alternate;
        }

        @keyframes mla-balance-sway {
          from { transform: rotate(-2.5deg); }
          to   { transform: rotate(2.5deg); }
        }

        /* --- Floating SI unit symbols -------------------------------- */
        .mla-si-symbol {
          position: absolute;
          font-family: 'Inter', 'Times New Roman', serif;
          font-style: italic;
          font-weight: 600;
          color: rgba(201, 162, 39, 0.5);
          text-shadow: 0 0 14px rgba(201, 162, 39, 0.25);
          animation: mla-float ease-in-out infinite;
          user-select: none;
          pointer-events: none;
          will-change: transform, opacity;
        }

        .mla-si-symbol:nth-child(even) {
          color: rgba(148, 186, 217, 0.45);
          text-shadow: 0 0 14px rgba(127, 168, 201, 0.25);
        }

        @keyframes mla-float {
          0%, 100% { transform: translate3d(0, 0, 0);      opacity: 0.25; }
          25%      { transform: translate3d(6px, -12px, 0); opacity: 0.6; }
          50%      { transform: translate3d(-4px, -20px, 0); opacity: 0.4; }
          75%      { transform: translate3d(-8px, -8px, 0); opacity: 0.55; }
        }

        /* --- Responsive: simplified on small screens ------------------ */
        @media (max-width: 991px) {
          .mla-root { height: 170px; }
          .mla-si-symbol:nth-child(n+5) { display: none; }
        }

        @media (max-width: 640px) {
          .mla-root { height: 130px; }
          .mla-si-symbol:nth-child(n+4) { display: none; }
        }

        /* --- Accessibility: respect reduced motion -------------------- */
        @media (prefers-reduced-motion: reduce) {
          .mla-grid,
          .mla-gauge-ring,
          .mla-gauge-needle,
          .mla-wave-gold,
          .mla-wave-blue,
          .mla-wave-dot,
          .mla-ruler-a,
          .mla-ruler-b,
          .mla-ruler-c,
          .mla-balance,
          .mla-si-symbol {
            animation: none !important;
          }
          .mla-wave-gold, .mla-wave-blue { opacity: 0.35; }
          .mla-wave-dot { opacity: 0; }
        }
      `}</style>

      {/* Drifting measurement grid background */}
      <div className="mla-grid"></div>

      <svg
        className="mla-svg"
        viewBox="0 0 640 300"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* ---- Balance scale (legal metrology) — top left ---- */}
        <g className="mla-balance" stroke="rgba(201, 162, 39, 0.4)" strokeWidth="1.6" fill="none" strokeLinecap="round">
          {/* pillar and beam */}
          <line x1="96" y1="42" x2="96" y2="96" />
          <line x1="56" y1="52" x2="136" y2="52" />
          <circle cx="96" cy="42" r="3.5" />
          {/* left pan */}
          <line x1="56" y1="52" x2="46" y2="74" />
          <line x1="56" y1="52" x2="66" y2="74" />
          <path d="M 42 74 Q 56 86 70 74" />
          {/* right pan */}
          <line x1="136" y1="52" x2="126" y2="74" />
          <line x1="136" y1="52" x2="146" y2="74" />
          <path d="M 122 74 Q 136 86 150 74" />
          {/* base */}
          <line x1="82" y1="96" x2="110" y2="96" />
        </g>

        {/* ---- Precision gauge ring — top right ---- */}
        <g>
          {/* rotating tick ring */}
          <circle
            className="mla-gauge-ring"
            cx="520" cy="96" r="58"
            fill="none"
            stroke="rgba(148, 186, 217, 0.35)"
            strokeWidth="2"
            strokeDasharray="3 11"
          />
          {/* static gold arc (measurement range) */}
          <circle
            cx="520" cy="96" r="44"
            fill="none"
            stroke="rgba(201, 162, 39, 0.35)"
            strokeWidth="2.5"
            strokeDasharray="172 276"
            strokeLinecap="round"
            transform="rotate(128 520 96)"
          />
          {/* sweeping needle */}
          <g className="mla-gauge-needle">
            <line
              x1="520" y1="96" x2="520" y2="60"
              stroke="rgba(201, 162, 39, 0.65)"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </g>
          <circle cx="520" cy="96" r="4" fill="rgba(201, 162, 39, 0.6)" />
        </g>

        {/* ---- Calibration signal waves — centre ---- */}
        <path
          className="mla-wave-gold"
          d="M 0 218 Q 40 218 80 196 T 160 218 T 240 240 T 320 205 T 400 218 T 480 232 T 560 210 T 640 218"
          fill="none"
          stroke="rgba(201, 162, 39, 0.6)"
          strokeWidth="1.6"
        />
        <path
          className="mla-wave-blue"
          d="M 0 232 Q 40 232 80 246 T 160 228 T 240 214 T 320 240 T 400 232 T 480 220 T 560 238 T 640 232"
          fill="none"
          stroke="rgba(148, 186, 217, 0.5)"
          strokeWidth="1.3"
        />
        {/* travelling measurement dot */}
        <circle className="mla-wave-dot" r="3.5" fill="rgba(251, 191, 36, 0.85)" />

        {/* ---- Ruler scale — bottom ---- */}
        <g stroke="rgba(148, 186, 217, 0.55)" strokeWidth="1">
          <line x1="14" y1="276" x2="626" y2="276" strokeWidth="1.2" />
          <g className="mla-ruler-a">
            {RULER_TICKS.filter((_, i) => i % 3 === 0).map((t, i) => (
              <line key={i} x1={t.x} y1="276" x2={t.x} y2={t.major ? 260 : 267} />
            ))}
          </g>
          <g className="mla-ruler-b">
            {RULER_TICKS.filter((_, i) => i % 3 === 1).map((t, i) => (
              <line key={i} x1={t.x} y1="276" x2={t.x} y2={t.major ? 260 : 267} />
            ))}
          </g>
          <g className="mla-ruler-c">
            {RULER_TICKS.filter((_, i) => i % 3 === 2).map((t, i) => (
              <line key={i} x1={t.x} y1="276" x2={t.x} y2={t.major ? 260 : 267} />
            ))}
          </g>
        </g>
      </svg>

      {/* Floating SI base-unit symbols */}
      <div style={{ position: 'absolute', inset: 0 }}>
        {SI_UNITS.map((u) => (
          <span
            key={u.label}
            className="mla-si-symbol"
            style={{
              top: u.top,
              left: u.left,
              fontSize: u.size,
              animationDelay: u.delay,
              animationDuration: u.duration,
            }}
          >
            {u.label}
          </span>
        ))}
      </div>
    </div>
  );
}
