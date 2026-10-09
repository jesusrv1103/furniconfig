import { useState, type ChangeEvent, type KeyboardEvent } from 'react';
import {
  WARDROBE_LIMITS,
  distributeModules,
  maxFixedWidthMm,
  type Module,
  type ModuleKind,
  type WardrobeConfig,
} from '@furniconfig/geometry-core';
import {
  MODULE_KIND_LABELS,
  releaseModuleWidth,
  setHangingRodDiameter,
  setModuleDrawers,
  setModuleKind,
  setModuleShelves,
  setModuleWidth,
} from '../../lib/config.js';
import {
  MODULE_KIND_FRIENDLY,
  type ModuleContext,
} from '../../lib/studio/selection.js';
import { formatMm } from '../../lib/units.js';

/**
 * Panel contextual de propiedades del módulo (Fase 3C,
 * ampliado en la Fase 3D).
 *
 * Se muestra en el panel derecho cuando hay selección y
 * permite editar —con helpers puros— el tipo, las repisas,
 * los cajones, el diámetro de la barra y, desde la Fase
 * 3D, el ANCHO INDIVIDUAL del módulo en milímetros.
 *
 * El ancho se expresa como espacio interior útil (misma
 * semántica que `Module.widthMm` resuelto). El control es
 * numérico y preciso: el borrador vive en estado local y
 * se aplica al salir del campo o con Enter; mientras se
 * escribe se previsualizan los anchos RESULTANTES de los
 * demás módulos (el resto reparte el espacio restante por
 * igual). Un valor fuera de rango no llega a aplicarse:
 * se muestra el máximo disponible en su lugar.
 *
 * Las dimensiones que muestra son las RESUELTAS por el
 * motor (no se recalculan aquí).
 */
