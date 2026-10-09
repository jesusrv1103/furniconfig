/**
 * Declaración mínima de `structuredClone` para las pruebas
 * del motor (corrección del CI, Fase 3D).
 *
 * Las pruebas se ejecutan en Node (>= 22.12), que incluye
 * el global, pero el tsconfig del motor usa `lib: ES2022`
 * con `"types": []` para no incorporar tipos de DOM ni de
 * Node y mantener el paquete puro. Esta declaración evita
 * añadir dependencias (p. ej. `@types/node`) solo por el
 * tipado de un global de pruebas.
 */
declare function structuredClone<T>(value: T): T;
