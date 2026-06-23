import { existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { commands, window, workspace, ExtensionContext, Terminal } from 'vscode';

// Matches Stacktape config files: *stacktape.yml / *stp.yaml / *stacktape.debug.yml
// and TypeScript configs *stacktape.ts / *stacktape.config.ts (and *stp variants).
const STACKTAPE_CONFIG_RE = /(stacktape|stp)(\.debug|\.config)?\.(ya?ml|ts)$/i;

export const isStacktapeConfigPath = (fsPath?: string): boolean => !!fsPath && STACKTAPE_CONFIG_RE.test(fsPath);

/**
 * Prefer a local project install's CLI bin shim (walking up from the config file),
 * otherwise fall back to `stacktape` on PATH (a global install).
 */
const resolveCliInvocation = (configFsPath: string): string => {
  let dir = dirname(configFsPath);
  for (;;) {
    for (const bin of ['stacktape.cmd', 'stacktape']) {
      const candidate = join(dir, 'node_modules', '.bin', bin);
      if (existsSync(candidate)) {
        return `"${candidate}"`;
      }
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return 'stacktape';
};

let terminal: Terminal | undefined;
const getTerminal = (): Terminal => {
  if (!terminal || terminal.exitStatus !== undefined) {
    terminal = window.createTerminal('Stacktape');
  }
  return terminal;
};

// stage/region are required by the CLI; profile is optional. We prefill from the
// stacktape.* settings or the last-used value (remembered per workspace).
const promptValue = async (
  context: ExtensionContext,
  stateKey: string,
  settingKey: string,
  title: string,
  prompt: string
): Promise<string | undefined> => {
  const configured = workspace.getConfiguration('stacktape').get<string>(settingKey);
  const last = context.workspaceState.get<string>(stateKey);
  const value = await window.showInputBox({ title, prompt, value: configured || last || '', ignoreFocusOut: true });
  if (value) {
    await context.workspaceState.update(stateKey, value);
  }
  return value;
};

const runStacktape = async (
  context: ExtensionContext,
  subcommand: string,
  options: { confirm?: boolean } = {}
): Promise<void> => {
  const fsPath = window.activeTextEditor?.document.uri.fsPath;
  if (!isStacktapeConfigPath(fsPath)) {
    window.showWarningMessage(
      'Open a Stacktape config file (e.g. *stacktape.yml or *.stacktape.ts) to run this command.'
    );
    return;
  }
  if (options.confirm) {
    const choice = await window.showWarningMessage(
      `Run "stacktape ${subcommand}" for ${basename(fsPath as string)}?`,
      { modal: true },
      'Run'
    );
    if (choice !== 'Run') {
      return;
    }
  }
  const stage = await promptValue(
    context,
    'stacktape.lastStage',
    'defaultStage',
    'Stacktape stage',
    'Stage to target (e.g. dev, staging, production)'
  );
  if (!stage) {
    return;
  }
  const region = await promptValue(
    context,
    'stacktape.lastRegion',
    'defaultRegion',
    'AWS region',
    'AWS region to target (e.g. eu-west-1, us-east-1)'
  );
  if (!region) {
    return;
  }

  const profile = workspace.getConfiguration('stacktape').get<string>('profile');
  const parts = [
    resolveCliInvocation(fsPath as string),
    subcommand,
    '--stage',
    stage,
    '--region',
    region,
    '--configPath',
    `"${fsPath}"`
  ];
  if (profile) {
    parts.push('--profile', profile);
  }

  const term = getTerminal();
  term.show(true);
  term.sendText(parts.join(' '));
};

export const registerStacktapeCommands = (context: ExtensionContext): void => {
  context.subscriptions.push(
    commands.registerCommand('stacktape.validate', () => runStacktape(context, 'validate')),
    // Stacktape has no `preview` command — `diff` shows the preview of changes.
    commands.registerCommand('stacktape.preview', () => runStacktape(context, 'diff')),
    commands.registerCommand('stacktape.deploy', () => runStacktape(context, 'deploy', { confirm: true }))
  );
};
