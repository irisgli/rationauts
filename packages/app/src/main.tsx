import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { PALETTE, TERRAIN_FILL } from './palette.js';
import './styles.css';

/**
 * Publishes the palette to CSS so the stylesheet and the canvas cannot drift apart.
 *
 * The values are defined once in TypeScript because the canvas needs them as plain
 * strings; writing them onto the root here is cheaper than a `getComputedStyle` call
 * per frame, and much cheaper than maintaining two lists of hex codes.
 */
function publishPalette(): void {
  const root = document.documentElement;
  for (const [name, value] of Object.entries(PALETTE)) {
    root.style.setProperty(`--${name}`, value);
  }
  for (const [terrain, value] of Object.entries(TERRAIN_FILL)) {
    root.style.setProperty(`--terrain-${terrain}`, value);
  }
}

publishPalette();

const container = document.getElementById('root');
if (container === null) throw new Error('Missing #root');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
