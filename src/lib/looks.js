// Looks for the projector: colours, background and typeface chosen together, so every one is readable from the back row.
// A church picks one in Projector → Look, then may still change a colour; a changed background colour turns the
// designed background off so the colour they chose is what shows.
export const FONTS = {
  sans: "'Atkinson Hyperlegible', system-ui, sans-serif",
  serif: "'Source Serif 4', Georgia, serif",
  display: "'Bricolage Grotesque', 'Atkinson Hyperlegible', sans-serif"
};

export const LOOKS = [
  {
    id: 'classic', name: { en: 'Classic', sw: 'Kawaida' },
    bg: '#000000', fg: '#FFFFFF', accent: '#FF6B2C', font: 'sans'
  },
  {
    id: 'sunrise', name: { en: 'Sunrise', sw: 'Mapambazuko' },
    bg: '#140805', fg: '#FFF7EE', accent: '#FFB067', font: 'sans', motion: true,
    backdrop: 'radial-gradient(140% 95% at 50% 125%, #9A3B14 0%, #4A1A0C 42%, #170906 78%, #100604 100%)',
    glow: 'radial-gradient(45% 40% at 50% 100%, rgba(255,160,80,.38), rgba(255,160,80,0) 70%)'
  },
  {
    id: 'midnight', name: { en: 'Midnight', sw: 'Usiku' },
    bg: '#060A18', fg: '#F1F4FF', accent: '#9DBBFF', font: 'sans', motion: true,
    backdrop: 'radial-gradient(120% 110% at 15% 0%, #1E2F66 0%, #0C1534 45%, #060A18 100%)',
    glow: 'radial-gradient(38% 34% at 82% 18%, rgba(130,165,255,.26), rgba(130,165,255,0) 70%)'
  },
  {
    id: 'royal', name: { en: 'Royal', sw: 'Kifalme' },
    bg: '#0D0614', fg: '#FBF6FF', accent: '#E2BE6A', font: 'serif', motion: true,
    backdrop: 'radial-gradient(130% 100% at 50% -10%, #43206A 0%, #1E0E33 48%, #0D0614 100%)',
    glow: 'radial-gradient(40% 30% at 50% 0%, rgba(226,190,106,.16), rgba(226,190,106,0) 70%)'
  },
  {
    id: 'forest', name: { en: 'Forest', sw: 'Msitu' },
    bg: '#050E09', fg: '#F2FBF4', accent: '#93DDAE', font: 'sans', motion: true,
    backdrop: 'linear-gradient(165deg, #133A25 0%, #0A1F14 52%, #050E09 100%)',
    glow: 'radial-gradient(45% 40% at 20% 15%, rgba(150,230,180,.14), rgba(150,230,180,0) 70%)'
  },
  {
    id: 'slate', name: { en: 'Slate', sw: 'Kijivu' },
    bg: '#111316', fg: '#F4F6F8', accent: '#7FD3E6', font: 'display',
    backdrop: 'linear-gradient(180deg, #252A31 0%, #16191D 60%, #111316 100%)'
  },
  {
    id: 'parchment', name: { en: 'Parchment', sw: 'Ngozi' },
    bg: '#F2EBDC', fg: '#2B2118', accent: '#9C3F15', font: 'serif', light: true,
    backdrop: 'radial-gradient(120% 95% at 50% 40%, #FBF7EC 0%, #F1E8D6 62%, #E3D4B6 100%)'
  },
  {
    id: 'contrast', name: { en: 'High contrast', sw: 'Tofauti kubwa' },
    bg: '#000000', fg: '#FFFFFF', accent: '#FFD23F', font: 'sans'
  }
];

export const lookById = (id) => LOOKS.find((l) => l.id === id) || null;

// the designed background is shown only while the church keeps the look's own background colour
export function activeLook(theme) {
  const look = lookById(theme && theme.look);
  return look && look.backdrop && (theme.bg || '').toLowerCase() === look.bg.toLowerCase() ? look : null;
}

export const fontOf = (theme) => FONTS[(theme && theme.font) || 'sans'] || FONTS.sans;

// the theme after choosing a look: colours and typeface change, the church's other choices stay
export function applyLook(theme, id) {
  const look = lookById(id);
  if (!look) return theme;
  return { ...theme, look: id, bg: look.bg, fg: look.fg, accent: look.accent, font: look.font };
}

// a slide's identity, so the projector knows when to fade to a new one
export const slideKey = (s) => (s ? JSON.stringify([s.title, s.text, s.sub, s.ref, s.credit, s.media && s.media.file]) : '');
