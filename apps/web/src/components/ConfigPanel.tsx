import type { ChangeEvent } from 'react';
import {
  BOARD_THICKNESSES_MM,
  DEFAULT_ROD_DIAMETER_MM,
  DEFAULT_ROD_FINISH,
  DEFAULT_ROD_NAME,
  WARDROBE_CONFIG_SCHEMA_VERSION,
  WARDROBE_LIMITS,
  type ModuleKind,
  type WardrobeConfig,
} from '@furniconfig/geometry-core';
import {
  FINISH_OPTIONS,
  MODULE_KIND_LABELS,
  clearHangingRod,
  setDimension,
  setHangingRodDiameter,
  setHangingRodMaterial,
  setMaterialFinish,
  setMaterialName,
  setMaterialThickness,
  setModuleCount,
  setModuleKind,
  setModuleShelves,
  type DimensionKey,
  type MaterialRole,
} from '../lib/config.js';

const MATERIAL_ROLE_LABELS: Readonly<Record<MaterialRole, string>> = {
  structure: 'Estructura (laterales, superior, inferior, divisiones)',
  interior: 'Interior (entrepaños)',
};

const DIMENSION_LABELS: Readonly<Record<DimensionKey, string>> = {
  widthMm: 'Ancho',
  heightMm: 'Alto',
  depthMm: 'Profundidad',
};

interface ConfigPanelProps {
  config: WardrobeConfig;
  onUpdate: (updater: (current: WardrobeConfig) => WardrobeConfig) => void;
  onReset: () => void;
}

