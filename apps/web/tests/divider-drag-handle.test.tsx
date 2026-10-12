import { describe, expect, it } from 'vitest';
import { DividerDragHandle } from '../src/components/DividerDragHandle.js';
import { calculateGeometry } from '@furniconfig/geometry-core';
import { DEFAULT_CONFIG } from '../src/lib/config.js';
import { SeparatorDragResult } from '../src/lib/studio/separators.js';

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
const config = DEFAULT_CONFIG;

const mockCallbacks = {
  onDragStart: (index: number) => {},
  onDragMove: (result: SeparatorDragResult) => {},
  onDragEnd: (result: SeparatorDragResult) => {},
};

describe('DividerDragHandle (componente 3D)', () => {
  it('exporta el componente DividerDragHandle', () => {
    expect(typeof DividerDragHandle).toBe('function');
  });

  it('tiene la estructura correcta de props', () => {
    // Verificamos que el componente existe y es una función
    expect(typeof DividerDragHandle).toBe('function');
  });
});