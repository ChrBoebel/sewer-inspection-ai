'use client'

export default function TunnelBackground() {
  return (
    <div className="bg-layer" aria-hidden="true">
      <svg
        viewBox="0 0 1600 900"
        preserveAspectRatio="xMidYMid slice"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      >
        <defs>
          <pattern id="grid-fine" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(15,23,42,0.04)" strokeWidth="0.6" />
          </pattern>
          <pattern id="grid-major" width="200" height="200" patternUnits="userSpaceOnUse">
            <path d="M 200 0 L 0 0 0 200" fill="none" stroke="rgba(15,23,42,0.065)" strokeWidth="0.8" />
          </pattern>
          <radialGradient id="cg1" cx="0%" cy="0%" r="60%">
            <stop offset="0%" stopColor="rgba(8,145,178,0.09)" />
            <stop offset="100%" stopColor="rgba(8,145,178,0)" />
          </radialGradient>
          <radialGradient id="cg2" cx="100%" cy="100%" r="60%">
            <stop offset="0%" stopColor="rgba(99,102,241,0.07)" />
            <stop offset="100%" stopColor="rgba(99,102,241,0)" />
          </radialGradient>
        </defs>
        <rect width="1600" height="900" fill="url(#cg1)" />
        <rect width="1600" height="900" fill="url(#cg2)" />
        <rect width="1600" height="900" fill="url(#grid-fine)" />
        <rect width="1600" height="900" fill="url(#grid-major)" />
        <g stroke="rgba(8,145,178,0.28)" strokeWidth="1" fill="none">
          <path d="M 24 24 L 64 24 M 24 24 L 24 64" />
          <path d="M 1576 24 L 1536 24 M 1576 24 L 1576 64" />
          <path d="M 24 876 L 64 876 M 24 876 L 24 836" />
          <path d="M 1576 876 L 1536 876 M 1576 876 L 1576 836" />
        </g>
      </svg>
    </div>
  )
}
