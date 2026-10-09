import { describe, expect, it } from 'vitest';
import type { WardrobeConfig } from '@furniconfig/geometry-core';
import { DesignLibrary } from '../src/lib/designs/library.js';
import {
  DESIGN_STORAGE_VERSION,
  type DesignRecord,
} from '../src/lib/designs/types.js';
import { parseDesignExport } from '../src/lib/designs/transfer.js';
import {
  DEFAULT_CONFIG,
  setBackPanelEnabled,
  setBackPanelThickness,
  setDimension,
  setDoorLeaves,
  setDoorsEnabled,
  setHangingRodDiameter,
  setMaterialName,
  setModuleCount,
  setModuleDrawers,
} from '../src/lib/config.js';
import { createLocalStorageDesignStorage } from '../src/lib/designs/local-storage.js';
import { MemoryStorage } from './helpers/memory-storage.js';

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const key of Object.keys(value)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/** Reloj determinista: avanza 1 minuto por consulta. */
function makeClock(): () => Date {
  let step = 0;
  const base = Date.UTC(2026, 0, 1, 10, 0, 0);
  return () => new Date(base + step++ * 60_000);
}

function makeLibrary() {
  const memory = new MemoryStorage();
  const storage = createLocalStorageDesignStorage(memory);
  const library = new DesignLibrary({ repository: storage, now: makeClock() });
  return { memory, storage, library };
}

/** Configuración rica: todas las familias de la Fase 2C. */
function richConfig(): WardrobeConfig {
  let config = setDimension(DEFAULT_CONFIG, 'widthMm', 2800);
  config = setDimension(config, 'depthMm', 550);
  config = setModuleCount(config, 4);
  config = setModuleDrawers(config, 2, 5);
  config = setMaterialName(config, 'structure', 'Nogal');
  config = setHangingRodDiameter(config, 35);
  config = setDoorsEnabled(config, true);
  config = setDoorLeaves(config, 2);
  config = setBackPanelEnabled(config, true);
  config = setBackPanelThickness(config, 18);
  return config;
}

