import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { TextDocumentContentProvider } from 'vscode';
import { URI } from 'vscode-uri';
import { isDebugFilePath } from '../yaml-language-server/is-active';

const CONFIG_SCHEMA_FILE_NAME = 'config-schema.json';
const RELEASE_DATA_FILE_NAME = 'release-data.json';

export const STACKTAPE_SCHEMA_URI = 'https://schemas.stacktape-dev.com/config-schema.json';
export const DEBUG_CONFIG_SCHEMA_PATH = join(process.cwd(), '@generated', 'schemas', CONFIG_SCHEMA_FILE_NAME);
// Global install (`curl … | sh` / PowerShell installer) extracts the binary, the schema
// and release-data.json straight into ~/.stacktape/bin.
export const GLOBAL_BIN_DIR = join(homedir(), '.stacktape', 'bin');
export const GLOBAL_SCHEMA_PATH = join(GLOBAL_BIN_DIR, CONFIG_SCHEMA_FILE_NAME);
export const GLOBAL_RELEASE_DATA_PATH = join(GLOBAL_BIN_DIR, RELEASE_DATA_FILE_NAME);

export class JSONSchemaDocumentContentProvider implements TextDocumentContentProvider {
  async provideTextDocumentContent(): Promise<string | null> {
    return getJsonSchemaContent();
  }
}

// Keyed by resolved source (absolute path or url).
const schemaCache: { [source: string]: string } = {};

// eslint-disable-next-line import/no-mutable-exports
export let schemaVersion: string | null = null;

// A human-readable note shown in the code lens when the schema used for validation may
// not match the Stacktape version the user will actually deploy with.
// eslint-disable-next-line import/no-mutable-exports
export let schemaWarning: string | null = null;

const formatSchema = (schema: any, source: string): string => {
  // Preserve the historical behaviour of stamping the resolved source onto the schema.
  schema.uri = source;
  return JSON.stringify(schema, null, 2);
};

const readSchemaFromFile = async (path: string): Promise<string | null> => {
  if (schemaCache[path]) {
    return schemaCache[path];
  }
  try {
    const formatted = formatSchema(JSON.parse(await readFile(path, 'utf8')), path);
    schemaCache[path] = formatted;
    return formatted;
  } catch {
    // File vanished between existsSync and read, or contained invalid JSON.
    return null;
  }
};

const readSchemaFromUrl = async (url: string): Promise<string | null> => {
  if (schemaCache[url]) {
    return schemaCache[url];
  }
  try {
    const response = await fetch(url);
    const formatted = formatSchema((await response.json()) as any, url);
    schemaCache[url] = formatted;
    return formatted;
  } catch {
    // Network failure / offline — let the caller surface a "failed to load schema" message.
    return null;
  }
};

const readJsonFile = async (path: string): Promise<any> => JSON.parse(await readFile(path, 'utf8'));

// A document uri may arrive as a `file://` uri or a plain fs path. Normalise to fs path.
const toFsPath = (maybeUri?: string): string | undefined => {
  if (!maybeUri) {
    return undefined;
  }
  if (maybeUri.startsWith('file:')) {
    try {
      return URI.parse(maybeUri).fsPath;
    } catch {
      return undefined;
    }
  }
  return maybeUri;
};

/**
 * Find the nearest local Stacktape install by walking up from the config file's
 * directory looking for `node_modules/stacktape`. The package.json version is always
 * present after `npm install`; the schema/binary files are materialised lazily on the
 * first CLI run, so callers must handle a missing schema file.
 */
const findLocalStacktapeInstall = (fromFsPath: string): { packageDir: string; version: string } | undefined => {
  let dir = dirname(fromFsPath);
  for (;;) {
    const packageDir = join(dir, 'node_modules', 'stacktape');
    const pkgJsonPath = join(packageDir, 'package.json');
    if (existsSync(pkgJsonPath)) {
      try {
        const { version } = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
        return { packageDir, version };
      } catch {
        return undefined;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      return undefined; // reached filesystem root
    }
    dir = parent;
  }
};

const readGlobalReleaseVersion = async (): Promise<string | null> => {
  try {
    const { version } = await readJsonFile(GLOBAL_RELEASE_DATA_PATH);
    return version ?? null;
  } catch {
    return null;
  }
};

/**
 * Resolve the Stacktape config schema (and record its version in `schemaVersion`) for a
 * given open config file. Resolution order:
 *   0. local stacktape repo debug files            -> <cwd>/@generated/schemas
 *   1. local project install (node_modules/stacktape)
 *   2. global install                               -> ~/.stacktape/bin
 *   3. remote "latest"                              -> schemas.stacktape-dev.com
 */
export async function getJsonSchemaContent(filePath?: string): Promise<string | null> {
  schemaWarning = null;
  // Tier 0 — Stacktape repo debug files.
  if (filePath && isDebugFilePath(filePath)) {
    schemaVersion = 'local-debug';
    return readSchemaFromFile(DEBUG_CONFIG_SCHEMA_PATH);
  }

  // Tier 1 — local project install, resolved relative to the open file.
  const fsPath = toFsPath(filePath);
  if (fsPath) {
    const local = findLocalStacktapeInstall(fsPath);
    if (local) {
      // package.json version is the reliable version signal for a local install.
      schemaVersion = local.version;

      // Schema is created on first CLI run, next to the cached binary…
      const localSchema = join(local.packageDir, 'bin', CONFIG_SCHEMA_FILE_NAME);
      if (existsSync(localSchema)) {
        return readSchemaFromFile(localSchema);
      }
      // …or in the version-scoped global cache when node_modules isn't writable.
      const versionedSchema = join(GLOBAL_BIN_DIR, local.version, CONFIG_SCHEMA_FILE_NAME);
      if (existsSync(versionedSchema)) {
        return readSchemaFromFile(versionedSchema);
      }
      // Installed but never run: reuse the flat global schema only if its version matches,
      // otherwise fall back to the remote "latest" schema (still reporting the local version).
      if (existsSync(GLOBAL_SCHEMA_PATH) && (await readGlobalReleaseVersion()) === local.version) {
        return readSchemaFromFile(GLOBAL_SCHEMA_PATH);
      }
      schemaWarning = `Validating against the remote "latest" schema; your local Stacktape install is v${local.version}. Run any Stacktape command once so the matching v${local.version} schema is used.`;
      return readSchemaFromUrl(STACKTAPE_SCHEMA_URI);
    }
  }

  // Tier 2 — global install.
  if (existsSync(GLOBAL_SCHEMA_PATH)) {
    schemaVersion = await readGlobalReleaseVersion();
    return readSchemaFromFile(GLOBAL_SCHEMA_PATH);
  }

  // Tier 3 — remote fallback.
  schemaVersion = 'latest';
  schemaWarning = 'No local or global Stacktape install detected — validating against the remote "latest" schema.';
  return readSchemaFromUrl(STACKTAPE_SCHEMA_URI);
}
