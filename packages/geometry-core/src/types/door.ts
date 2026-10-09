/**
 * Puertas abatibles y tiradores (Fase 2C).
 *
 * Una puerta es una hoja rectangular montada
 * SOBRE el frente del mueble (montaje
 * PROVISIONAL: ocupa z ∈ [-espesor, 0], por
 * delante del plano frontal del cuerpo; la
 * geometría interior no se altera).
 *
 * El motor genera las puertas CERRADAS. La
 * apertura es una transformación pura
 * (`doorOpeningTransform`) alrededor del eje
 * de bisagra que no altera los datos
 * geométricos originales: la presentación
 * aplica la rotación.
 *
 * Reglas PROVISIONALES (docs/product-rules.md
 * §3, pendientes de validar con carpintería):
 * - 1 o 2 hojas por módulo.
 * - Holguras de 3 mm entre hojas y bordes.
 * - Con 2 hojas, las bisagras van en los
 *   extremos exteriores (apertura simétrica
 *   hacia afuera).
 * - Tirador: cilindro horizontal, 40% del
 *   ancho de hoja (40–120 mm), diámetro 18 mm,
 *   a 30 mm del borde libre, contra la cara
 *   frontal de la puerta.
 */

/** Lado de la bisagra de una hoja. */
export type DoorHingeSide = 'left' | 'right';

/** Cantidad de hojas por módulo. */
export type DoorLeafCount = 1 | 2;

/** Cantidad de hojas por defecto (PROVISIONAL). */
export const DEFAULT_DOOR_LEAVES: DoorLeafCount = 1;

/** Lado de bisagra por defecto (PROVISIONAL). */
export const DEFAULT_HINGE_SIDE: DoorHingeSide = 'left';

/** Holgura de puertas por defecto, mm (PROVISIONAL). */
export const DEFAULT_DOOR_CLEARANCE_MM = 3;

/** Ángulo máximo de apertura, grados (PROVISIONAL). */
export const MAX_DOOR_OPEN_ANGLE_DEG = 110;

/** Diámetro del tirador, mm (PROVISIONAL). */
export const DEFAULT_HANDLE_DIAMETER_MM = 18;

/** Nombre del material del tirador (PROVISIONAL). */
export const DEFAULT_HANDLE_NAME = 'Acero';

/** Acabado del material del tirador (PROVISIONAL). */
export const DEFAULT_HANDLE_FINISH = 'brillo';

/** Puerta abatible (una hoja), en posición CERRADA. */
export interface Door {
  /** Identificador estable: `door-module-{m}-{i}`. */
  id: string;
  /** Módulo al que pertenece. */
  moduleId: string;
  /** Orden de la hoja dentro del módulo (1-based). */
  leafIndex: number;
  /** Cantidad de hojas del módulo (1 o 2). */
  leafCount: DoorLeafCount;
  /** Ancho de la hoja (mm). */
  widthMm: number;
  /** Alto de la hoja (mm). */
  heightMm: number;
  /** Espesor de la hoja (mm). */
  thicknessMm: number;
  /**
   * Posición (esquina mínima, mm) con la puerta
   * CERRADA: x e y dentro de la abertura del
   * módulo; z en [-thicknessMm, 0] (montaje
   * sobre el frente).
   */
  positionMm: { x: number; y: number; z: number };
  /** Material de la hoja. */
  materialId: string;
  /** Lado de la bisagra (eje de apertura). */
  hingeSide: DoorHingeSide;
}

/** Tirador geométrico sencillo (cilindro horizontal). */
export interface DoorHandle {
  /** Identificador estable: `handle-door-module-{m}-{i}`. */
  id: string;
  /** Puerta a la que pertenece. */
  doorId: string;
  /** Módulo al que pertenece. */
  moduleId: string;
  /** Eje del cilindro (horizontal, a lo ancho). */
  axis: 'x';
  /** Longitud del tirador (mm). */
  lengthMm: number;
  /** Diámetro del tirador (mm). */
  diameterMm: number;
  /** Posición (esquina mínima del bbox, mm), cerrado. */
  positionMm: { x: number; y: number; z: number };
  /** Material del tirador (metálico). */
  materialId: string;
}

/**
 * Transformación de apertura de una puerta:
 * datos para rotar la hoja alrededor de su
 * eje de bisagra SIN alterar la geometría
 * original (la presentación aplica la
 * rotación sobre estos datos).
 *
 * El eje es vertical, en el borde de la
 * bisagra y en el plano MEDIO del espesor
 * de la hoja (no en el plano frontal: con
 * el eje en z = 0 las hojas de módulos
 * adyacentes se cortaban desde ~44°,
 * verificado con pruebas SAT sobre las
 * huellas rotadas).
 */
export interface DoorOpeningTransform {
  /** Posición del eje de bisagra (mm; eje vertical). */
  hingeXmm: number;
  /** Profundidad del eje (mm; plano medio del espesor). */
  hingeZmm: number;
  /** Desplazamiento del centro de la hoja respecto del eje (mm). */
  centerOffsetMm: { x: number; z: number };
  /** Ángulo firmado para `rotation.y` (radianes). */
  signedAngleRad: number;
}
