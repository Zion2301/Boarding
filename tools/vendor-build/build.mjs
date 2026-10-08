// Bundles Three.js r186 + helpers into ONE classic script (vendor/three-bundle.js) exposing window.THREE and
// window.Pathfinding, so the game keeps working with plain <script> tags, from file:// and offline.
// Run once (or after upgrading): cd tools/vendor-build && npm install && npm run build
import { build } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const entry = `
import * as THREE_NS from 'three';
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { Pathfinding } from 'three-pathfinding';
const THREE = Object.assign({}, THREE_NS, { BufferGeometryUtils, SkeletonUtils });
window.THREE = THREE;
window.Pathfinding = Pathfinding;
`;
await build({
  stdin: { contents: entry, resolveDir: here, loader: 'js' },
  bundle: true, minify: true, format: 'iife', target: ['es2019'],
  outfile: path.join(here, '..', '..', 'vendor', 'three-bundle.js'),
  legalComments: 'eof',
  logLevel: 'info',
});
