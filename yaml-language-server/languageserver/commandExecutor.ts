import { ExecuteCommandParams } from 'vscode-languageserver';

export interface CommandHandler {
  (...args: unknown[]): void;
}

export class CommandExecutor {
  private commands = new Map<string, CommandHandler>();
  executeCommand(params: ExecuteCommandParams): void {
    if (this.commands.has(params.command)) {
      const handler = this.commands.get(params.command);
      return handler(...params.arguments);
    }
    throw new Error(`Command '${params.command}' not found`);
  }

  registerCommand(commandId: string, handler: CommandHandler): void {
    this.commands.set(commandId, handler);
  }
}

export const commandExecutor = new CommandExecutor();
