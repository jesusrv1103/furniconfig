import type { ChangeEvent, ReactNode } from 'react';
import { useState } from 'react';
import {
  BOARD_THICKNESSES_MM,
  DEFAULT_ROD_DIAMETER_MM,
  DEFAULT_ROD_FINISH,
  DEFAULT_ROD_NAME,
  type DoorHingeSide,
  type DoorLeafCount,
  type ModuleKind,
  type WardrobeConfig,
  WARDROBE_CONFIG_SCHEMA_VERSION,
  WARDROBE_LIMITS,
} from '@furniconfig/geometry-core';
import {
  DEFAULT_DOOR_CLEARANCE_MM,
  DEFAULT_DOOR_LEAVES,
  DEFAULT_DRAWER_COUNT,
  DEFAULT_HINGE_SIDE,
  FINISH_OPTIONS,
  MODULE_KIND_LABELS,
  materialSpec,
  clearHangingRod,
  setBackPanelEnabled,
  setBackPanelThickness,
  setDimension,
  setDoorClearance,
  setDoorHingeSide,
  setDoorLeaves,
  setDoorsEnabled,
  setHangingRodDiameter,
  setHangingRodMaterial,
  setMaterialFinish,
  setMaterialName,
  setMaterialThickness,
  setModuleCount,
  setModuleDrawers,
  setModuleKind,
  setModuleShelves,
  type DimensionKey,
  type MaterialRole,
} from '../lib/config.js';

