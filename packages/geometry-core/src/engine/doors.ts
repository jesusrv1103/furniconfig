/**
 * Generación de puertas abatibles y
 * tiradores (Fase 2C).
 *
 * Las puertas se montan SOBRE el frente
 * del mueble (montaje PROVISIONAL: la
 * hoja cerrada ocupa z ∈ [-espesor, 0],
 * por delante del plano frontal del
 * cuerpo). Por eso su generación es
 * puramente aditiva: no altera paneles,
 * barras ni cajones.
 *
 * El motor genera las hojas CERRADAS. La
 * apertura es una transformación pura
 * (`doorOpeningTransform`) alrededor del
 * eje de bisagra que no altera los datos
 * geométricos originales.
 *
 * Reglas PROVISIONALES (docs/product-rules.md
 * §3, pendientes de validar con carpintería):
 * - 1 o 2 hojas por módulo; con 2 hojas,
 *   las bisagras van en los extremos
 *   exteriores (apertura simétrica hacia
 *   afuera).
 * - Holgura de 3 mm entre hojas y bordes
 *   del módulo (y entre hojas).
 * - El residuo de 1 mm del reparto de
 *   bandas se deja como holgura extra en
 *   el borde derecho del módulo.
 * - Tirador: cilindro horizontal contra
 *   la cara frontal de la hoja, a 30 mm
 *   del borde libre, centrado verticalmente,
 *   longitud = 40% del ancho de hoja
 *   (acotada 40–120 mm), diámetro 18 mm.
 *
 * Función pura y determinista.
 */

import { WARDROBE_LIMITS } from '../contract/limits.js';
import { GeometryError } from '../errors.js';
import {
  DEFAULT_DOOR_CLEARANCE_MM,
  DEFAULT_HINGE_SIDE,
  DEFAULT_HANDLE_DIAMETER_MM,
  type Door,
  type DoorHandle,
  type DoorOpeningTransform,
} from '../types/door.js';
import type { Wardrobe } from '../types/wardrobe.js';

export interface DoorsResult {
  /** Hojas de puerta (posición cerrada). */
  doors: Door[];
  /** Tiradores de las puertas. */
  handles: DoorHandle[];
}