export function ConfigPanel({ config, onUpdate, onReset }: ConfigPanelProps) {
  const { dimensions, modules, materials } = config;
  const { widthMm, heightMm, depthMm } = dimensions;
  const dimensionLimits = WARDROBE_LIMITS;
  const hasHangingModules = modules.some(
    (module) => module.kind === 'hanging',
  );
  const hangingRodDiameterMm =
    config.hangingRod?.diameterMm ?? DEFAULT_ROD_DIAMETER_MM;
  const hangingRodName =
    config.hangingRod?.name ?? DEFAULT_ROD_NAME;
  const hangingRodFinish =
    config.hangingRod?.finish ?? DEFAULT_ROD_FINISH;
  const rodDiameterLimits = WARDROBE_LIMITS.hangingRod.diameterMm;

  const handleDimension = (key: DimensionKey) => {
    return (event: ChangeEvent<HTMLInputElement>) => {
      onUpdate((current) => setDimension(current, key, Number(event.target.value)));
    };
  };

  const handleModuleKind = (index: number) => {
    return (event: ChangeEvent<HTMLSelectElement>) => {
      onUpdate((current) =>
        setModuleKind(current, index, event.target.value as ModuleKind),
      );
    };
  };

  const handleModuleShelves = (index: number) => {
    return (event: ChangeEvent<HTMLInputElement>) => {
      onUpdate((current) =>
        setModuleShelves(current, index, Number(event.target.value)),
      );
    };
  };

  const handleMaterial =
    (role: MaterialRole) => (field: 'name' | 'finish' | 'thicknessMm') => {
      return (
        event: ChangeEvent<HTMLInputElement | HTMLSelectElement>,
      ) => {
        const value = event.target.value;
        onUpdate((current) => {
          if (field === 'name') {
            return setMaterialName(current, role, value);
          }
          if (field === 'finish') {
            return setMaterialFinish(current, role, value);
          }
          return setMaterialThickness(
            current,
            role,
            Number(value) as 15 | 18,
          );
        });
      };
    };

  return (
    <form className="config-panel" onSubmit={(event) => event.preventDefault()}>
      <h2>Configuración</h2>

      <fieldset>
        <legend>Dimensiones (mm)</legend>
        {(
          [
            ['widthMm', widthMm],
            ['heightMm', heightMm],
            ['depthMm', depthMm],
          ] as const
        ).map(([key, value]) => (
          <label key={key} className="field">
            <span>{DIMENSION_LABELS[key]}</span>
            <input
              type="number"
              inputMode="numeric"
              step={10}
              min={dimensionLimits[key].min}
              max={dimensionLimits[key].max}
              value={value}
              onChange={handleDimension(key)}
            />
            <small>
              Provisional: {dimensionLimits[key].min}–{dimensionLimits[key].max}{' '}
              mm
            </small>
          </label>
        ))}
      </fieldset>

      <fieldset>
        <legend>Módulos ({modules.length})</legend>
        <div className="module-count" role="group" aria-label="Número de módulos">
          {[1, 2, 3, 4].map((count) => (
            <button
              key={count}
              type="button"
              className="count-button"
              aria-pressed={modules.length === count}
              onClick={() => onUpdate((current) => setModuleCount(current, count))}
            >
              {count}
            </button>
          ))}
        </div>
        {modules.map((module, index) => (
          <fieldset key={index} className="module-card">
            <legend>Módulo {index + 1}</legend>
            <label className="field">
              <span>Tipo</span>
              <select
                value={module.kind}
                onChange={handleModuleKind(index)}
              >
                {(Object.keys(MODULE_KIND_LABELS) as ModuleKind[]).map(
                  (kind) => (
                    <option key={kind} value={kind}>
                      {MODULE_KIND_LABELS[kind]}
                    </option>
                  ),
                )}
              </select>
            </label>
            {module.kind === 'shelves' && (
              <label className="field">
                <span>Entrepaños</span>
                <input
                  type="number"
                  inputMode="numeric"
                  step={1}
                  min={WARDROBE_LIMITS.shelfCount.min}
                  max={WARDROBE_LIMITS.shelfCount.max}
                  value={module.shelves ?? 3}
                  onChange={handleModuleShelves(index)}
                />
              </label>
            )}
          </fieldset>
        ))}
      </fieldset>

      {hasHangingModules && (
        <fieldset>
          <legend>Barra de colgado</legend>
          <p className="provisional-note">
            Reglas provisionales: diámetro {rodDiameterLimits.min}–
            {rodDiameterLimits.max} mm, montaje a{' '}
            {WARDROBE_LIMITS.hangingRod.mountDistanceMm} mm del
            superior. Validar con carpintería.
          </p>
          <label className="field">
            <span>Diámetro</span>
            <input
              type="number"
              inputMode="numeric"
              step={1}
              min={rodDiameterLimits.min}
              max={rodDiameterLimits.max}
              value={hangingRodDiameterMm}
              onChange={(event) =>
                onUpdate((current) =>
                  setHangingRodDiameter(
                    current,
                    Number(event.target.value),
                  ),
                )
              }
            />
            <small>
              Provisional: {rodDiameterLimits.min}–
              {rodDiameterLimits.max} mm
            </small>
          </label>
          <label className="field">
            <span>Material</span>
            <input
              type="text"
              value={hangingRodName}
              onChange={(event) =>
                onUpdate((current) =>
                  setHangingRodMaterial(
                    current,
                    event.target.value,
                    hangingRodFinish,
                  ),
                )
              }
            />
          </label>
          <label className="field">
            <span>Acabado</span>
            <select
              value={hangingRodFinish}
              onChange={(event) =>
                onUpdate((current) =>
                  setHangingRodMaterial(
                    current,
                    hangingRodName,
                    event.target.value,
                  ),
                )
              }
            >
              {FINISH_OPTIONS.map((finish) => (
                <option key={finish} value={finish}>
                  {finish}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="link-button"
            onClick={() => onUpdate(clearHangingRod)}
          >
            Usar valores por defecto del motor
          </button>
        </fieldset>
      )}

      <fieldset>
        <legend>Materiales y acabados</legend>
        {(
          ['structure', 'interior'] as MaterialRole[]
        ).map((role) => (
          <fieldset key={role} className="material-card">
            <legend>{MATERIAL_ROLE_LABELS[role]}</legend>
            <label className="field">
              <span>Nombre</span>
              <input
                type="text"
                value={materials[role].name}
                onChange={handleMaterial(role)('name')}
              />
            </label>
            <label className="field">
              <span>Espesor</span>
              <select
                value={materials[role].thicknessMm}
                onChange={handleMaterial(role)('thicknessMm')}
              >
                {BOARD_THICKNESSES_MM.map((thickness) => (
                  <option key={thickness} value={thickness}>
                    {thickness} mm
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Acabado</span>
              <select
                value={materials[role].finish}
                onChange={handleMaterial(role)('finish')}
              >
                {FINISH_OPTIONS.map((finish) => (
                  <option key={finish} value={finish}>
                    {finish}
                  </option>
                ))}
              </select>
            </label>
          </fieldset>
        ))}
      </fieldset>

      <button type="button" className="reset-button" onClick={onReset}>
        Restablecer configuración
      </button>
      <p className="contract-note">
        Contrato de configuración v{WARDROBE_CONFIG_SCHEMA_VERSION} · unidad:
        milímetros
      </p>
    </form>
  );
}
