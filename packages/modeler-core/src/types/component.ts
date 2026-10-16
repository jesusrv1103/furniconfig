/**
 * Contrato mínimo del registro de componentes paramétricos (FASE-4B-A).
 *
 * Solo cubre lo que la **validación** del documento necesita conocer:
 * identidad (`version`) y esquema de parámetros. La definición completa con
 * `build()` (regeneración de geometría) llega en la Fase 4B-D
 * (`PROPOSED_ARCHITECTURE.md` §3.9) y se apoyará en este contrato sin
 * romperlo.
 */

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
