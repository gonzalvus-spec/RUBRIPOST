export interface AutoScrollIntent {
  /** -1 hacia arriba, 1 hacia abajo y 0 sin desplazamiento. */
  direction: -1 | 0 | 1;
  /** Píxeles por frame; crece al acercarse al borde. */
  speed: number;
}

/**
 * Calcula el desplazamiento automático según la posición vertical del cursor
 * dentro de un contenedor con scroll.
 */
export const autoScrollIntent = (
  clientY: number,
  top: number,
  bottom: number,
  edge = 64,
): AutoScrollIntent => {
  const height = bottom - top;
  if (height <= 0) return { direction: 0, speed: 0 };

  const threshold = Math.min(edge, height / 3);
  if (threshold <= 0) return { direction: 0, speed: 0 };

  if (clientY < top + threshold) {
    const intensity = Math.min(1, Math.max(0, (top + threshold - clientY) / threshold));
    return { direction: -1, speed: 3 + intensity * 14 };
  }

  if (clientY > bottom - threshold) {
    const intensity = Math.min(1, Math.max(0, (clientY - (bottom - threshold)) / threshold));
    return { direction: 1, speed: 3 + intensity * 14 };
  }

  return { direction: 0, speed: 0 };
};
