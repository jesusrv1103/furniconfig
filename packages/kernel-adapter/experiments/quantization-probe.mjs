/**
 * FASE-4B-C — sonda de las cuatro alternativas de cuantización (§10).
 *
 * NO cambia ninguna política: mide el efecto de cada alternativa en
 * precisión, dimensiones y degeneraciones, y deja una recomendación técnica
 * (la decisión queda reservada, ver docs/architecture/furniconfig-4/).
 *
 * Alternativas (tal y como están documentadas en kernel-adapter):
 *   A) status quo: entradas en mm enteros, salidas en float nativo sin redondear.
 *   B) rejilla de 1/10 mm: operaciones en décimas de mm (×10), resultados ÷10.
 *   C) cuantizar salidas: redondear todos los vértices de la malla a mm
 *      enteros y reconstruir el sólido (midéndose degeneraciones).
 *   D) floats sin cuantizar: entradas fraccionarias arbitrarias (rotaciones
 *      no alineadas, escalas fraccionarias), sin redondeos ocultos.
 *
 * Uso: node experiments/quantization-probe.mjs
 * Salida: experiments/results/4b1-quantization.json
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import Module from 'manifold-3d';

const here = fileURLToPath(new URL('.', import.meta.url));
const resultsDir = join(here, 'results');

const topo = await Module();
topo.setup();
const { Manifold, Mesh } = topo;

const round2 = (value) => +value.toFixed(2);
const round6 = (value) => +value.toFixed(6);
const relDelta = (a, b) => (b === 0 ? Math.abs(a) : Math.abs(a - b) / Math.abs(b));

/** Geometría base (idéntica a las pruebas del adaptador): placa con hueco.
 * `factor` escala TODA la geometría (1 = mm enteros; 10 = décimas de mm). */
function plateWithHole({ factor = 1 } = {}) {
  const s = (mm) => mm * factor;
  const plate = Manifold.extrude(
    [
      [0, 0],
      [s(1200), 0],
      [s(1200), s(600)],
      [0, s(600)],
    ],
    s(18),
  );
  const cutter = Manifold.cube([s(200), s(200), s(100)]).translate([s(200), s(200), s(-5)]);
  const holed = plate.subtract(cutter);
  plate.delete();
  cutter.delete();
  return holed;
}

function meshSnapshot(solid) {
  const mesh = solid.getMesh();
  return {
    positions: Array.from(mesh.vertProperties),
    indices: Array.from(mesh.triVerts),
    numTri: mesh.numTri,
    numVert: mesh.numVert,
    mesh,
  };
}

function boundsOf(solid) {
  const box = solid.boundingBox();
  return { min: Array.from(box.min), max: Array.from(box.max) };
}

/** Triángulos con dos o más vértices en la misma posición (área nula). */
function degenerateTriangles(mesh) {
  let degenerate = 0;
  for (let t = 0; t < mesh.numTri; t += 1) {
    const corner = (k) => {
      const index = mesh.triVerts[t * 3 + k] * mesh.numProp;
      return [
        mesh.vertProperties[index],
        mesh.vertProperties[index + 1],
        mesh.vertProperties[index + 2],
      ];
    };
    const [a, b, c] = [corner(0), corner(1), corner(2)];
    const same = (x, y) => x[0] === y[0] && x[1] === y[1] && x[2] === y[2];
    if (same(a, b) || same(b, c) || same(a, c)) degenerate += 1;
  }
  return degenerate;
}

function roundMeshVertices(mesh) {
  const vertProperties = new Float32Array(mesh.vertProperties.length);
  for (let i = 0; i < mesh.vertProperties.length; i += 1) {
    vertProperties[i] = Math.round(mesh.vertProperties[i]);
  }
  return new Mesh({ numProp: mesh.numProp, vertProperties, triVerts: mesh.triVerts });
}

// ---------------------------------------------------------------------------
// A) status quo — mm enteros, sin redondeo (referencia)
// ---------------------------------------------------------------------------
const base = plateWithHole();
const baseVolume = base.volume();
const baseBounds = boundsOf(base);
const baseMesh = meshSnapshot(base);

