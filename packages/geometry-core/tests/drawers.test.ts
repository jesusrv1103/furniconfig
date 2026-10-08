import { describe, expect, it } from 'vitest';
import {
  buildPanels,
  calculateGeometry,
  distributeDrawerBands,
  validateWardrobeConfig,
  type MaterialSpec,
  type ModuleConfig,
  type Panel,
  type Wardrobe,
  type WardrobeConfig,
} from '../src/index.js';
import { buildDrawers } from '../src/engine/drawers.js';
import { GeometryError } from '../src/errors.js';

const config: WardrobeConfig = {
  schemaVersion: 1,
  dimensions: { widthMm: 2400, heightMm: 2200, depthMm: 600 },
  modules: [
    { kind: 'shelves', shelves: 3 },
    { kind: 'hanging' },
    { kind: 'drawers' },
  ],
  materials: {
    structure: { name: 'Roble', thicknessMm: 18, finish: 'mate' },
    interior: { name: 'Blanco', thicknessMm: 15, finish: 'mate' },
  },
};

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

function errorOf(fn: () => unknown): Error {
  try {
    fn();
  } catch (error) {
    return error as Error;
  }
  throw new Error('Se esperaba que la función lanzara');
}

/** Volumen de intersección entre dos paneles (mm³). */
function intersectionVolumeMm3(a: Panel, b: Panel): number {
  const xOverlap = Math.max(
    0,
    Math.min(a.positionMm.x + a.sizeMm.x, b.positionMm.x + b.sizeMm.x) -
      Math.max(a.positionMm.x, b.positionMm.x),
  );
  const yOverlap = Math.max(
    0,
    Math.min(a.positionMm.y + a.sizeMm.y, b.positionMm.y + b.sizeMm.y) -
      Math.max(a.positionMm.y, b.positionMm.y),
  );
  const zOverlap = Math.max(
    0,
    Math.min(a.positionMm.z + a.sizeMm.z, b.positionMm.z + b.sizeMm.z) -
      Math.max(a.positionMm.z, b.positionMm.z),
  );
  return xOverlap * yOverlap * zOverlap;
}

/** Wardrobe a mano para forzar errores geométricos. */
function tinyWardrobe(overrides: {
  widthMm?: number;
  heightMm?: number;
  depthMm?: number;
  drawerCount?: number;
}): Wardrobe {
  const widthMm = overrides.widthMm ?? 1000;
  const heightMm = overrides.heightMm ?? 1000;
  const depthMm = overrides.depthMm ?? 500;
  const t = 18;
  return {
    widthMm,
    heightMm,
    depthMm,
    modules: [
      {
        id: 'module-1',
        kind: 'drawers',
        widthMm: widthMm - 2 * t,
        heightMm: heightMm - 2 * t,
        depthMm,
        drawers: overrides.drawerCount ?? 1,
      },
    ],
    materials: {
      structure: {
        id: 'material-structure',
        name: 'Roble',
        thicknessMm: 18,
        finish: 'mate',
      },
      interior: {
        id: 'material-interior',
        name: 'Blanco',
        thicknessMm: 15,
        finish: 'mate',
      },
      drawer: {
        id: 'material-drawer',
        name: 'Blanco',
        thicknessMm: 15,
        finish: 'mate',
      },
    },
  };
}

