/**
 * API pública del motor geométrico paramétrico de FurniConfig.
 *
 * Unidad interna: milímetros enteros. X = ancho, Y = alto, Z = profundidad.
 * El paquete es puro: sin Three.js, sin React, sin dependencias runtime.
 */

export * from './errors.js';
export * from './types/material.js';
export * from './types/module.js';
export * from './types/panel.js';
export * from './types/rod.js';
export * from './types/drawer.js';
export * from './types/wardrobe.js';
export * from './types/geometry-result.js';
export * from './contract/wardrobe-config.js';
export * from './contract/limits.js';
export * from './contract/validate.js';
export * from './engine/distribute.js';
export * from './engine/panels.js';
export * from './engine/rods.js';
export * from './engine/drawers.js';
export * from './engine/geometry.js';