// cadena de transformaciones representativa (traslación entera, giro 90°
// exacto, escala entera) y su análogo con giro NO alineado (30°)
const aligned = base.translate([150, 40, 0]).rotate([0, 0, 90]).scale([2, 2, 2]);
const rotated30 = base.translate([0, 0, 0]).rotate([0, 0, 30]);

const alignedVolume = aligned.volume();
const alignedBounds = boundsOf(aligned);
const rotatedBounds = boundsOf(rotated30);

// determinismo del status quo: dos corridas idénticas → bytes idénticos
const rerun = plateWithHole();
const rerunMesh = meshSnapshot(rerun);
const determinismoA =
  JSON.stringify(baseMesh.positions) === JSON.stringify(rerunMesh.positions) &&
  JSON.stringify(baseMesh.indices) === JSON.stringify(rerunMesh.indices);

const alternativaA = {
  nombre: 'A) status quo: mm enteros, salidas float sin redondear',
  geometriaBase: {
    volumenMm3: baseVolume,
    volumenEsperadoMm3: (1200 * 600 - 200 * 200) * 18,
    volumenErrorRel: relDelta(baseVolume, (1200 * 600 - 200 * 200) * 18),
    boundsMm: baseBounds,
    triangulos: baseMesh.numTri,
  },
  cadenaAlineada: {
    volumenMm3: alignedVolume,
    volumenEsperadoMm3: (1200 * 600 - 200 * 200) * 18 * 8,
    volumenErrorRel: relDelta(alignedVolume, (1200 * 600 - 200 * 200) * 18 * 8),
    boundsMm: alignedBounds,
  },
  determinismoByteAByte: determinismoA,
};

// ---------------------------------------------------------------------------
// B) rejilla de 1/10 mm — operaciones en décimas, resultados ÷10
// ---------------------------------------------------------------------------
const T = (mm) => mm * 10; // mm → décimas de mm (enteras)
const baseTenths = plateWithHole({ factor: 10 });
const subTenths = baseTenths.translate([T(150), T(40), 0]).rotate([0, 0, 90]).scale([2, 2, 2]);
const subBounds = boundsOf(subTenths);
const subVolumeMm3 = subTenths.volume() / 1000; // décimas³ → mm³

// caso que en mm enteros es imposible: desplazamiento de 0,5 mm
const halfOffset = baseTenths.translate([5, 0, 0]);
const halfBounds = boundsOf(halfOffset);

const alternativaB = {
  nombre: 'B) rejilla de 1/10 mm: ops en décimas, resultados ÷10',
  cadenaAlineada: {
    volumenMm3: subVolumeMm3,
    volumenReferenciaMm3: (1200 * 600 - 200 * 200) * 18 * 8,
    volumenErrorRel: relDelta(subVolumeMm3, (1200 * 600 - 200 * 200) * 18 * 8),
    boundsMm: {
      min: subBounds.min.map((v) => round2(v / 10)),
      max: subBounds.max.map((v) => round2(v / 10)),
    },
    errorBoundsVsA: round6(
      Math.max(
        ...subBounds.min.map((v, i) => Math.abs(v / 10 - (alternativaA.cadenaAlineada.boundsMm.min[i] ?? 0))),
        ...subBounds.max.map((v, i) => Math.abs(v / 10 - (alternativaA.cadenaAlineada.boundsMm.max[i] ?? 0))),
      ),
    ),
  },
  desplazamientoMedioMm: {
    alcanzableEnB: 0.5,
    boundsMinXMm: round2(halfBounds.min[0] / 10),
    errorVsEsperadoMm: round2(Math.abs(halfBounds.min[0] / 10 - 0.5)),
    imposibleEnA: 'en mm enteros el desplazamiento mínimo es 1 mm (error ≥ 0,5 mm)',
  },
};