export function ModulePropertiesPanel({
  context,
  config,
  mode,
  resolvedModules,
  onUpdate,
  onDeselect,
}: {
  context: ModuleContext;
  config: WardrobeConfig;
  /** Modo del editor: el aviso técnico solo aparece en avanzado. */
  mode: 'simple' | 'advanced';
  /** Módulos resueltos del motor (para mostrar los anchos afectados). */
  resolvedModules: readonly Module[];
  onUpdate: (updater: (current: WardrobeConfig) => WardrobeConfig) => void;
  onDeselect: () => void;
}) {
  const moduleConfig = config.modules[context.index];
  const { resolved, number } = context;
  const kind: ModuleKind = moduleConfig?.kind ?? resolved.kind;
  const shelfLimits = WARDROBE_LIMITS.shelfCount;
  const drawerLimits = WARDROBE_LIMITS.drawerCount;
  const rodLimits = WARDROBE_LIMITS.hangingRod.diameterMm;
  const widthLimits = WARDROBE_LIMITS.moduleWidthMm;

  // Ancho individual (Fase 3D): el borrador del input vive
  // en estado local y se confirma al salir del campo.
  const declaredWidthMm = moduleConfig?.widthMm;
  const currentWidthMm = resolved.widthMm;
  const maxFixedWidthMmValue = maxFixedWidthMm({
    totalWidthMm: config.dimensions.widthMm,
    moduleCount: config.modules.length,
    sideThicknessMm: config.materials.structure.thicknessMm,
    dividerThicknessMm: config.materials.structure.thicknessMm,
    declaredWidthsMm: config.modules.map((module) => module.widthMm),
    targetIndex: context.index,
  });
  const [draftWidth, setDraftWidth] = useState<string | null>(null);
  const parsedDraftMm = draftWidth === null ? null : Number(draftWidth);
  const draftValid =
    parsedDraftMm !== null &&
    Number.isInteger(parsedDraftMm) &&
    parsedDraftMm >= widthLimits.min &&
    parsedDraftMm <= maxFixedWidthMmValue;

  // Previsualización del reparto: con el borrador válido se
  // anticipa el resultado; sin borrador (o inválido) muestra
  // la distribución vigente. El motor es la fuente única.
  let previewWidthsMm: readonly number[] | null = null;
  try {
    previewWidthsMm = distributeModules({
      totalWidthMm: config.dimensions.widthMm,
      moduleCount: config.modules.length,
      sideThicknessMm: config.materials.structure.thicknessMm,
      dividerThicknessMm: config.materials.structure.thicknessMm,
      declaredWidthsMm: config.modules.map((module, current) =>
        current === context.index && draftValid ? parsedDraftMm : module.widthMm,
      ),
    }).moduleWidthsMm;
  } catch {
    previewWidthsMm = null;
  }

  const handleKind = (event: ChangeEvent<HTMLSelectElement>) => {
    const next = event.target.value;
    if (next === 'shelves' || next === 'hanging' || next === 'drawers') {
      onUpdate((current) => setModuleKind(current, context.index, next));
    }
  };

  const commitWidth = () => {
    const value = parsedDraftMm;
    setDraftWidth(null);
    if (
      value === null ||
      !draftValid ||
      (declaredWidthMm === undefined && value === currentWidthMm)
    ) {
      // Nada que aplicar: no se fija el ancho automáticamente
      // ni se registran pasos sin cambios.
      return;
    }
    onUpdate((current) => setModuleWidth(current, context.index, value));
  };

  const handleWidthKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitWidth();
    }
  };

  return (
    <section
      className="module-props"
      aria-label={`Propiedades del módulo ${number}`}
      data-selected-module={context.id}
      data-module-kind={kind}
      data-width-state={declaredWidthMm !== undefined ? 'fixed' : 'auto'}
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

      <div className="module-props-width">
        <label className="field">
          <span>Ancho del módulo (mm)</span>
          <input
            type="number"
            inputMode="numeric"
            step={10}
            min={Math.max(widthLimits.min, 0)}
            max={maxFixedWidthMmValue}
            value={draftWidth ?? String(currentWidthMm)}
            data-module-width-input
            onChange={(event) => setDraftWidth(event.target.value)}
            onBlur={commitWidth}
            onKeyDown={handleWidthKeyDown}
            aria-label={`Ancho del módulo ${number} en milímetros`}
          />
          {draftWidth !== null && !draftValid ? (
            <small data-width-hint="invalid">
              Entre {formatMm(widthLimits.min)} y{' '}
              {formatMm(maxFixedWidthMmValue)}. Los demás módulos se ajustan
              al aplicar.
            </small>
          ) : (
            <small data-width-hint="status">
              {declaredWidthMm !== undefined
                ? 'Ancho fijado: los demás módulos reparten el espacio que queda.'
                : 'Ancho automático: se comparte con los demás módulos.'}{' '}
              Máximo disponible: {formatMm(maxFixedWidthMmValue)}.
            </small>
          )}
        </label>

        {declaredWidthMm !== undefined && (
          <button
            type="button"
            data-action="release-width"
            onClick={() => {
              setDraftWidth(null);
              onUpdate((current) =>
                releaseModuleWidth(current, context.index),
              );
            }}
          >
            Liberar ancho
          </button>
        )}

        {config.modules.length > 1 && previewWidthsMm !== null && (
          <div className="module-props-width-preview">
            <p>Ancho de cada módulo:</p>
            <ul aria-label="Anchos resultantes de los módulos">
              {resolvedModules.map((module, index) =>
                index === context.index ? null : (
                  <li
                    key={module.id}
                    data-module-width-preview={module.id}
                  >
                    Módulo {index + 1}:{' '}
                    {formatMm(previewWidthsMm[index] ?? module.widthMm)}
                  </li>
                ),
              )}
            </ul>
          </div>
        )}
      </div>

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
          Módulo {resolved.id} · ancho interior libre declarado en el
          contrato (extensión opcional de `ModuleConfig.widthMm`); el motor
          (@furniconfig/geometry-core) recalcula el reparto y el resto de
          piezas.
        </p>
      )}
    </section>
  );
}
