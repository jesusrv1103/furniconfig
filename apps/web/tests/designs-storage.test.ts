import { describe, expect, it } from 'vitest';
import { calculateGeometry } from '@furniconfig/geometry-core';
import { DesignStorageError } from '../src/lib/designs/errors.js';
import {
  createLocalStorageDesignStorage,
  DESIGNS_STORAGE_KEY,
  SESSION_STORAGE_KEY,
} from '../src/lib/designs/local-storage.js';
import {
  DESIGN_SESSION_VERSION,
  DESIGN_STORAGE_VERSION,
  type DesignRecord,
} from '../src/lib/designs/types.js';
import { DEFAULT_CONFIG, setModuleWidth } from '../src/lib/config.js';
import { MemoryStorage, quotaError } from './helpers/memory-storage.js';

function makeRecord(overrides: Partial<DesignRecord> = {}): DesignRecord {
  return {
    id: 'design-1',
    name: 'Clóset prueba',
    createdAt: '2026-01-01T10:00:00.000Z',
    updatedAt: '2026-01-01T10:00:00.000Z',
    storageVersion: DESIGN_STORAGE_VERSION,
    config: DEFAULT_CONFIG,
    ...overrides,
  };
}

describe('adaptador local de diseños (localStorage)', () => {
  it('persiste y recupera un diseño (put → get → list → remove)', async () => {
    const memory = new MemoryStorage();
    const storage = createLocalStorageDesignStorage(memory);

    await storage.put(makeRecord());
    const loaded = await storage.get('design-1');
    expect(loaded).toEqual(makeRecord());

    const list = await storage.list();
    expect(list).toEqual([
      {
        id: 'design-1',
        name: 'Clóset prueba',
        createdAt: '2026-01-01T10:00:00.000Z',
        updatedAt: '2026-01-01T10:00:00.000Z',
      },
    ]);

    await storage.remove('design-1');
    expect(await storage.get('design-1')).toBeNull();
    expect(await storage.list()).toEqual([]);
  });

  it('la sesión se serializa y recupera completa', async () => {
    const memory = new MemoryStorage();
    const storage = createLocalStorageDesignStorage(memory);
    expect(await storage.load()).toBeNull();

    const session = {
      storageVersion: DESIGN_SESSION_VERSION,
      config: DEFAULT_CONFIG,
      activeId: 'design-1',
      dirty: true,
    };
    await storage.save(session);
    expect(await storage.load()).toEqual(session);
  });

  it('rechaza configuraciones inválidas y no escribe nada', async () => {
    const memory = new MemoryStorage();
    const storage = createLocalStorageDesignStorage(memory);
    const invalid = makeRecord({
      config: {
        ...DEFAULT_CONFIG,
        dimensions: { widthMm: -5, heightMm: 2200, depthMm: 600 },
      },
    });

    await expect(storage.put(invalid)).rejects.toMatchObject({
      code: 'invalid-data',
    });
    expect(memory.raw(DESIGNS_STORAGE_KEY)).toBeNull();
    expect(await storage.list()).toEqual([]);
  });

  it('trata una versión de sobre desconocida como incompatible sin pisar datos', async () => {
    const memory = new MemoryStorage();
    const storage = createLocalStorageDesignStorage(memory);
    const seeded = JSON.stringify({
      storageVersion: 999,
      designs: [makeRecord()],
    });
    memory.seed(DESIGNS_STORAGE_KEY, seeded);

    await expect(storage.list()).rejects.toMatchObject({
      code: 'incompatible-version',
    });
    await expect(storage.put(makeRecord({ id: 'design-2' }))).rejects.toMatchObject(
      { code: 'incompatible-version' },
    );

    // El dato antiguo queda intacto (sin migración silenciosa).
    expect(memory.raw(DESIGNS_STORAGE_KEY)).toBe(seeded);
  });

  it('un JSON corrupto bloquea lecturas y escrituras sin destruir el original', async () => {
    const memory = new MemoryStorage();
    const storage = createLocalStorageDesignStorage(memory);
    memory.seed(DESIGNS_STORAGE_KEY, '{esto no es json');

    await expect(storage.list()).rejects.toMatchObject({ code: 'invalid-data' });
    await expect(storage.put(makeRecord())).rejects.toMatchObject({
      code: 'invalid-data',
    });
    expect(memory.raw(DESIGNS_STORAGE_KEY)).toBe('{esto no es json');
  });

  it('los registros corruptos se cuarentenan: no se muestran ni se eliminan', async () => {
    const memory = new MemoryStorage();
    const storage = createLocalStorageDesignStorage(memory);
    const valid = makeRecord();
    const garbage = { id: 'design-9', name: 'roto' };
    memory.seed(
      DESIGNS_STORAGE_KEY,
      JSON.stringify({ storageVersion: DESIGN_STORAGE_VERSION, designs: [valid, garbage] }),
    );

    const list = await storage.list();
    expect(list.map((design) => design.id)).toEqual(['design-1']);

    await storage.put(makeRecord({ id: 'design-2', name: 'Otro' }));
    const stored = JSON.parse(memory.raw(DESIGNS_STORAGE_KEY) ?? 'null') as {
      designs: unknown[];
    };
    expect(stored.designs).toHaveLength(3);
    expect(stored.designs[1]).toEqual(garbage); // basura preservada
  });

  it('una sesión inválida o de otra versión se rechaza', async () => {
    const memory = new MemoryStorage();
    const storage = createLocalStorageDesignStorage(memory);

    memory.seed(SESSION_STORAGE_KEY, '[]');
    await expect(storage.load()).rejects.toMatchObject({ code: 'invalid-data' });

    memory.seed(
      SESSION_STORAGE_KEY,
      JSON.stringify({
        storageVersion: 999,
        config: DEFAULT_CONFIG,
        activeId: null,
        dirty: false,
      }),
    );
    await expect(storage.load()).rejects.toMatchObject({
      code: 'incompatible-version',
    });
  });

  it('mapea la cuota llena a storage-full y conserva los datos previos', async () => {
    const memory = new MemoryStorage();
    const storage = createLocalStorageDesignStorage(memory);
    await storage.put(makeRecord());

    memory.failWritesWith = quotaError();
    await expect(storage.put(makeRecord({ id: 'design-2' }))).rejects.toMatchObject({
      code: 'storage-full',
    });
    await expect(
      storage.save({
        storageVersion: DESIGN_SESSION_VERSION,
        config: DEFAULT_CONFIG,
        activeId: null,
        dirty: false,
      }),
    ).rejects.toMatchObject({ code: 'storage-full' });

    memory.failWritesWith = null;
    expect(await storage.list()).toHaveLength(1); // nada se perdió
  });

  it('un almacenamiento bloqueado responde storage-unavailable', async () => {
    const blocked = {
      getItem() {
        throw new Error('SecurityError');
      },
      setItem() {
        throw new Error('SecurityError');
      },
      removeItem() {
        throw new Error('SecurityError');
      },
    };
    const storage = createLocalStorageDesignStorage(blocked);
    await expect(storage.list()).rejects.toBeInstanceOf(DesignStorageError);
    await expect(storage.list()).rejects.toMatchObject({
      code: 'storage-unavailable',
    });
    await expect(storage.put(makeRecord())).rejects.toMatchObject({
      code: 'storage-unavailable',
    });
  });
});

