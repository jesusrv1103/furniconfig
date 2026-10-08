import type {
  GeometryResult,
  PanelRole,
} from '@furniconfig/geometry-core';
import { MODULE_KIND_LABELS } from '../lib/config.js';
import { formatCubicMeters, formatMm } from '../lib/units.js';
const ROLE_LABELS: Readonly<Record<PanelRole, string>> = {
  side: 'Laterales',
  top: 'Superior',
  bottom: 'Inferior',
  divider: 'Divisiones',
  shelf: 'Entrepaños',
  'drawer-front': 'Frentes de cajón',
  'drawer-side': 'Laterales de cajón',
  'drawer-back': 'Traseras de cajón',
  'drawer-bottom': 'Fondos de cajón',
};

const ROLE_ORDER: readonly PanelRole[] = [
  'side',
  'top',
  'bottom',
  'divider',
  'shelf',
  'drawer-front',
  'drawer-side',
  'drawer-back',
  'drawer-bottom',
];

export function SummaryPanel({ geometry }: { geometry: GeometryResult }) {
  const { wardrobe, totals } = geometry;
  const structureThickness = wardrobe.materials.structure.thicknessMm;
  const usableWidthMm = wardrobe.widthMm - 2 * structureThickness;
  const innerHeightMm = wardrobe.heightMm - 2 * structureThickness;

  const panelsByRole = new Map<PanelRole, number>();
  for (const panel of geometry.panels) {
    panelsByRole.set(panel.role, (panelsByRole.get(panel.role) ?? 0) + 1);
  }

  return (
    <section className="summary-panel">
      <h2>Resumen geométrico</h2>

      <dl className="summary-list">
        <div>
          <dt>Dimensiones externas</dt>
          <dd>
            {formatMm(wardrobe.widthMm)} × {formatMm(wardrobe.heightMm)} ×{' '}
            {formatMm(wardrobe.depthMm)}
          </dd>
        </div>
        <div>
          <dt>Ancho útil interior</dt>
          <dd>{formatMm(usableWidthMm)}</dd>
        </div>
        <div>
          <dt>Alto interior de módulos</dt>
          <dd>{formatMm(innerHeightMm)}</dd>
        </div>
        <div>
          <dt>Profundidad</dt>
          <dd>{formatMm(wardrobe.depthMm)}</dd>
        </div>
        <div>
          <dt>Paneles</dt>
          <dd>{totals.panelCount}</dd>
        </div>
        <div>
          <dt>Volumen de tableros</dt>
          <dd>
            {formatCubicMeters(totals.panelVolumeMm3)} (
            {totals.panelVolumeMm3.toLocaleString('es-ES')} mm³)
          </dd>
        </div>
      </dl>

      <h3>Módulos</h3>
      <ul className="module-list">
        {wardrobe.modules.map((module, index) => (
          <li key={module.id}>
            <strong>Módulo {index + 1}</strong> · {MODULE_KIND_LABELS[module.kind]}
            {module.kind === 'shelves' && module.shelves !== undefined
              ? ` · ${module.shelves} entrepaños`
              : ''}
            {module.kind === 'drawers' && module.drawers !== undefined
              ? ` · ${module.drawers} cajones`
              : ''}
            <br />
            {formatMm(module.widthMm)} × {formatMm(module.heightMm)} ×{' '}
            {formatMm(module.depthMm)}
          </li>
        ))}
      </ul>

      <h3>Paneles por tipo</h3>
      <ul className="panel-list">
        {ROLE_ORDER.filter((role) => panelsByRole.has(role)).map((role) => (
          <li key={role}>
            {ROLE_LABELS[role]}: {panelsByRole.get(role)}
          </li>
        ))}
      </ul>

      {geometry.rods.length > 0 && (
        <>
          <h3>Barras de colgado ({geometry.totals.rodCount})</h3>
          <ul className="panel-list">
            {geometry.rods.map((rod) => (
              <li key={rod.id}>
                {rod.id} · {formatMm(rod.lengthMm)} ×{' '}
                {formatMm(rod.diameterMm)} de diámetro
              </li>
            ))}
          </ul>
          <dl className="summary-list">
            <div>
              <dt>Longitud total de barras</dt>
              <dd>{formatMm(geometry.totals.rodLengthMm)}</dd>
            </div>
          </dl>
          {wardrobe.materials.rod && (
            <ul className="material-list">
              <li>
                Barra: {wardrobe.materials.rod.name} ·{' '}
                {wardrobe.materials.rod.finish}
              </li>
            </ul>
          )}
        </>
      )}

      {geometry.drawers.length > 0 && (
        <>
          <h3>Cajones ({geometry.totals.drawerCount})</h3>
          <ul className="panel-list">
            {geometry.drawers.map((drawer) => (
              <li key={drawer.id}>
                {drawer.id} · {drawer.partIds.length} piezas
              </li>
            ))}
          </ul>
          <dl className="summary-list">
            <div>
              <dt>Piezas de cajón</dt>
              <dd>{geometry.totals.drawerPartCount}</dd>
            </div>
          </dl>
          {wardrobe.materials.drawer && (
            <ul className="material-list">
              <li>
                Cajones: {wardrobe.materials.drawer.name} ·{' '}
                {wardrobe.materials.drawer.thicknessMm} mm ·{' '}
                {wardrobe.materials.drawer.finish}
              </li>
            </ul>
          )}
        </>
      )}

      <h3>Materiales</h3>
      <ul className="material-list">
        <li>
          Estructura: {wardrobe.materials.structure.name} ·{' '}
          {wardrobe.materials.structure.thicknessMm} mm ·{' '}
          {wardrobe.materials.structure.finish}
        </li>
        <li>
          Interior: {wardrobe.materials.interior.name} ·{' '}
          {wardrobe.materials.interior.thicknessMm} mm ·{' '}
          {wardrobe.materials.interior.finish}
        </li>
      </ul>
    </section>
  );
}
