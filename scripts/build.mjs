import * as esbuild from 'esbuild';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { rmSync } from 'node:fs';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const IS_DEV = process.argv.includes('--dev');
const WATCH = process.argv.includes('--watch');

/**
 * vscode-json-languageservice ships two builds:
 *   - lib/umd  (CommonJS, the only tree that includes .d.ts type declarations)
 *   - lib/esm  (ES modules)
 * The UMD build hides its require() calls inside a UMD factory wrapper, so esbuild
 * cannot follow them and leaves transitive deps (jsonc-parser, ...) as runtime
 * require()s — which is exactly why this project used to ship a dist/node_modules.
 * The ESM build uses static imports esbuild CAN bundle. We therefore keep the
 * `lib/umd/...` specifiers in the TypeScript source (so tsc resolves real types) and
 * rewrite them to `lib/esm/...` at bundle time, producing a fully self-contained file.
 */
const preferEsmBuildPlugin = {
  name: 'prefer-esm-build',
  setup(build) {
    // vscode-json-languageservice: keep `lib/umd/...` in source (only the umd tree ships
    // .d.ts types) but bundle the equivalent ESM module.
    build.onResolve({ filter: /^vscode-json-languageservice($|\/lib\/umd\/)/ }, (args) => {
      const esmSpecifier =
        args.path === 'vscode-json-languageservice'
          ? 'vscode-json-languageservice/lib/esm/jsonLanguageService'
          : args.path.replace('/lib/umd/', '/lib/esm/');
      return { path: require.resolve(esmSpecifier) };
    });
    // jsonc-parser's UMD build loads its ./impl/* submodules via dynamic require() that
    // esbuild can't follow; its ESM build uses static imports that bundle cleanly.
    build.onResolve({ filter: /^jsonc-parser$/ }, () => ({
      path: require.resolve('jsonc-parser/lib/esm/main.js')
    }));
  }
};

/** @type {import('esbuild').BuildOptions} */
const buildOptions = {
  bundle: true,
  platform: 'node',
  target: 'node18',
  format: 'cjs',
  // `vscode` is provided by the extension host at runtime and must never be bundled.
  // Everything else is bundled into the two output files — no dist/node_modules.
  external: ['vscode'],
  plugins: [preferEsmBuildPlugin],
  sourcemap: IS_DEV,
  minify: !IS_DEV,
  // Keep function/class names even when minifying so server-side stack traces in the
  // output channel remain readable for bug reports.
  keepNames: true,
  logLevel: 'info',
  banner: IS_DEV ? { js: 'require("source-map-support").install({ environment: "node" });' } : undefined,
  entryPoints: [join(ROOT, 'yaml-language-server', 'server.ts'), join(ROOT, 'extension', 'index.ts')],
  outdir: join(ROOT, 'dist')
};

// Start from a clean dist so stale artifacts (e.g. dev sourcemaps) never leak into a
// production package.
rmSync(join(ROOT, 'dist'), { recursive: true, force: true });

console.info(`Building in ${IS_DEV ? 'dev' : 'production'} mode${WATCH ? ' (watch)' : ''}...`);

if (WATCH) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.info('Watching for changes...');
} else {
  await esbuild.build(buildOptions);
  console.info('Done.');
}
