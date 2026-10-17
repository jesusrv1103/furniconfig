/**
 * Contrato mínimo del registro de componentes paramétricos (FASE-4B-A).
 *
 * Solo cubre lo que la **validación** del documento necesita conocer:
 * identidad (`version`) y esquema de parámetros. La definición completa con
 * `build()` (regeneración de geometría) llegó en la Fase 4B-D
 * (`PROPOSED_ARCHITECTURE.md` §3.9) y se apoya en este contrato sin
 * romperlo (FASE-4B-D).
 */

import type { MmPoint3 } from './document.js';

/** Esquema de un parámetro escalar declarado por un componente. */
export interface ComponentParamSpec {
  readonly kind: 'number' | 'string' | 'boolean';
  /** Cota inferior (solo `kind: 'number'`). PROVISIONAL salvo confirmación. */
  readonly min?: number;
  /** Cota superior (solo `kind: 'number'`). PROVISIONAL salvo confirmación. */
  readonly max?: number;
}

/**
 * Identidad mínima de un componente registrado: `type` (clave del registro),
 * `version` del `ParametricComponentDef` y, opcionalmente, el esquema de
 * parámetros escalares declarados.
 *
 * Los parámetros **no declarados** en el esquema se validan solo como JSON
 * serializable (esto deja la puerta abierta a parámetros anidados como un
 * `WardrobeConfig` completo, cuyo rango lo valida `geometry-core`).
 */
export interface ComponentDefRef {
  readonly version: number;
  readonly paramsSchema?: Readonly<Record<string, ComponentParamSpec>>;
}

/** Registro de componentes: `type` → definición mínima. */
export type ComponentRegistry = Readonly<Record<string, ComponentDefRef>>;

// ---------------------------------------------------------------------------
// FASE-4B-D: definición completa con `build()` (regeneración de geometría)
// ---------------------------------------------------------------------------

/**
 * Pieza geométrica derivada de un componente (FASE-4B-D).
 *
 * El repertorio es **caja ortogonal y cilindro paramétrico** — exactamente
 * lo que `geometry-core` emite para el clóset (`Panel`, `Door` = cajas;
 * `HangingRod`, `DoorHandle` = cilindros) y lo que el renderer convierte a
 * malla (`panels-to-mesh.ts`). Los cilindros **no** se simplifican a cajas:
 * `kind: 'cylinder'` conserva eje, longitud y diámetro exactos (decisión de
 * FASE-4B-D: no perder información geométrica en la representación de escena).
 *
 * Medidas: `positionMm` es la esquina mínima del bbox de la pieza en el
 * **marco local** del componente (I2) y todos los valores son números
 * finitos en mm. Se admite el medio milímetro que el motor de clósets
 * emite legítimamente al centrar barras (p. ej. `z: 277.5` en un fondo de
 * 600 mm): **preservar el valor exacto** del motor prima sobre redondear,
 * porque una aproximación rompería la equivalencia geométrica exigida por
 * FASE-4B-D. La invariante I1 (mm enteros) sigue vigente para el
 * **documento persistente** (`SceneDocument`): `ComponentPart` es geometría
 * derivada y transitoria, jamás se almacena en el documento.
 */
export type ComponentPart =
  | {
      readonly kind: 'box';
      /** Id local estable del def (p. ej. `panel-shelf-m2-1`). */
      readonly partId: string;
      /** Rol legible (p. ej. `shelf`, `door`, `side`). */
      readonly role: string;
      readonly sizeMm: MmPoint3;
      readonly positionMm: MmPoint3;
      /** Material preferente de la pieza; si se omite, el de la instancia. */
      readonly materialId?: string;
      /** Módulo dueño de la pieza (`module-N`), para agrupación/interacción. */
      readonly moduleId?: string;
      /**
       * Solo piezas de cajón (`drawer-*`): ensamblaje dueño
       * (`drawer-module-{m}-{i}`) y su índice (1-based) — conserva la
       * agrupación cajón ↔ paneles que solo existe en la salida del motor.
       */
      readonly assemblyId?: string;
      readonly assemblyIndex?: number;
      /**
       * Solo puertas (`role: 'door'`): datos de bisagra necesarios para
       * recalcular `doorOpeningTransform(door, angle)` (animación futura)
       * sin volver al motor.
       */
      readonly hingeSide?: 'left' | 'right';
      readonly leafIndex?: number;
      readonly leafCount?: 1 | 2;
    }
  | {
      readonly kind: 'cylinder';
      readonly partId: string;
      readonly role: string;
      readonly axis: 'x' | 'y' | 'z';
      readonly lengthMm: number;
      readonly diameterMm: number;
      readonly positionMm: MmPoint3;
      readonly materialId?: string;
      /** Módulo dueño de la pieza (`module-N`), para agrupación/interacción. */
      readonly moduleId?: string;
      /** Solo tiradores (`role: 'door-handle'`): hoja dueña (`door-*`). */
      readonly doorId?: string;
    };

/** Resultado de `build()`: la geometría derivada de un conjunto de params. */
export interface ComponentBuild {
  readonly parts: readonly ComponentPart[];
}

/**
 * Definición completa de un componente paramétrico (FASE-4B-D; bosquejo en
 * `PROPOSED_ARCHITECTURE.md` §3.9). Extiende la identidad mínima
 * `ComponentDefRef`, de modo que un registro de definiciones completas es
 * **asignable estructuralmente** a `ComponentRegistry` y la validación del
 * documento existente funciona sin cambios (compatibilidad hacia atrás).
 *
 * `build` debe ser **puro y determinista** (misma params → mismas piezas,
 * mismo orden) y no puede lanzar sobre params ya validados: la frontera
 * `buildComponent` valida params y envuelve cualquier fallo.
 */
export interface ParametricComponentDef extends ComponentDefRef {
  readonly type: string;
  build(params: Readonly<Record<string, unknown>>): ComponentBuild;
}

/**
 * Registro de definiciones completas: `type` → `ParametricComponentDef`.
 *
 * Un solo `version` por `type` (la validación del documento compara
 * igualdad exacta de versión; ver `validateComponent`).
 */
export type ParametricComponentRegistry = Readonly<
  Record<string, ParametricComponentDef>
>;