export function buildDoors(wardrobe: Wardrobe): DoorsResult {
  const doorMaterial = wardrobe.materials.door;
  const handleMaterial = wardrobe.materials.handle;
  // Sin material de puerta resuelto:
  // no hay puertas activadas.
  if (!doorMaterial || !handleMaterial) {
    return { doors: [], handles: [] };
  }

  const doorsConfig = wardrobe.doorsConfig;
  const leaves = doorsConfig?.leaves ?? 1;
  const clearanceMm =
    doorsConfig?.clearanceMm ?? DEFAULT_DOOR_CLEARANCE_MM;
  const {
    handleDiameterMm,
    handleLengthRatio,
    handleMinLengthMm,
    handleMaxLengthMm,
    handleStandoffMm,
  } = WARDROBE_LIMITS.doors;

  const doors: Door[] = [];
  const handles: DoorHandle[] = [];
  const structureThicknessMm =
    wardrobe.materials.structure.thicknessMm;
  // Cursor x: igual que en buildPanels y
  // buildDrawers (división de espesor
  // completo entre módulos consecutivos).
  let cursorXMm = structureThicknessMm;

  wardrobe.modules.forEach((module, moduleIndex) => {
    const moduleNumber = moduleIndex + 1;
    const innerWidthMm = module.widthMm;
    const innerHeightMm = module.heightMm;
    const moduleX = cursorXMm;

    // Reparto de hojas: holgura en los
    // bordes (y entre hojas); el residuo
    // de 1 mm queda como holgura extra
    // en el borde derecho.
    const usableWidthMm = innerWidthMm - 2 * clearanceMm;
    const gapMm = leaves === 2 ? clearanceMm : 0;
    const totalLeafWidthMm = usableWidthMm - (leaves - 1) * gapMm;
    const leafWidthMm = Math.floor(totalLeafWidthMm / leaves);
    const leafHeightMm = innerHeightMm - 2 * clearanceMm;
    if (leafWidthMm <= 0 || leafHeightMm <= 0) {
      throw new GeometryError(
        'ERR_DOOR_WIDTH_INSUFFICIENT',
        `La abertura del módulo (${innerWidthMm} × ${innerHeightMm} mm) no admite ${leaves} hoja(s) con holgura de ${clearanceMm} mm.`,
        {
          moduleId: module.id,
          innerWidthMm,
          innerHeightMm,
          leafWidthMm,
          leafHeightMm,
          clearanceMm,
        },
      );
    }

    const leafThicknessMm = doorMaterial.thicknessMm;

    for (let index = 0; index < leaves; index++) {
      const leafIndex = index + 1;
      // Una hoja: lado de bisagra de la
      // configuración (default 'left').
      // Dos hojas: bisagras en los
      // extremos exteriores.
      const hingeSide =
        leaves === 1
          ? (doorsConfig?.hingeSide ?? DEFAULT_HINGE_SIDE)
          : index === 0
            ? 'left'
            : 'right';

      const leafX =
        moduleX + clearanceMm + index * (leafWidthMm + gapMm);
      const leafY = structureThicknessMm + clearanceMm;

      const doorId = `door-module-${moduleNumber}-${leafIndex}`;
      doors.push({
        id: doorId,
        moduleId: module.id,
        leafIndex,
        leafCount: leaves,
        widthMm: leafWidthMm,
        heightMm: leafHeightMm,
        thicknessMm: leafThicknessMm,
        // Montaje sobre el frente: la hoja
        // cerrada ocupa z ∈ [-espesor, 0].
        positionMm: { x: leafX, y: leafY, z: -leafThicknessMm },
        materialId: doorMaterial.id,
        hingeSide,
      });

      // Tirador: cilindro horizontal contra
      // la cara frontal de la hoja, a
      // `handleStandoffMm` del borde libre
      // (opuesto a la bisagra).
      const rawLengthMm = leafWidthMm * handleLengthRatio;
      const lengthMm = Math.min(
        Math.max(
          Math.round(rawLengthMm),
          handleMinLengthMm,
        ),
        handleMaxLengthMm,
      );
      const radiusMm = handleDiameterMm / 2;
      // Borde libre: opuesto a la bisagra.
      const freeEdgeMm =
        hingeSide === 'left'
          ? leafX + leafWidthMm
          : leafX;
      const direction = hingeSide === 'left' ? -1 : 1;
      const centerXMm =
        freeEdgeMm +
        direction * (handleStandoffMm + lengthMm / 2);
      const centerYMm = leafY + leafHeightMm / 2;
      const centerZMm = -leafThicknessMm - radiusMm;

      handles.push({
        id: `handle-door-module-${moduleNumber}-${leafIndex}`,
        doorId,
        moduleId: module.id,
        axis: 'x',
        lengthMm,
        diameterMm: handleDiameterMm,
        positionMm: {
          x: centerXMm - lengthMm / 2,
          y: centerYMm - radiusMm,
          z: centerZMm - radiusMm,
        },
        materialId: handleMaterial.id,
      });
    }

    // Avance del cursor: igual que en
    // buildPanels y buildDrawers
    // (división de espesor completo
    // entre módulos consecutivos).
    if (moduleIndex < wardrobe.modules.length - 1) {
      cursorXMm += module.widthMm + structureThicknessMm;
    } else {
      cursorXMm += module.widthMm;
    }
  });

  return { doors, handles };
}

/**
 * Transformación de apertura de una puerta:
 * datos para rotar la hoja alrededor de su
 * eje de bisagra SIN alterar la geometría
 * original (la presentación aplica la
 * rotación sobre estos datos).
 *
 * El ángulo se firma según el lado de la
 * bisagra: con bisagra izquierda la hoja
 * gira en sentido positivo (`rotation.y`
 * positivo) y con bisagra derecha, negativo;
 * en ambos casos el borde libre se aleja
 * del frente del mueble (hacia el
 * observador).
 *
 * Función pura: no muta la puerta.
 */
export function doorOpeningTransform(
  door: Door,
  openAngleDeg: number,
): DoorOpeningTransform {
  const { min, max } = WARDROBE_LIMITS.doors.openAngleDeg;
  if (
    typeof openAngleDeg !== 'number' ||
    !Number.isFinite(openAngleDeg) ||
    openAngleDeg < min ||
    openAngleDeg > max
  ) {
    throw new GeometryError(
      'ERR_DOOR_OPEN_ANGLE',
      `El ángulo de apertura debe estar entre ${min} y ${max} grados (provisional).`,
      { openAngleDeg },
    );
  }

  const hingeXmm =
    door.hingeSide === 'left'
      ? door.positionMm.x
      : door.positionMm.x + door.widthMm;
  const hingeZmm = 0;
  const centerXmm = door.positionMm.x + door.widthMm / 2;
  const centerZmm =
    door.positionMm.z + door.thicknessMm / 2;

  const signedAngleRad =
    (door.hingeSide === 'left' ? 1 : -1) *
    (openAngleDeg * Math.PI) / 180;

  return {
    hingeXmm,
    hingeZmm,
    centerOffsetMm: {
      x: centerXmm - hingeXmm,
      z: centerZmm - hingeZmm,
    },
    signedAngleRad,
  };
}
