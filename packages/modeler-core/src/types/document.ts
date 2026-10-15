/**
 * Contratos del Scene Document v1 (FASE-4B-A).
 *
 * Fuente de verdad: `docs/architecture/furniconfig-4/SCENE_DOCUMENT.md`.
 * Invariantes del paquete (§2 del mismo documento):
 *
 * - I1: unidad interna **mm enteros** en todo el documento.
 * - I2: origen en la esquina inferior-izquierda-frontal; las posiciones son
 *   la esquina mínima del objeto.
 * - I3: el documento es **inmutable**: toda edición produce una nueva
 *   instancia (el validador congela la salida).
 * - I4: IDs **deterministas** (sin UUID).
 *
 * Delta registrado frente a `PROPOSED_ARCHITECTURE.md` §3.1: `params` de un
 * `ComponentInstance` admite valores anidados (`SceneParamValue`), no solo
 * escalares. Motivo: el puente con el clóset (`SCENE_DOCUMENT.md` §6–§7)
 * almacena un `WardrobeConfig` **completo y sin cambios** en `params`, que es
 * una estructura anidada (dimensiones, módulos, materiales).
 */

/** Punto 2D en milímetros enteros. */
export type MmPoint2 = readonly [number, number];

/** Punto 3D en milímetros enteros (X = ancho, Y = alto, Z = profundidad). */
export type MmPoint3 = readonly [number, number, number];

/** Versión del contrato del documento. Cambios de forma → bump. */
export const SCENE_DOCUMENT_VERSION = 1;

/** Planos de trabajo canónicos del MVP (repertorio de `camera-views.ts`). */
export type SketchPlane = 'ground' | 'front' | 'side' | 'custom';

/**
 * Transformación de un objeto.
 *
 * El MVP solo traslada (mm enteros; la rotación de objetos queda fuera del
 * alcance aprobado, `PROPOSED_ARCHITECTURE.md` §3.6). Si en el futuro se
 * añade rotación/escala, se hará como campos **opcionales** con su propia
 * validación, sin romper los documentos v1 existentes.
 */
export interface Transform3 {
  /** Traslación en mm enteros; la esquina mínima del objeto = esta posición. */
  readonly positionMm: MmPoint3;
}

/**
 * Croquis 2D cerrado sobre un plano de trabajo.
 *
 * Restricción MVP (`SCENE_DOCUMENT.md` §3.3): polígonos **cerrados y
 * simples**; el validador garantiza ≥3 vértices, `closed: true` y área
 * distinta de cero. La detección de auto-intersecciones no triviales vive en
 * la frontera del kernel (`kernel-adapter`, `assertSimplePolygon`) para no
 * duplicar un coste O(n²) en dos capas (RISKS R-18).
 */
export interface Sketch2D {
  readonly plane: SketchPlane;
  /** Origen del plano de trabajo, en mm enteros del documento. */
  readonly planeOriginMm: MmPoint3;
  /** Vértices en mm enteros, ordenados y sin repetir el primero al final. */
  readonly pointsMm: readonly MmPoint2[];
  /** En el MVP un croquis almacenado siempre es cerrado. */
  readonly closed: boolean;
}

/**
 * Referencia de geometría de un sólido.
 *
 * Fuente de verdad = parámetros: la malla es derivada y regenerable
 * (`SCENE_DOCUMENT.md` §3.2). La variante `kernel` es una clave de caché
 * descartable (si se pierde, se recalcula).
 */
export type SceneGeometryRef =
  | {
      readonly source: 'sketch';
      readonly sketch: Sketch2D;
      readonly extrusionMm: number;
    }
  | { readonly source: 'kernel'; readonly key: string };

/**
 * Material del documento, con id determinista (p. ej. `material-1`).
 *
 * Nota: a diferencia de `BoardThicknessMm` de `geometry-core` (restringido a
 * [15, 18] para tableros de clóset), aquí el espesor es un entero positivo
 * sin catálogo: los materiales de escena son genéricos y este paquete no
 * depende de `geometry-core`. Los espesores de tablero del clóset se
 * validan en su propio motor cuando el componente delega.
 */
export interface SceneMaterial {
  readonly id: string;
  readonly name: string;
  readonly finish: string;
  readonly thicknessMm: number;
}

/**
 * Valor de parámetro de componente: JSON serializable (número finito,
 * cadena, booleano, listas y objetos anidados). Sin `null`, `undefined`,
 * funciones ni otros tipos no serializables.
 */
export type SceneParamValue =
  | number
  | string
  | boolean
  | readonly SceneParamValue[]
  | { readonly [key: string]: SceneParamValue };

/** Parámetros de un componente paramétrico. */
export type SceneParams = Readonly<Record<string, SceneParamValue>>;

/** Sólido de modelado libre: croquis + extrusión (o caché de kernel). */
export interface SolidObject {
  readonly id: string;
  readonly kind: 'solid';
  readonly name: string;
  readonly transform: Transform3;
  readonly geometry: SceneGeometryRef;
  readonly materialId: string;
}

/**
 * Instancia de componente paramétrico (incluye el clóset).
 *
 * NO lleva `geometry`: su geometría se **regenera** a partir de `params`
 * (paso 10 del MVP). `version` es la versión del `ParametricComponentDef`
 * registrado.
 */
export interface ComponentInstance {
  readonly id: string;
  readonly kind: 'component';
  readonly name: string;
  readonly type: string;
  readonly version: number;
  readonly transform: Transform3;
  readonly materialId: string;
  readonly params?: SceneParams;
}

/** Un objeto de la escena: sólido libre o componente paramétrico. */
export type SceneObject = SolidObject | ComponentInstance;

/**
 * Documento de escena v1: fuente única de verdad del modelador, inmutable y
 * serializable; la escena 3D se **deriva** de él.
 */
export interface SceneDocument {
  readonly documentVersion: typeof SCENE_DOCUMENT_VERSION;
  /** Id determinista, p. ej. `scene-1`. */
  readonly id: string;
  readonly name: string;
  /** Paso de rejilla base en mm enteros (p. ej. 10). */
  readonly gridStepMm: number;
  /** Origen del documento en mm enteros; por defecto `[0, 0, 0]`. */
  readonly originMm: MmPoint3;
  readonly objects: readonly SceneObject[];
  readonly materials: readonly SceneMaterial[];
}
