/**
 * Validación runtime del contrato de configuración.
 *
 * Valida `unknown` (frontera de API / formulario) y devuelve un resultado
 * discriminado en lugar de lanzar (ADR-005): apto para mostrar todos los
 * errores de una vez en la UI. El motor (`calculateGeometry`) convierte este
 * resultado en `ConfigValidationError` cuando corresponde.
 */

import type { GeometryErrorCode } from '../errors.js';
import {
  isBoardThicknessMm,
  type BoardThicknessMm,
  type MaterialSpec,
} from '../types/material.js';
import {
  isModuleKind,
  MODULE_KINDS,
  type ModuleConfig,
} from '../types/module.js';
import type { WardrobeDimensions } from '../types/wardrobe.js';
import { WARDROBE_LIMITS } from './limits.js';
import {
  WARDROBE_CONFIG_SCHEMA_VERSION,
  type HangingRodSpec,
  type WardrobeConfig,
} from './wardrobe-config.js';

export interface ConfigIssue {
  code: GeometryErrorCode;
  field: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; config: WardrobeConfig }
  | { ok: false; errors: ConfigIssue[] };

const DIMENSION_FIELDS = ['widthMm', 'heightMm', 'depthMm'] as const;
const MATERIAL_ROLES = ['structure', 'interior'] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveIntegerMm(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value > 0
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== '';
}

function validateDimensions(
  raw: unknown,
  errors: ConfigIssue[],
): WardrobeDimensions | null {
  if (!isRecord(raw)) {
    errors.push({
      code: 'ERR_INVALID_DIMENSION',
      field: 'dimensions',
      message: 'El objeto "dimensions" es obligatorio.',
    });
    return null;
  }

  let valid = true;
  for (const key of DIMENSION_FIELDS) {
    const value = raw[key];
    const limits = WARDROBE_LIMITS[key];
    const field = `dimensions.${key}`;
    if (!isPositiveIntegerMm(value)) {
      errors.push({
        code: 'ERR_INVALID_DIMENSION',
        field,
        message: 'Debe ser un número entero positivo (mm).',
      });
      valid = false;
    } else if (value < limits.min || value > limits.max) {
      errors.push({
        code: 'ERR_INVALID_DIMENSION',
        field,
        message: `Fuera del rango provisional ${limits.min}–${limits.max} mm (validar con carpintería).`,
      });
      valid = false;
    }
  }

  if (!valid) return null;
  return {
    widthMm: raw.widthMm as number,
    heightMm: raw.heightMm as number,
    depthMm: raw.depthMm as number,
  };
}

function validateModules(
  raw: unknown,
  errors: ConfigIssue[],
): ModuleConfig[] | null {
  if (!Array.isArray(raw)) {
    errors.push({
      code: 'ERR_INVALID_MODULE_COUNT',
      field: 'modules',
      message: 'El campo "modules" debe ser una lista.',
    });
    return null;
  }

  const { min, max } = WARDROBE_LIMITS.moduleCount;
  if (raw.length < min || raw.length > max) {
    errors.push({
      code: 'ERR_INVALID_MODULE_COUNT',
      field: 'modules',
      message: `Debe haber entre ${min} y ${max} módulos verticales.`,
    });
  }

  const modules: ModuleConfig[] = [];
  raw.forEach((item, index) => {
    const field = `modules[${index}]`;
    if (!isRecord(item)) {
      errors.push({
        code: 'ERR_INVALID_MODULE_KIND',
        field,
        message: 'El módulo debe ser un objeto.',
      });
      return;
    }
    if (!isModuleKind(item.kind)) {
      errors.push({
        code: 'ERR_INVALID_MODULE_KIND',
        field: `${field}.kind`,
        message: `Tipo desconocido. Valores válidos: ${MODULE_KINDS.join(', ')}.`,
      });
      return;
    }
    const kind = item.kind;
    if (kind === 'shelves') {
      const shelves = item.shelves;
      const { min: shelfMin, max: shelfMax } = WARDROBE_LIMITS.shelfCount;
      if (
        typeof shelves !== 'number' ||
        !Number.isInteger(shelves) ||
        shelves < shelfMin ||
        shelves > shelfMax
      ) {
        errors.push({
          code: 'ERR_INVALID_SHELF_COUNT',
          field: `${field}.shelves`,
          message: `Un módulo de entrepaños requiere "shelves" entero entre ${shelfMin} y ${shelfMax}.`,
        });
        return;
      }
      modules.push({ kind, shelves });
    } else {
      if (item.shelves !== undefined) {
        errors.push({
          code: 'ERR_INVALID_SHELF_COUNT',
          field: `${field}.shelves`,
          message: 'El campo "shelves" solo aplica a módulos de tipo "shelves".',
        });
        return;
      }
      modules.push({ kind });
    }
  });

  return modules;
}