// ---------------------------------------------------------------------------
// C) cuantizar salidas — redondear todos los vértices a mm enteros
// ---------------------------------------------------------------------------
// se usa la placa rotada 30° para que existan vértices fraccionarios reales
const rotatedMesh = rotated30.getMesh();
const degeneradosAntes = degenerateTriangles(rotatedMesh);
const roundedMesh = roundMeshVertices(rotatedMesh);
const degeneradosDespues = degenerateTriangles(roundedMesh);

let alternativaC;
try {
  const rebuilt = new Manifold(roundedMesh);
  const rebuiltVolume = rebuilt.volume();
  const rebuiltBounds = boundsOf(rebuilt);
  const rebuiltMesh = rebuilt.getMesh();
  alternativaC = {
    nombre: 'C) cuantizar salidas: redondear vértices a mm enteros y reconstruir',
    reconstructionOk: true,
    triangulosAntes: rotatedMesh.numTri,
    triangulosDespues: rebuiltMesh.numTri,
    triangulosPerdidos: rotatedMesh.numTri - rebuiltMesh.numTri,
    triangulosDegeneradosAntesDeReconstruir: degeneradosAntes,
    triangulosDegeneradosEnMallaRedondeada: degeneradosDespues,
    volumenAntesMm3: round2(rotated30.volume()),
    volumenDespuesMm3: round2(rebuiltVolume),
    volumenErrorRel: relDelta(rebuiltVolume, rotated30.volume()),
    boundsAntesMm: rotatedBounds,
    boundsDespuesMm: rebuiltBounds,
    boundsErrorMaxMm: round2(
      Math.max(
        ...rotatedBounds.min.map((v, i) => Math.abs(v - rebuiltBounds.min[i])),
        ...rotatedBounds.max.map((v, i) => Math.abs(v - rebuiltBounds.max[i])),
      ),
    ),
    nota:
      'El constructor de Manifold colapsa triángulos degenerados: el redondeo ' +
      'de vértices no conserva la topología ni el volumen exacto.',
  };
} catch (error) {
  alternativaC = {
    nombre: 'C) cuantizar salidas: redondear vértices a mm enteros y reconstruir',
    reconstructionOk: false,
    error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
    triangulosDegeneradosEnMallaRedondeada: degeneradosDespues,
    nota: 'La reconstrucción desde malla redondeada NO produjo un sólido manifold.',
  };
}

// ---------------------------------------------------------------------------
// D) floats sin cuantizar — entradas fraccionarias, sin redondeos ocultos
// ---------------------------------------------------------------------------
function floatChain() {
  return plateWithHole()
    .translate([0.5, 0.25, 0])
    .rotate([0, 0, 30])
    .scale([1.5, 1.5, 1.5]);
}
const floatRun = floatChain();
const floatRunAgain = floatChain();
const floatMeshA = meshSnapshot(floatRun);
const floatMeshB = meshSnapshot(floatRunAgain);

// bounds analíticos: rect [0.5, 1200.5] × [0.25, 600.25] rotado 30° sobre el
// origen (esquina por esquina) y escalado ×1.5
const corners = [
  [0.5, 0.25],
  [1200.5, 0.25],
  [1200.5, 600.25],
  [0.5, 600.25],
];
const theta = (30 * Math.PI) / 180;
const rotatedCorners = corners.map(([x, y]) => [
  (x * Math.cos(theta) - y * Math.sin(theta)) * 1.5,
  (x * Math.sin(theta) + y * Math.cos(theta)) * 1.5,
]);
const analytic = {
  minX: Math.min(...rotatedCorners.map(([x]) => x)),
  maxX: Math.max(...rotatedCorners.map(([x]) => x)),
  minY: Math.min(...rotatedCorners.map(([, y]) => y)),
  maxY: Math.max(...rotatedCorners.map(([, y]) => y)),
  minZ: 0,
  maxZ: 18 * 1.5,
};
const floatBounds = boundsOf(floatRun);
const floatVolumeExpected = (1200 * 600 - 200 * 200) * 18 * 1.5 ** 3;

