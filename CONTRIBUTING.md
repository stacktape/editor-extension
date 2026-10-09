### Developing

1. Install dependencies: `pnpm install`
2. Press F5 in VS Code to build (dev mode) and launch the Extension Development Host.
   - Or build manually: `pnpm build` (production), `pnpm build:dev`, or `pnpm watch`.

### Checks

- `pnpm typecheck` — run the TypeScript compiler (no emit)
- `pnpm lint` — run ESLint

### Publishing

You need to be registered and logged in with the `vsce` utility.

1. `pnpm vs:login` (one-time authentication)
2. `pnpm vs:publish` — builds and publishes to the VS Code Marketplace
3. `pnpm package` — builds a local `.vsix` without publishing