describe('persistencia de anchos individuales (Fase 3D)', () => {
  it('un diseño con anchos fijados guarda y recupera la distribución', async () => {
    const memory = new MemoryStorage();
    const storage = createLocalStorageDesignStorage(memory);
    const config = setModuleWidth(DEFAULT_CONFIG, 0, 900);
    await storage.put(makeRecord({ config }));

    const loaded = await storage.get('design-1');
    expect(loaded?.config.modules[0]?.widthMm).toBe(900);
    expect(calculateGeometry(loaded?.config ?? config).wardrobe.modules.map(
      (module) => module.widthMm,
    )).toEqual([900, 714, 714]);
  });

  it('la sesión de editor conserva los anchos fijados', async () => {
    const memory = new MemoryStorage();
    const storage = createLocalStorageDesignStorage(memory);
    const config = setModuleWidth(DEFAULT_CONFIG, 1, 600);
    await storage.save({
      storageVersion: DESIGN_SESSION_VERSION,
      config,
      activeId: null,
      dirty: false,
    });

    const session = await storage.load();
    expect(session?.config.modules[1]?.widthMm).toBe(600);
  });

  it('un diseño antiguo (sin anchos) sigue abriendo con reparto uniforme', async () => {
    const memory = new MemoryStorage();
    const storage = createLocalStorageDesignStorage(memory);
    // JSON tal y como lo escribían las fases anteriores
    // (sin `widthMm` en los módulos).
    memory.seed(
      DESIGNS_STORAGE_KEY,
      JSON.stringify({
        storageVersion: DESIGN_STORAGE_VERSION,
        designs: [makeRecord()],
      }),
    );

    const loaded = await storage.get('design-1');
    expect(loaded?.config.modules).toEqual(DEFAULT_CONFIG.modules);
    expect(calculateGeometry(loaded?.config ?? DEFAULT_CONFIG).wardrobe.modules.map(
      (module) => module.widthMm,
    )).toEqual([776, 776, 776]);
  });
});
