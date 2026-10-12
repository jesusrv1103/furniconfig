import { describe, expect, it } from 'vitest';
import { DividerDragHandle } from '../src/components/DividerDragHandle.js';
import { calculateGeometry } from '@furniconfig/geometry-core';
import { DEFAULT_CONFIG } from '../src/lib/config.js';
import { SeparatorDragResult } from '../src/lib/studio/separators.js';
import { extractDividers } from '../src/components/DividerDragHandle.js';

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

const geometry = deepFreeze(calculateGeometry(DEFAULT_CONFIG));

describe('DividerDragHandle (componente 3D)', () => {
  it('exporta la función extractDividers correctamente', () => {
    const divs = extractDividers(geometry);
    expect(divs.length).toBe(2); // 3 módulos = 2 divisiones
    expect(divs[0]!.index).toBe(0);
    expect(divs[1]!.index).toBe(1);
    expect(divs[0]!.centerXM).toBeGreaterThan(0);
    expect(divs[0]!.centerXM).toBeLessThan(2.4);
  });

  it('exporta el componente DividerDragHandle', () => {
    expect(typeof DividerDragHandle).toBe('function');
  });
});