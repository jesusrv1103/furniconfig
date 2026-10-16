/**
 * Declaración mínima de `structuredClone` para las pruebas del núcleo.
 *
 * Las pruebas se ejecutan en Node (>= 22.12), que incluye el global, pero el
 * tsconfig del paquete usa `lib: ES2022` con `"types": []` para no
 * incorporar tipos de DOM ni de Node y mantener el paquete puro (mismo
 * patrón que `packages/geometry-core/tests/test-globals.d.ts`).
 */
declare function structuredClone<T>(value: T): T;