function validateMaterialSpec(
  raw: unknown,
  role: string,
  errors: ConfigIssue[],
): MaterialSpec | null {
  const field = `materials.${role}`;
  if (!isRecord(raw)) {
    errors.push({
      code: 'ERR_INVALID_MATERIAL',
      field,
      message: 'La especificación de material es obligatoria.',
    });
    return null;
  }

  let valid = true;
  if (!isNonEmptyString(raw.name)) {
    errors.push({
      code: 'ERR_INVALID_MATERIAL',
      field: `${field}.name`,
      message: 'El nombre del material no puede estar vacío.',
    });
    valid = false;
  }
  if (!isNonEmptyString(raw.finish)) {
    errors.push({
      code: 'ERR_INVALID_MATERIAL',
      field: `${field}.finish`,
      message: 'El acabado no puede estar vacío.',
    });
    valid = false;
  }
  if (!isBoardThicknessMm(raw.thicknessMm)) {
    errors.push({
      code: 'ERR_INVALID_THICKNESS',
      field: `${field}.thicknessMm`,
      message: `Espesor no soportado. En Fase 0 solo se admiten ${BOARD_THICKNESSES_JOIN}.`,
    });
    valid = false;
  }

  if (!valid) return null;
  return {
    name: raw.name as string,
    thicknessMm: raw.thicknessMm as BoardThicknessMm,
    finish: raw.finish as string,
  };
}

const BOARD_THICKNESSES_JOIN = '15 y 18 mm';

/**
 * Valida la configuración opcional de barras de colgado.
 *
 * `undefined` (campo ausente) es válido: el motor usa valores
 * por defecto provisionales. Devuelve `undefined` para ausente,
 * `null` si hubo errores.
 */
function validateHangingRod(
  raw: unknown,
  errors: ConfigIssue[],
): HangingRodSpec | undefined | null {
  if (raw === undefined) {
    return undefined;
  }
  if (!isRecord(raw)) {
    errors.push({
      code: 'ERR_HANGING_ROD_DIAMETER',
      field: 'hangingRod',
      message: 'La configuración de barra debe ser un objeto.',
    });
    return null;
  }

  const spec: HangingRodSpec = {};
  let valid = true;

  if (raw.diameterMm !== undefined) {
    const { min, max } = WARDROBE_LIMITS.hangingRod.diameterMm;
    const value = raw.diameterMm;
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < min ||
      value > max
    ) {
      errors.push({
        code: 'ERR_HANGING_ROD_DIAMETER',
        field: 'hangingRod.diameterMm',
        message: `Debe ser un entero entre ${min} y ${max} mm (provisional).`,
      });
      valid = false;
    } else {
      spec.diameterMm = value;
    }
  }

  for (const key of ['name', 'finish'] as const) {
    const value = raw[key];
    if (value === undefined) {
      continue;
    }
    if (!isNonEmptyString(value)) {
      errors.push({
        code: 'ERR_INVALID_MATERIAL',
        field: `hangingRod.${key}`,
        message: 'No puede estar vacío.',
      });
      valid = false;
    } else {
      spec[key] = value;
    }
  }

  return valid ? spec : null;
}

/**
 * Valida una configuración de clóset proveniente de una fuente no confiable.
 * Devuelve todos los errores encontrados (no solo el primero).
 */
export function validateWardrobeConfig(input: unknown): ValidationResult {
  if (!isRecord(input)) {
    return {
      ok: false,
      errors: [
        {
          code: 'ERR_INVALID_CONFIG',
          field: 'root',
          message: 'La configuración debe ser un objeto.',
        },
      ],
    };
  }

  const errors: ConfigIssue[] = [];

  if (input.schemaVersion !== WARDROBE_CONFIG_SCHEMA_VERSION) {
    errors.push({
      code: 'ERR_INVALID_SCHEMA_VERSION',
      field: 'schemaVersion',
      message: `Versión de contrato no soportada. Se espera ${WARDROBE_CONFIG_SCHEMA_VERSION}.`,
    });
  }

  const dimensions = validateDimensions(input.dimensions, errors);

  const materialsRecord = isRecord(input.materials) ? input.materials : null;
  if (!materialsRecord) {
    errors.push({
      code: 'ERR_INVALID_MATERIAL',
      field: 'materials',
      message: 'El objeto "materials" es obligatorio.',
    });
  }
  const structure = materialsRecord
    ? validateMaterialSpec(materialsRecord.structure, 'structure', errors)
    : null;
  const interior = materialsRecord
    ? validateMaterialSpec(materialsRecord.interior, 'interior', errors)
    : null;

  const modules = validateModules(input.modules, errors);
  // `null` solo ocurre cuando hubo errores (ya retornamos);
  // `undefined` indica ausencia del campo.
  const hangingRod = validateHangingRod(input.hangingRod, errors) ?? undefined;

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  // Si no hay errores, todas las secciones fueron validadas y son no-nulas.
  const config: WardrobeConfig = {
    schemaVersion: WARDROBE_CONFIG_SCHEMA_VERSION,
    dimensions: dimensions as WardrobeDimensions,
    modules: modules as ModuleConfig[],
    materials: {
      structure: structure as MaterialSpec,
      interior: interior as MaterialSpec,
    },
    ...(hangingRod !== undefined ? { hangingRod } : {}),
  };
  return { ok: true, config };
}
