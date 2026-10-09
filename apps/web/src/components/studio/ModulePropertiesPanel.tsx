import type { ChangeEvent } from 'react';
import {
  WARDROBE_LIMITS,
  type ModuleKind,
  type WardrobeConfig,
} from '@furniconfig/geometry-core';
import {
  MODULE_KIND_LABELS,
  setHangingRodDiameter,
  setModuleDrawers,
  setModuleKind,
  setModuleShelves,
} from '../../lib/config.js';
import {
  MODULE_KIND_FRIENDLY,
  type ModuleContext,
} from '../../lib/studio/selection.js';
import { formatMm } from '../../lib/units.js';

/**
 * Panel contextual de propiedades del módulo (Fase 3C).
 *
 * Se muestra en el panel derecho cuando hay selección y
 * permite editar —con helpers puros existentes— el tipo,
 * las repisas, los cajones y el diámetro de la barra
 * (compartida por los módulos de colgado). Todos los
 * controles tienen funcionalidad real: actualizan la
 * `WardrobeConfig` del editor y el motor recalcula.
 *
 * Las dimensiones que muestra son las RESUELTAS por el
 * motor (no se recalculan aquí).
 */
export function ModulePropertiesPanel({
  context,
  config,
  mode,
  onUpdate,
  onDeselect,
}: {
  context: ModuleContext;
  config: WardrobeConfig;
  /** Modo del editor: el aviso técnico solo aparece en avanzado. */
  mode: 'simple' | 'advanced';
  onUpdate: (updater: (current: WardrobeConfig) => WardrobeConfig) => void;
  onDeselect: () => void;
}) {
  const moduleConfig = config.modules[context.index];
  const { resolved, number } = context;
  const kind: ModuleKind = moduleConfig?.kind ?? resolved.kind;
  const shelfLimits = WARDROBE_LIMITS.shelfCount;
  const drawerLimits = WARDROBE_LIMITS.drawerCount;
  const rodLimits = WARDROBE_LIMITS.hangingRod.diameterMm;

  const handleKind = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    if (next === 'shelves' || next === 'hanging' || next === 'drawers') {
      onUpdate((current) => setModuleKind(current, context.index, next));
    }
  };

  return (
    <section
      className="module-props"
      aria-label={`Propiedades del módulo ${number}`}
      data-selected-module={context.id}
      data-module-kind={kind}
    >
      <div className="module-props-header">
        <div>
          <h3>Módulo {number}</h3>
          <p className="module-props-kind">
            {MODULE_KIND_FRIENDLY[kind]}
          </p>
        </div>
        <button
          type="button"
          className="link-button"
          onClick={onDeselect}
          aria-label={`Deseleccionar módulo ${number}`}
        >
          Deseleccionar
        </button>
      </div>

      <dl className="module-props-dimensions">
        <div>
          <dt>Ancho útil</dt>
          <dd data-module-dim="width">{formatMm(resolved.widthMm)}</dd>
        </div>
        <div>
          <dt>Alto útil</dt>
          <dd data-module-dim="height">{formatMm(resolved.heightMm)}</dd>
        </div>
        <div>
          <dt>Profundidad</dt>
          <dd data-module-dim="depth">{formatMm(resolved.depthMm)}</dd>
        </div>
      </dl>

      <label className="field">
        <span>Tipo de módulo</span>
        <select
          value={kind}
          onChange={handleKind}
          aria-label={`Tipo de módulo ${number}`}
        >
          {(Object.keys(MODULE_KIND_LABELS) as ModuleKind[]).map((option) => (
            <option key={option} value={option}>
              {MODULE_KIND_LABELS[option]}
            </option>
          ))}
        </select>
        <small>
          {kind === 'shelves'
            ? 'Repisas: entrepaños para plegar y almacenar.'
            : kind === 'hanging'
              ? 'Espacio para colgar ropa con barra.'
              : 'Cajones extracorrientes con frente visible.'}
        </small>
      </label>

      {kind === 'shelves' && (
        <label className="field">
          <span>Repisas</span>
          <input
            type="number"
            inputMode="numeric"
            step={1}
            min={shelfLimits.min}
            max={shelfLimits.max}
            value={moduleConfig?.shelves ?? resolved.shelves ?? 3}
            onChange={(event) =>
              onUpdate((current) =>
                setModuleShelves(current, context.index, Number(event.target.value)),
              )
            }
          />
          <small>
            Provisional: {shelfLimits.min}–{shelfLimits.max} repisas
          </small>
        </label>
      )}

      {kind === 'drawers' && (
        <label className="field">
          <span>Cajones</span>
          <input
            type="number"
            inputMode="numeric"
            step={1}
            min={drawerLimits.min}
            max={drawerLimits.max}
            value={moduleConfig?.drawers ?? resolved.drawers ?? 1}
            onChange={(event) =>
              onUpdate((current) =>
                setModuleDrawers(current, context.index, Number(event.target.value)),
              )
            }
          />
          <small>
            Provisional: {drawerLimits.min}–{drawerLimits.max} cajones
          </small>
        </label>
      )}

      {kind === 'hanging' && (
        <label className="field">
          <span>Diámetro de la barra (mm)</span>
          <input
            type="number"
            inputMode="numeric"
            step={1}
            min={rodLimits.min}
            max={rodLimits.max}
            value={config.hangingRod?.diameterMm ?? 30}
            onChange={(event) =>
              onUpdate((current) =>
                setHangingRodDiameter(current, Number(event.target.value)),
              )
            }
          />
          <small>
            Compartida por todos los módulos de colgado · Provisional:{' '}
            {rodLimits.min}–{rodLimits.max} mm
          </small>
        </label>
      )}

      {mode === 'advanced' && (
        <p className="contract-note" data-technical="module">
          Módulo {resolved.id} · dimensiones resueltas por el motor
          (@furniconfig/geometry-core). Sin edición de anchos individuales
          (Fase 3D).
        </p>
      )}
    </section>
  );
}