describe('DesignLibrary — operaciones CRUD', () => {
  it('crea un diseño con id determinista, nombre y fechas', async () => {
    const { library } = makeLibrary();
    const record = await library.create('  Clóset salón  ', DEFAULT_CONFIG);

    expect(record.id).toBe('design-1');
    expect(record.name).toBe('Clóset salón');
    expect(record.storageVersion).toBe(DESIGN_STORAGE_VERSION);
    expect(record.createdAt).toBe(record.updatedAt);

    const list = await library.list();
    expect(list).toHaveLength(1);
    expect(list[0]?.name).toBe('Clóset salón');
  });

  it('rechaza nombres vacíos y configuraciones inválidas sin escribir', async () => {
    const { library } = makeLibrary();

    await expect(library.create('   ', DEFAULT_CONFIG)).rejects.toMatchObject({
      code: 'invalid-name',
    });
    await expect(
      library.create('x'.repeat(121), DEFAULT_CONFIG),
    ).rejects.toMatchObject({ code: 'invalid-name' });

    const invalid = {
      ...DEFAULT_CONFIG,
      dimensions: { widthMm: 10, heightMm: 2200, depthMm: 600 },
    };
    await expect(library.create('Inválido', invalid)).rejects.toMatchObject({
      code: 'invalid-data',
    });
    expect(await library.list()).toEqual([]);
  });

  it('guarda cambios con updatedAt nuevo y falla si el diseño no existe', async () => {
    const { library } = makeLibrary();
    const created = await library.create('Uno', DEFAULT_CONFIG);

    const changed = setDimension(created.config, 'widthMm', 3000);
    const saved = await library.saveActive(created.id, changed);
    expect(saved.config.dimensions.widthMm).toBe(3000);
    expect(saved.updatedAt > created.updatedAt).toBe(true);

    await expect(
      library.saveActive('design-99', DEFAULT_CONFIG),
    ).rejects.toMatchObject({ code: 'not-found' });
  });

  it('renombra un diseño y valida el nuevo nombre', async () => {
    const { library } = makeLibrary();
    await library.create('Original', DEFAULT_CONFIG);

    const renamed = await library.rename('design-1', '  Nuevo nombre ');
    expect(renamed.name).toBe('Nuevo nombre');
    expect((await library.get('design-1'))?.name).toBe('Nuevo nombre');

    await expect(library.rename('design-1', '')).rejects.toMatchObject({
      code: 'invalid-name',
    });
    await expect(library.rename('design-404', 'X')).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('duplica con identidad propia y copias independientes', async () => {
    const { library } = makeLibrary();
    const original = await library.create('Base', richConfig());
    const copy = await library.duplicate('design-1');

    expect(copy.id).toBe('design-2');
    expect(copy.name).toBe('Base (copia)');
    expect(copy.config).toEqual(original.config);
    expect(copy.config).not.toBe(original.config);

    // Mutar la copia en memoria no toca el original persistido.
    copy.config.dimensions.widthMm = 9999;
    const again = await library.get('design-1');
    expect(again?.config.dimensions.widthMm).toBe(2800);
  });

  it('eliminar es idempotente', async () => {
    const { library } = makeLibrary();
    await library.create('Borra me', DEFAULT_CONFIG);
    await library.remove('design-1');
    await library.remove('design-1'); // segundo intento: sin error
    expect(await library.get('design-1')).toBeNull();
    expect(await library.list()).toEqual([]);
  });

  it('los ids no se reutilizan tras eliminar', async () => {
    const { library } = makeLibrary();
    await library.create('A', DEFAULT_CONFIG);
    await library.create('B', DEFAULT_CONFIG);
    await library.remove('design-1');
    const next = await library.create('C', DEFAULT_CONFIG);
    expect(next.id).toBe('design-3');
  });

  it('lista ordenado por fecha de actualización descendente', async () => {
    const { library } = makeLibrary();
    await library.create('Primero', DEFAULT_CONFIG);
    await library.create('Segundo', DEFAULT_CONFIG);
    const list = await library.list();
    expect(list.map((design) => design.name)).toEqual(['Segundo', 'Primero']);
  });
});

describe('DesignLibrary — exportar e importar JSON', () => {
  it('exporta un envelope versionado y el import devuelve un id nuevo', async () => {
    const { library } = makeLibrary();
    await library.create('Exportable', richConfig());

    const json = await library.exportJson('design-1');
    const envelope = JSON.parse(json) as {
      format: string;
      storageVersion: number;
      design: DesignRecord;
    };
    expect(envelope.format).toBe('furniconfig-design');
    expect(envelope.storageVersion).toBe(DESIGN_STORAGE_VERSION);

    const imported = await library.importJson(json);
    expect(imported.id).toBe('design-2'); // nunca reutiliza el id original
    expect(imported.name).toBe('Exportable');
    expect(imported.config).toEqual(envelope.design.config);

    // Importar dos veces crea dos registros: jamás sobrescribe.
    const again = await library.importJson(json);
    expect(again.id).toBe('design-3');
    expect(await library.list()).toHaveLength(3);
  });

  it('rechaza JSON roto, formato desconocido y versiones incompatibles', async () => {
    const { library } = makeLibrary();

    await expect(library.importJson('no es json {')).rejects.toMatchObject({
      code: 'invalid-data',
    });
    await expect(
      library.importJson(JSON.stringify({ foo: 1 })),
    ).rejects.toMatchObject({ code: 'invalid-data' });
    await expect(
      library.importJson(
        JSON.stringify({ format: 'otro-formato', storageVersion: 1, design: {} }),
      ),
    ).rejects.toMatchObject({ code: 'invalid-data' });
    await expect(
      library.importJson(
        JSON.stringify({
          format: 'furniconfig-design',
          storageVersion: 999,
          design: {},
        }),
      ),
    ).rejects.toMatchObject({ code: 'incompatible-version' });
    expect(await library.list()).toEqual([]);
  });

  it('un archivo con configuración inválida no altera la colección', async () => {
    const { library, memory } = makeLibrary();
    await library.create('Existente', DEFAULT_CONFIG);
    const before = memory.raw('furniconfig.designs');

    const hostile = JSON.stringify({
      format: 'furniconfig-design',
      storageVersion: DESIGN_STORAGE_VERSION,
      design: {
        id: 'design-1',
        name: 'Malicioso',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        storageVersion: DESIGN_STORAGE_VERSION,
        config: { ...DEFAULT_CONFIG, modules: 'no-array' },
      },
    });
    await expect(library.importJson(hostile)).rejects.toMatchObject({
      code: 'invalid-data',
    });

    expect(memory.raw('furniconfig.designs')).toBe(before);
    expect((await library.get('design-1'))?.name).toBe('Existente');
  });

  it('parseDesignExport valida también en el camino puro', async () => {
    const { library } = makeLibrary();
    await library.create('Vuelta', DEFAULT_CONFIG);
    const json = await library.exportJson('design-1');
    const record = parseDesignExport(json);
    expect(record.id).toBe('design-1');
    expect(record.config).toEqual(DEFAULT_CONFIG);
  });
});

describe('DesignLibrary — integridad y compatibilidad', () => {
  it('no muta configuraciones congeladas (deep freeze)', async () => {
    const { library } = makeLibrary();
    const frozen = deepFreeze(structuredClone(richConfig()));
    const before = JSON.stringify(frozen);

    const record = await library.create('Congelado', frozen);
    await library.saveActive(record.id, frozen);
    await library.duplicate(record.id);
    await library.exportJson(record.id);

    expect(JSON.stringify(frozen)).toBe(before);
  });

  it('conserva dimensiones, módulos, materiales, cajones, barras, puertas y panel trasero', async () => {
    const { library } = makeLibrary();
    const rich = richConfig();

    const created = await library.create('Completo', rich);
    const loaded = await library.get(created.id);
    expect(loaded?.config).toEqual(rich);

    // Vuelta completa: exportar → importar → recuperar.
    const json = await library.exportJson(created.id);
    const imported = await library.importJson(json);
    const roundTrip = await library.get(imported.id);
    expect(roundTrip?.config).toEqual(rich);
    expect(roundTrip?.config.dimensions).toEqual({
      widthMm: 2800,
      heightMm: 2200,
      depthMm: 550,
    });
    expect(roundTrip?.config.modules).toHaveLength(4);
    expect(roundTrip?.config.modules[2]).toEqual({ kind: 'drawers', drawers: 5 });
    expect(roundTrip?.config.materials.structure.name).toBe('Nogal');
    expect(roundTrip?.config.doors).toEqual({ leaves: 2 });
    expect(roundTrip?.config.backPanel).toEqual({ enabled: true, thicknessMm: 18 });
    expect(roundTrip?.config.hangingRod?.diameterMm).toBe(35);
  });

  it('las configuraciones de fases anteriores (2C) siguen siendo válidas', async () => {
    const { library } = makeLibrary();
    // Configuración estilo Fase 2C sin tocar nada nuevo.
    let legacy = setDoorsEnabled(DEFAULT_CONFIG, true);
    legacy = setDoorLeaves(legacy, 1);
    legacy = setBackPanelEnabled(legacy, true);

    const record = await library.create('Fase 2C', legacy);
    expect((await library.get(record.id))?.config).toEqual(legacy);
  });
});
