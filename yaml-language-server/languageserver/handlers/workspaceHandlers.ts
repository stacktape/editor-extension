import { ExecuteCommandParams, Connection } from 'vscode-languageserver';
import { CommandExecutor } from '../commandExecutor';

export class WorkspaceHandlers {
  constructor(private readonly connection: Connection, private readonly commandExecutor: CommandExecutor) {}

  registerHandlers(): void {
    this.connection.onExecuteCommand((params) => this.executeCommand(params));
  }

  private executeCommand(params: ExecuteCommandParams): void {
    return this.commandExecutor.executeCommand(params);
  }
}
