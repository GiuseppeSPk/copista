import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import type { Plugin } from 'vite';
import { ORT_BUILDS } from '../src/voice/engine';

/** The onnxruntime-web release the voice was measured with. */
export const ORT_VERSION = '1.30.0';

/** The files of every build a device may load: each entry, then its wasm engine. */
export const ORT_FILES = Object.values(ORT_BUILDS).flatMap(({ files }) => Object.keys(files));

const TYPES: Record<string, string> = { mjs: 'text/javascript', wasm: 'application/wasm' };

function distDir(): string {
  // The package exports no package.json, so it is found next to the entry, in dist/.
  const dist = dirname(createRequire(import.meta.url).resolve('onnxruntime-web'));
  const pkg = join(dist, '..', 'package.json');
  const { version } = JSON.parse(readFileSync(pkg, 'utf8')) as { version: string };
  if (version !== ORT_VERSION) {
    throw new Error(`onnxruntime-web is ${version}, the voice expects ${ORT_VERSION}`);
  }
  return dist;
}

/**
 * Serves onnxruntime-web's files under `ort/<version>/`, from node_modules in
 * dev and as plain files in the build. The worker imports them at run time, so
 * they stay out of the bundle and out of the precache.
 */
export function ort(): Plugin {
  const dir = distDir();
  let base = '/';
  return {
    name: 'copista-ort',
    configResolved(config) {
      base = config.base;
    },
    configureServer(server) {
      const prefix = `${base}ort/${ORT_VERSION}/`;
      server.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0] ?? '';
        const name = path.startsWith(prefix) ? path.slice(prefix.length) : '';
        if (!ORT_FILES.includes(name)) return next();
        res.setHeader('Content-Type', TYPES[name.split('.').pop()!]!);
        // On an isolated page the engine's threads are workers, which do not start
        // without this, and the voice then waits for them for ever.
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
        res.end(readFileSync(join(dir, name)));
      });
    },
    generateBundle() {
      for (const name of ORT_FILES) {
        this.emitFile({
          type: 'asset',
          fileName: `ort/${ORT_VERSION}/${name}`,
          source: readFileSync(join(dir, name)),
        });
      }
    },
  };
}
