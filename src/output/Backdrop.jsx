import React from 'react';
import { activeLook } from '../lib/looks.js';

// The look's designed background: a gradient, with a soft light that drifts slowly on the projector.
export function Backdrop({ theme, still }) {
  const look = activeLook(theme);
  if (!look) return null;
  return (
    <div className="backdrop" style={{ background: look.backdrop }}>
      {look.glow && <div className={'backdrop-glow' + (look.motion && !still ? ' moving' : '')} style={{ background: look.glow }} />}
    </div>
  );
}
