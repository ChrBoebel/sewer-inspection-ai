export const PF = "'Inter', var(--font-inter), sans-serif"
export const MONO = "'IBM Plex Mono', var(--font-mono), monospace"

export const T = {
  bg:        'var(--bg)',
  surface:   'var(--surface)',
  card:      'var(--card)',
  cardHover: 'var(--card-hover)',
  border:    'var(--border)',
  borderMid: 'var(--border-mid)',
  accent:    'var(--accent)',
  accentDim: 'var(--accent-dim)',
  text:      'var(--text)',
  muted:     'var(--muted)',
  dim:       'var(--dim)',
  green:       '#1a6a32', greenDim:  '#e0f5e8', greenBorder:  '#90d4a8',
  yellow:      '#7a4f00', yellowDim: '#fff8e6', yellowBorder: '#fcd34d',
  red:         '#b01030', redDim:    '#ffeaec', redBorder:    '#ffb0ba',
  mono: MONO,
}

export const MODUS_VARS: Record<string, Record<string, string>> = {
  'büro': {
    '--bg':'#f2f2f2','--surface':'#ffffff','--card':'#f8f9fc','--card-hover':'rgba(0,89,255,0.07)',
    '--border':'#e2e2e2','--border-mid':'#c5cdd6','--text':'#2f3d44','--muted':'#64787f','--dim':'#9baab2',
    '--col-open':'rgba(0,89,255,0.04)','--col-accept':'#e8f5ef','--col-reject':'#fff0f2',
  },
  'feld': {
    '--bg':'#ffffff','--surface':'#f4f6f8','--card':'#eaecf0','--card-hover':'rgba(0,89,255,0.09)',
    '--border':'#d0d5dc','--border-mid':'#a8b2bc','--text':'#1a2830','--muted':'#3a4c54','--dim':'#6a7c84',
    '--col-open':'rgba(0,89,255,0.05)','--col-accept':'#d8f0e4','--col-reject':'#ffd8dc',
  },
  'audit': {
    '--bg':'#f8f8f8','--surface':'#f0f0f0','--card':'#e8e8e8','--card-hover':'rgba(0,89,255,0.07)',
    '--border':'#d8d8d8','--border-mid':'#b8b8b8','--text':'#1a1a1a','--muted':'#505050','--dim':'#909090',
    '--col-open':'#ededeb','--col-accept':'#e0e0de','--col-reject':'#fde8ea',
  },
}

export function hexToRgb(h: string) {
  const v = h.replace('#','')
  return { r: parseInt(v.slice(0,2),16), g: parseInt(v.slice(2,4),16), b: parseInt(v.slice(4,6),16) }
}

export function applyTweaks(tweaks: { modus: string; palette: string }) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const vars = MODUS_VARS[tweaks.modus] || MODUS_VARS['büro']
  Object.entries(vars).forEach(([k,v]) => root.style.setProperty(k,v))
  const acc = tweaks.modus === 'audit' ? '#8a1e1e' : tweaks.palette
  const {r,g,b} = hexToRgb(acc)
  root.style.setProperty('--accent', acc)
  root.style.setProperty('--accent-dim', `rgba(${r},${g},${b},0.10)`)
}