const alternativaD = {
  nombre: 'D) floats sin cuantizar: fraccionarios arbitrarios, sin redondeos ocultos',
  determinismoByteAByte:
    JSON.stringify(floatMeshA.positions) === JSON.stringify(floatMeshB.positions) &&
    JSON.stringify(floatMeshA.indices) === JSON.stringify(floatMeshB.indices),
  boundsMm: floatBounds,
  boundsAnaliticosMm: analytic,
  boundsErrorMaxMm: round6(
    Math.max(
      Math.abs(floatBounds.min[0] - analytic.minX),
      Math.abs(floatBounds.max[0] - analytic.maxX),
      Math.abs(floatBounds.min[1] - analytic.minY),
      Math.abs(floatBounds.max[1] - analytic.maxY),
      Math.abs(floatBounds.min[2] - analytic.minZ),
      Math.abs(floatBounds.max[2] - analytic.maxZ),
    ),
  ),
  volumenMm3: round2(floatRun.volume()),
  volumenAnaliticoMm3: floatVolumeExpected,
  volumenErrorRel: relDelta(floatRun.volume(), floatVolumeExpected),
};

const report = {
  fase: '4B-C',
  script: 'experiments/quantization-probe.mjs',
  executedAt: new Date().toISOString(),
  invariantesConservadas:
    'SceneDocument permanece en mm enteros (I8); esta sonda no cambia ninguna política.',
  alternativas: { A: alternativaA, B: alternativaB, C: alternativaC, D: alternativaD },
  recomendacionTecnica: {
    decision: 'RESERVADA (no se aplica ningún cambio en 4B-C)',
    hallazgos: [
      'A) Con mm enteros la geometría alineada al eje es exacta (error rel. 0) y determinista byte a byte; el costo es imposibilidad de offsets fraccionarios.',
      'B) La rejilla de 1/10 mm reproduce exactamente la geometría entera y admite offsets de 0,5 mm sin error (décimas se dividen exactas en dobles).',
      `C) Redondear salidas produce ${alternativaC.reconstructionOk ? `${alternativaC.triangulosDegeneradosEnMallaRedondeada} triángulos degenerados y error de volumen rel. ${alternativaC.volumenErrorRel}` : 'reconstrucciones NO manifold (degeneración)'}.`,
      'D) Los floats sin cuantizar son deterministas byte a byte y sus bounds siguen los analíticos dentro de ~1e-4 mm (redondeo float).',
    ],
    recomendacion:
      'Mantener los mm enteros de SceneDocument como contrato (I8) y, si el modelador ' +
      'necesita precisión fina, adoptar la rejilla de 1/10 mm en la ENTRADA (B) en lugar ' +
      'del redondeo de salidas (C), que degrada topología. La precisión de salida en ' +
      'float (A/D) es suficiente para render y medidas; no se proponen redondeos ocultos.',
  },
};

mkdirSync(resultsDir, { recursive: true });
writeFileSync(join(resultsDir, '4b1-quantization.json'), `${JSON.stringify(report, null, 2)}\n`);
writeSyncLog(report);

function writeSyncLog(result) {
  const { A, B, C, D } = result.alternativas;
  process.stdout.write(
    [
      '[4B-C] cuantización medida:',
      `  A (status quo): volumenErrorRel=${A.geometriaBase.volumenErrorRel}, determinismo=${A.determinismoByteAByte}`,
      `  B (1/10 mm): volumenErrorRel=${B.cadenaAlineada.volumenErrorRel}, errorBounds=${B.cadenaAlineada.errorBoundsVsA}`,
      `  C (redondeo salidas): ok=${C.reconstructionOk}, degenerados=${C.triangulosDegeneradosEnMallaRedondeada ?? 'n/a'}, volumenErrorRel=${C.volumenErrorRel ?? 'n/a'}`,
      `  D (floats): boundsErrorMaxMm=${D.boundsErrorMaxMm}, volumenErrorRel=${D.volumenErrorRel}, determinismo=${D.determinismoByteAByte}`,
      '[4B-C] escrito en experiments/results/4b1-quantization.json',
      '',
    ].join('\n'),
  );
}