const MATERIAL_ROLE_LABELS: Readonly<Record<MaterialRole, string>> = {
  structure: 'Estructura (laterales, superior, inferior, divisiones)',
  interior: 'Interior (entrepaños)',
  drawer: 'Cajones (frentes, laterales, traseras, fondos)',
  door: 'Puertas (hojas)',
  back: 'Panel trasero',
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

type SectionId =
  | 'dimensions'
  | 'modules'
  | 'doors'
  | 'backPanel'
  | 'rod'
  | 'materials';

const SECTION_IDS: readonly SectionId[] = [
  'dimensions',
  'modules',
  'doors',
  'backPanel',
  'rod',
  'materials',
];

/**
 * Sección colapsable del panel. El encabezado es un botón
 * con `aria-expanded`/`aria-controls`; el contenido conserva
 * un `fieldset` con `legend` oculto para el agrupamiento
 * accesible del formulario. Abierta por defecto: la
 * jerarquía mejora la navegación sin esconder controles.
 */
function ConfigSection({
  id,
  title,
  open,
  onToggle,
  children,
}: {
  id: SectionId;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="config-section">
      <h3 className="config-section-heading">
        <button
          type="button"
          className="config-section-toggle"
          aria-expanded={open}
          aria-controls={`section-${id}`}
          onClick={onToggle}
        >
          <span>{title}</span>
          <span className="config-section-chevron" aria-hidden="true">
            ▾
          </span>
        </button>
      </h3>
      <div
        id={`section-${id}`}
        className="config-section-body"
        hidden={!open}
      >
        <fieldset className="config-section-fieldset">
          <legend className="visually-hidden">{title}</legend>
          {children}
        </fieldset>
      </div>
    </section>
  );
}

export function ConfigPanel({ config, onUpdate, onReset }: ConfigPanelProps) {
  const { dimensions, modules, materials } = config;
  // Capturas locales: el narrowing de `config.doors`
  // se pierde dentro de los callbacks de los botones.
  const doors = config.doors;
  const backPanel = config.backPanel;
  const { widthMm, heightMm, depthMm } = dimensions;
  const dimensionLimits = WARDROBE_LIMITS;
  const hasHangingModules = modules.some(
    (module) => module.kind === 'hanging',
  );
  const [openSections, setOpenSections] = useState<
    Record<SectionId, boolean>
  >(() =>
    SECTION_IDS.reduce(
      (accumulator, id) => ({ ...accumulator, [id]: true }),
      {} as Record<SectionId, boolean>,
    ),
  );
  const toggleSection = (id: SectionId) => {
    setOpenSections((previous) => ({
      ...previous,
      [id]: !previous[id],
    }));
  };
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

  const handleModuleDrawers = (index: number) => {
    return (event: ChangeEvent<HTMLInputElement>) => {
      onUpdate((current) =>
        setModuleDrawers(current, index, Number(event.target.value)),
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

      <ConfigSection
        id="dimensions"
        title="Dimensiones (mm)"
        open={openSections.dimensions}
        onToggle={() => toggleSection('dimensions')}
      >
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
      </ConfigSection>

      <ConfigSection
        id="modules"
        title={`Módulos (${modules.length})`}
        open={openSections.modules}
        onToggle={() => toggleSection('modules')}
      >
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
            {module.kind === 'drawers' && (
              <label className="field">
                <span>Cajones</span>
                <input
                  type="number"
                  inputMode="numeric"
                  step={1}
                  min={WARDROBE_LIMITS.drawerCount.min}
                  max={WARDROBE_LIMITS.drawerCount.max}
                  value={module.drawers ?? DEFAULT_DRAWER_COUNT}
                  onChange={handleModuleDrawers(index)}
                />
                <small>
                  Provisional: {WARDROBE_LIMITS.drawerCount.min}–
                  {WARDROBE_LIMITS.drawerCount.max} cajones
                </small>
              </label>
            )}
          </fieldset>
        ))}
      </ConfigSection>

      <ConfigSection
        id="doors"
        title="Puertas abatibles"
        open={openSections.doors}
        onToggle={() => toggleSection('doors')}
      >
        <p className="provisional-note">
          Reglas provisionales: 1–2 hojas por módulo,
          holgura 0–10 mm, montaje sobre el frente.
          La apertura se controla en el visualizador.
          Validar con carpintería.
        </p>
        <div
          className="module-count"
          role="group"
          aria-label="Puertas del clóset"
        >
          <button
            type="button"
            className="count-button"
            aria-pressed={!doors}
            onClick={() =>
              onUpdate((current) => setDoorsEnabled(current, false))
            }
          >
            Sin puertas
          </button>
          <button
            type="button"
            className="count-button"
            aria-pressed={!!doors}
            onClick={() =>
              onUpdate((current) => setDoorsEnabled(current, true))
            }
          >
            Con puertas
          </button>
        </div>
        {doors && (
          <>
            <label className="field">
              <span>Hojas</span>
              <div
                className="module-count"
                role="group"
                aria-label="Hojas por módulo"
              >
                {[1, 2].map((leaves) => (
                  <button
                    key={leaves}
                    type="button"
                    className="count-button"
                    aria-pressed={doors.leaves === leaves}
                    onClick={() =>
                      onUpdate((current) =>
                        setDoorLeaves(
                          current,
                          leaves as DoorLeafCount,
                        ),
                      )
                    }
                  >
                    {leaves}
                  </button>
                ))}
              </div>
            </label>
            {doors.leaves === 1 && (
              <label className="field">
                <span>Bisagra</span>
                <div
                  className="module-count"
                  role="group"
                  aria-label="Lado de la bisagra"
                >
                  {(['left', 'right'] as DoorHingeSide[]).map(
                    (side) => (
                      <button
                        key={side}
                        type="button"
                        className="count-button"
                        aria-pressed={
                          (doors.hingeSide ??
                            DEFAULT_HINGE_SIDE) === side
                        }
                        onClick={() =>
                          onUpdate((current) =>
                            setDoorHingeSide(current, side),
                          )
                        }
                      >
                        {side === 'left' ? 'Izquierda' : 'Derecha'}
                      </button>
                    ),
                  )}
                </div>
              </label>
            )}
            <label className="field">
              <span>Holgura</span>
              <input
                type="number"
                inputMode="numeric"
                step={1}
                min={WARDROBE_LIMITS.doors.clearanceMm.min}
                max={WARDROBE_LIMITS.doors.clearanceMm.max}
                value={
                  doors.clearanceMm ??
                  DEFAULT_DOOR_CLEARANCE_MM
                }
                onChange={(event) =>
                  onUpdate((current) =>
                    setDoorClearance(
                      current,
                      Number(event.target.value),
                    ),
                  )
                }
              />
              <small>
                Provisional:{' '}
                {WARDROBE_LIMITS.doors.clearanceMm.min}–
                {WARDROBE_LIMITS.doors.clearanceMm.max} mm
              </small>
            </label>
          </>
        )}
      </ConfigSection>

      <ConfigSection
        id="backPanel"
        title="Panel trasero"
        open={openSections.backPanel}
        onToggle={() => toggleSection('backPanel')}
      >
        <p className="provisional-note">
          Montaje por encaje PROVISIONAL: el panel ocupa el
          plano posterior y entrepaños, divisiones, cajones
          y barra se acortan a la profundidad útil. Validar
          con carpintería.
        </p>
        <div
          className="module-count"
          role="group"
          aria-label="Panel trasero"
        >
          <button
            type="button"
            className="count-button"
            aria-pressed={!backPanel?.enabled}
            onClick={() =>
              onUpdate((current) =>
                setBackPanelEnabled(current, false),
              )
            }
          >
            Sin panel
          </button>
          <button
            type="button"
            className="count-button"
            aria-pressed={!!backPanel?.enabled}
            onClick={() =>
              onUpdate((current) =>
                setBackPanelEnabled(current, true),
              )
            }
          >
            Con panel
          </button>
        </div>
        {backPanel?.enabled && (
          <label className="field">
            <span>Espesor</span>
            <select
              value={backPanel.thicknessMm}
              onChange={(event) =>
                onUpdate((current) =>
                  setBackPanelThickness(
                    current,
                    Number(event.target.value) as 15 | 18,
                  ),
                )
              }
            >
              {BOARD_THICKNESSES_MM.map((thickness) => (
                <option key={thickness} value={thickness}>
                  {thickness} mm
                </option>
              ))}
            </select>
          </label>
        )}
      </ConfigSection>

      {hasHangingModules && (
        <ConfigSection
          id="rod"
          title="Barra de colgado"
          open={openSections.rod}
          onToggle={() => toggleSection('rod')}
        >
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
        </ConfigSection>
      )}

      <ConfigSection
        id="materials"
        title="Materiales y acabados"
        open={openSections.materials}
        onToggle={() => toggleSection('materials')}
      >
        {(
          [
            'structure',
            'interior',
            'drawer',
            // Puertas y panel trasero: editables
            // solo con la función activada.
            ...(config.doors ? ['door'] : []),
            ...(config.backPanel?.enabled ? ['back'] : []),
          ] as MaterialRole[]
        ).map((role) => {
          // Los roles opcionales del contrato se
          // editan sobre el default provisional
          // del motor (drawer: su spec; door y
          // back: estructura).
          const spec = materialSpec(config, role);
          return (
            <fieldset key={role} className="material-card">
              <legend>{MATERIAL_ROLE_LABELS[role]}</legend>
              <label className="field">
                <span>Nombre</span>
                <input
                  type="text"
                  value={spec.name}
                  onChange={handleMaterial(role)('name')}
                />
              </label>
              <label className="field">
                <span>Espesor</span>
                <select
                  value={spec.thicknessMm}
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
                  value={spec.finish}
                  onChange={handleMaterial(role)('finish')}
                >
                  {FINISH_OPTIONS.map((finish) => (
                    <option key={finish} value={finish}>
                      {finish}
                    </option>
                  ))}
                </select>
              </label>
              {role !== 'structure' && role !== 'interior' && (
                <small className="provisional-note">
                  Provisional: el motor aplica este
                  material a
                  {role === 'drawer'
                    ? ' los módulos de cajones'
                    : role === 'door'
                      ? ' las hojas de puerta'
                      : ' el panel trasero'}
                  .
                </small>
              )}
            </fieldset>
          );
        })}
      </ConfigSection>

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