describe('buildDrawers — cajoneras', () => {
  // Módulo 3 de DEFAULT_CONFIG: interior 776 × 2164 × 564,
  // espesor de cajón 15 mm, holguras 3 mm.
  const result = calculateGeometry(config);
  const module3 = result.wardrobe.modules[2];
  const drawerPanels = result.panels.filter((panel) =>
    panel.role.startsWith('drawer-'),
  );

  it('genera un ensamblaje por cajón (default 3)', () => {
    expect(result.drawers).toHaveLength(3);
    expect(result.totals.drawerCount).toBe(3);
    // 3 cajones × 5 piezas (frente, 2 laterales, trasera, fondo).
    expect(result.totals.drawerPartCount).toBe(15);
    expect(drawerPanels).toHaveLength(15);
  });

  it('resuelve el material de cajón con id estable', () => {
    expect(result.wardrobe.materials.drawer).toEqual({
      id: 'material-drawer',
      name: 'Blanco',
      thicknessMm: 15,
      finish: 'mate',
    });
    for (const panel of drawerPanels) {
      expect(panel.materialId).toBe('material-drawer');
    }
  });

  it('IDs estables y únicos para ensamblajes y piezas', () => {
    expect(result.drawers.map((drawer) => drawer.id)).toEqual([
      'drawer-module-3-1',
      'drawer-module-3-2',
      'drawer-module-3-3',
    ]);
    const ids = drawerPanels.map((panel) => panel.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain('panel-drawer-front-m3-1');
    expect(ids).toContain('panel-drawer-side-l-m3-1');
    expect(ids).toContain('panel-drawer-side-r-m3-1');
    expect(ids).toContain('panel-drawer-back-m3-1');
    expect(ids).toContain('panel-drawer-bottom-m3-1');
  });

  it('distribución de alturas: residuo de abajo hacia arriba', () => {
    // 2164 mm entre 3 cajones: 722 + 721 + 721.
    expect(distributeDrawerBands(2164, 3)).toEqual([722, 721, 721]);
    // Cajón 1: y ∈ [18, 737] (banda 722 − holgura 3).
    const front1 = drawerPanels.find(
      (panel) => panel.id === 'panel-drawer-front-m3-1',
    );
    expect(front1?.positionMm.y).toBe(18);
    expect(front1?.sizeMm.y).toBe(719);
    // Cajón 2 empieza en 18 + 722 = 740.
    const front2 = drawerPanels.find(
      (panel) => panel.id === 'panel-drawer-front-m3-2',
    );
    expect(front2?.positionMm.y).toBe(740);
    expect(front2?.sizeMm.y).toBe(718);
    // Cajón 3 termina en 1461 + 721 − 3 = 2179 (holgura
    // de 3 mm bajo el tablero superior interior).
    const front3 = drawerPanels.find(
      (panel) => panel.id === 'panel-drawer-front-m3-3',
    );
    expect(front3).toBeDefined();
    if (!front3) {
      return;
    }
    expect(front3.positionMm.y).toBe(1461);
    expect(front3.positionMm.y + front3.sizeMm.y).toBe(2179);
  });

  it('anchos: frente con holguras laterales, caja entre laterales', () => {
    // Ancho interior 776: frente 776 − 2×3 = 770;
    // caja 770 − 2×15 = 740.
    const front1 = drawerPanels.find(
      (panel) => panel.id === 'panel-drawer-front-m3-1',
    );
    expect(front1?.sizeMm.x).toBe(770);
    expect(front1?.positionMm.x).toBe(1606 + 3); // módulo 3 + holgura

    const bottom1 = drawerPanels.find(
      (panel) => panel.id === 'panel-drawer-bottom-m3-1',
    );
    expect(bottom1?.sizeMm.x).toBe(740);
    expect(bottom1?.positionMm.x).toBe(1606 + 3 + 15);

    // Laterales en los extremos de la caja.
    const sideLeft = drawerPanels.find(
      (panel) => panel.id === 'panel-drawer-side-l-m3-1',
    );
    const sideRight = drawerPanels.find(
      (panel) => panel.id === 'panel-drawer-side-r-m3-1',
    );
    expect(sideLeft?.positionMm.x).toBe(1606 + 3);
    expect(sideRight?.positionMm.x).toBe(1606 + 3 + 740);
    expect(sideLeft?.sizeMm.x).toBe(15);
    expect(sideRight?.sizeMm.x).toBe(15);
  });

  it('profundidad: caja entre frente y trasera', () => {
    // Profundidad interior 564: caja 564 − 2×15 = 534.
    const front1 = drawerPanels.find(
      (panel) => panel.id === 'panel-drawer-front-m3-1',
    );
    const bottom1 = drawerPanels.find(
      (panel) => panel.id === 'panel-drawer-bottom-m3-1',
    );
    const back1 = drawerPanels.find(
      (panel) => panel.id === 'panel-drawer-back-m3-1',
    );
    // Frente contra la cara frontal del módulo.
    expect(front1?.positionMm.z).toBe(18);
    expect(front1?.sizeMm.z).toBe(15);
    // Caja detrás del frente.
    expect(bottom1?.positionMm.z).toBe(18 + 15);
    expect(bottom1?.sizeMm.z).toBe(534);
    // Trasera contra el fondo del módulo.
    expect(back1?.positionMm.z).toBe(18 + 15 + 534);
    expect(back1?.sizeMm.z).toBe(15);
  });

  it('espesor configurable del material de cajón', () => {
    const withCustom = calculateGeometry({
      ...config,
      materials: {
        ...config.materials,
        drawer: { name: 'Nogal', thicknessMm: 18, finish: 'mate' },
      },
    });
    expect(withCustom.wardrobe.materials.drawer?.thicknessMm).toBe(18);
    const bottom1 = withCustom.panels.find(
      (panel) => panel.id === 'panel-drawer-bottom-m3-1',
    );
    // Caja: 564 − 2×18 = 528 de profundidad.
    expect(bottom1?.sizeMm.z).toBe(528);
    expect(bottom1?.sizeMm.y).toBe(18);
  });

  it('cantidad configurable de cajones', () => {
    const withFive = calculateGeometry({
      ...config,
      modules: [
        { kind: 'shelves', shelves: 3 },
        { kind: 'hanging' },
        { kind: 'drawers', drawers: 5 },
      ],
    });
    expect(withFive.drawers).toHaveLength(5);
    // 5 cajones × 5 piezas.
    expect(withFive.totals.drawerPartCount).toBe(25);
    // 2164 entre 5: residuo 4 → 433 + 433 + 433
    // + 433 + 432.
    const frontHeights = [1, 2, 3, 4, 5].map((i) => {
      const front = withFive.panels.find(
        (panel) => panel.id === `panel-drawer-front-m3-${i}`,
      );
      return front?.sizeMm.y;
    });
    expect(frontHeights).toEqual([430, 430, 430, 430, 429]);
  });

  it('compatibilidad: módulo "drawers" sin cantidad usa default 3 (contrato v1)', () => {
    // DEFAULT_CONFIG ya declara { kind: 'drawers' } sin cantidad.
    expect(module3?.drawers).toBe(3);
    expect(result.drawers).toHaveLength(3);
  });

  it('sin módulos "drawers" no hay cajones ni material de cajón', () => {
    const noDrawers = calculateGeometry({
      ...config,
      modules: [
        { kind: 'shelves', shelves: 2 },
        { kind: 'hanging' },
      ],
    });
    expect(noDrawers.drawers).toEqual([]);
    expect(noDrawers.totals.drawerCount).toBe(0);
    expect(noDrawers.totals.drawerPartCount).toBe(0);
    expect(noDrawers.wardrobe.materials.drawer).toBeUndefined();
    expect(
      noDrawers.panels.some((panel) => panel.role.startsWith('drawer-')),
    ).toBe(false);
  });

  it('las piezas de un cajón no se solapan entre sí (se tocan como máximo)', () => {
    const firstAssemblyPanels = drawerPanels.filter((panel) =>
      panel.id.endsWith('-m3-1'),
    );
    expect(firstAssemblyPanels).toHaveLength(5); // frente + 2 laterales + trasera + fondo
    for (let i = 0; i < firstAssemblyPanels.length; i++) {
      for (let j = i + 1; j < firstAssemblyPanels.length; j++) {
        expect(
          intersectionVolumeMm3(
            firstAssemblyPanels[i] as Panel,
            firstAssemblyPanels[j] as Panel,
          ),
        ).toBe(0);
      }
    }
  });

  it('los cajones no se solapan entre sí (holgura de 3 mm)', () => {
    for (let i = 0; i < result.drawers.length; i++) {
      for (let j = i + 1; j < result.drawers.length; j++) {
        const panelsI = drawerPanels.filter((panel) =>
          panel.id.endsWith(`-m3-${i + 1}`),
        );
        const panelsJ = drawerPanels.filter((panel) =>
          panel.id.endsWith(`-m3-${j + 1}`),
        );
        for (const a of panelsI) {
          for (const b of panelsJ) {
            expect(intersectionVolumeMm3(a, b)).toBe(0);
          }
        }
      }
    }
  });

  it('los cajones no se solapan con paneles estructurales ni de otros módulos', () => {
    const nonDrawerPanels = result.panels.filter(
      (panel) => !panel.role.startsWith('drawer-'),
    );
    for (const drawerPanel of drawerPanels) {
      for (const other of nonDrawerPanels) {
        expect(intersectionVolumeMm3(drawerPanel, other)).toBe(0);
      }
    }
  });

  it('integridad de referencias: los partIds apuntan a paneles reales, sin huérfanos', () => {
    const panelIds = new Set(result.panels.map((panel) => panel.id));
    const referenced = new Set<string>();
    for (const drawer of result.drawers) {
      // 5 piezas: frente, lateral izquierdo, lateral
      // derecho, trasera, fondo.
      expect(drawer.partIds).toHaveLength(5);
      for (const partId of drawer.partIds) {
        expect(panelIds.has(partId)).toBe(true);
        referenced.add(partId);
      }
    }
    // Todo panel de cajón pertenece a exactamente un ensamblaje.
    expect(referenced.size).toBe(drawerPanels.length);
  });

  it('el volumen total de tableros incluye las piezas de cajón', () => {
    const structuralVolume = result.panels
      .filter((panel) => !panel.role.startsWith('drawer-'))
      .reduce(
        (sum, panel) =>
          sum + panel.sizeMm.x * panel.sizeMm.y * panel.sizeMm.z,
        0,
      );
    const drawerVolume = drawerPanels.reduce(
      (sum, panel) =>
        sum + panel.sizeMm.x * panel.sizeMm.y * panel.sizeMm.z,
      0,
    );
    expect(result.totals.panelVolumeMm3).toBe(
      structuralVolume + drawerVolume,
    );
    expect(result.totals.panelVolumeMm3).toBeGreaterThan(
      structuralVolume,
    );
  });

  it('regresión: el módulo "drawers" no genera entrepaños', () => {
    const module3Shelves = result.panels.filter(
      (panel) => panel.moduleId === 'module-3' && panel.role === 'shelf',
    );
    expect(module3Shelves).toHaveLength(0);
  });

  it('regresión: los paneles estructurales no cambian con los cajones', () => {
    // buildPanels (estructura pura) es independiente de
    // buildDrawers: sus paneles se incluyen tal cual.
    const structural = buildPanels(result.wardrobe);
    expect(structural).toHaveLength(9);
    const structuralInResult = result.panels.filter(
      (panel) => !panel.role.startsWith('drawer-'),
    );
    expect(structuralInResult).toEqual(structural);
  });
});

describe('distributeDrawerBands', () => {
  it('reparte en bandas iguales cuando es exacto', () => {
    expect(distributeDrawerBands(300, 3)).toEqual([100, 100, 100]);
  });

  it('distribuye el residuo de abajo hacia arriba', () => {
    expect(distributeDrawerBands(100, 3)).toEqual([34, 33, 33]);
    expect(distributeDrawerBands(10, 4)).toEqual([3, 3, 2, 2]);
    expect(distributeDrawerBands(7, 2)).toEqual([4, 3]);
  });

  it('un cajón ocupa toda la altura', () => {
    expect(distributeDrawerBands(964, 1)).toEqual([964]);
  });

  it('es determinista', () => {
    expect(distributeDrawerBands(2164, 3)).toEqual(
      distributeDrawerBands(2164, 3),
    );
  });

  it('rechaza alturas o cantidades inválidas', () => {
    expect(() => distributeDrawerBands(0, 3)).toThrow(GeometryError);
    expect(() => distributeDrawerBands(100, 0)).toThrow(GeometryError);
    expect(() => distributeDrawerBands(100, 9)).toThrow(GeometryError);
    expect(() => distributeDrawerBands(100.5, 3)).toThrow(GeometryError);
  });
});

describe('validaciones de cajones', () => {
  it('rechaza cantidades fuera del rango provisional 1–8', () => {
    for (const drawers of [0, 9, -1, 2.5, '3', null]) {
      const result = validateWardrobeConfig({
        ...config,
        modules: [
          { kind: 'shelves', shelves: 3 },
          { kind: 'hanging' },
          { kind: 'drawers', drawers: drawers as number },
        ],
      });
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(
        result.errors.some(
          (error) =>
            error.code === 'ERR_INVALID_DRAWER_COUNT' &&
            error.field === 'modules[2].drawers',
        ),
      ).toBe(true);
    }
  });

  it('rechaza "drawers" en módulos que no son de cajones', () => {
    const result = validateWardrobeConfig({
      ...config,
      modules: [
        { kind: 'shelves', shelves: 3, drawers: 2 },
        { kind: 'hanging' },
        { kind: 'drawers' },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (error) =>
            error.code === 'ERR_INVALID_DRAWER_COUNT' &&
            error.field === 'modules[0].drawers',
        ),
      ).toBe(true);
    }
  });

  it('rechaza "shelves" en módulos de cajones', () => {
    const result = validateWardrobeConfig({
      ...config,
      modules: [
        { kind: 'shelves', shelves: 3 },
        { kind: 'hanging' },
        { kind: 'drawers', shelves: 2 },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (error) =>
            error.code === 'ERR_INVALID_SHELF_COUNT' &&
            error.field === 'modules[2].shelves',
        ),
      ).toBe(true);
    }
  });

  it('calculateGeometry lanza ConfigValidationError ante cantidad inválida', () => {
    const modules: ModuleConfig[] = [
      { kind: 'shelves', shelves: 3 },
      { kind: 'hanging' },
      { kind: 'drawers', drawers: 12 },
    ];
    const error = errorOf(() =>
      calculateGeometry({ ...config, modules }),
    );
    expect(error).toBeInstanceOf(GeometryError);
    expect((error as GeometryError).code).toBe('ERR_INVALID_CONFIG');
  });

  it('valida el material de cajón cuando se declara', () => {
    const result = validateWardrobeConfig({
      ...config,
      materials: {
        ...config.materials,
        drawer: { name: '', thicknessMm: 15, finish: 'mate' },
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(
        result.errors.some(
          (error) => error.field === 'materials.drawer.name',
        ),
      ).toBe(true);
    }
  });
});

describe('dimensiones imposibles (compatibilidad física)', () => {
  it('rechaza cajones que no caben en la altura del módulo', () => {
    // Alto interior 18 mm: un cajón de espesor 15 mm con
    // holgura de 3 mm no deja hueco para la caja.
    const wardrobe = tinyWardrobe({ heightMm: 54 });
    const error = errorOf(() => buildDrawers(wardrobe));
    expect(error).toBeInstanceOf(GeometryError);
    expect((error as GeometryError).code).toBe('ERR_DRAWER_DIMENSIONS');
  });

  it('rechaza cajones que no caben en el ancho del módulo', () => {
    // Ancho interior 36 mm: frente 30, caja 0.
    const wardrobe = tinyWardrobe({ widthMm: 72 });
    const error = errorOf(() => buildDrawers(wardrobe));
    expect(error).toBeInstanceOf(GeometryError);
    expect((error as GeometryError).code).toBe('ERR_DRAWER_DIMENSIONS');
  });

  it('rechaza cajones que no caben en la profundidad del módulo', () => {
    // Profundidad interior 30 mm: caja 0.
    const wardrobe = tinyWardrobe({ depthMm: 66 });
    const error = errorOf(() => buildDrawers(wardrobe));
    expect(error).toBeInstanceOf(GeometryError);
    expect((error as GeometryError).code).toBe('ERR_DRAWER_DIMENSIONS');
  });

  it('muchos cajones en altura insuficiente: la caja no cabe', () => {
    // Alto exterior 180 mm → interior 144 mm; con 8 cajones
    // la banda es de 18 mm y el cajón 15 mm: no hay hueco
    // para laterales sobre el fondo (15 ≤ 15).
    const tooSmall = tinyWardrobe({ heightMm: 180, drawerCount: 8 });
    const error = errorOf(() => buildDrawers(tooSmall));
    expect(error).toBeInstanceOf(GeometryError);
    expect((error as GeometryError).code).toBe('ERR_DRAWER_DIMENSIONS');
  });
});

describe('determinismo e inmutabilidad', () => {
  it('es determinista: dos ejecuciones producen el mismo resultado', () => {
    expect(JSON.stringify(calculateGeometry(config))).toBe(
      JSON.stringify(calculateGeometry(config)),
    );
  });

  it('no muta la configuración (congelada)', () => {
    const frozen = deepFreeze(structuredClone(config));
    expect(() => calculateGeometry(frozen)).not.toThrow();
    expect(frozen.modules[2]).toEqual({ kind: 'drawers' });
    expect(frozen.materials.drawer).toBeUndefined();
  });

  it('no muta la configuración con cajones y material (congelada)', () => {
    const modules: ModuleConfig[] = [
      { kind: 'shelves', shelves: 3 },
      { kind: 'hanging' },
      { kind: 'drawers', drawers: 4 },
    ];
    const frozen = deepFreeze(
      structuredClone({
        ...config,
        modules,
        materials: {
          ...config.materials,
          drawer: {
            name: 'Nogal',
            thicknessMm: 18,
            finish: 'brillo',
          } satisfies MaterialSpec,
        },
      }),
    );
    expect(() => calculateGeometry(frozen)).not.toThrow();
    expect(frozen.modules[2]).toEqual({
      kind: 'drawers',
      drawers: 4,
    });
    expect(frozen.materials.drawer?.thicknessMm).toBe(18);
  });
});
