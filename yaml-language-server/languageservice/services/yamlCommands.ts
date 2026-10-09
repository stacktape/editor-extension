import { Connection } from 'vscode-languageserver/node';
import { YamlCommands } from '../../commands';
import { CommandExecutor } from '../../languageserver/commandExecutor';

export function registerCommands(commandExecutor: CommandExecutor, connection: Connection): void {
  // commandExecutor.registerCommand(YamlCommands.JUMP_TO_SCHEMA, async (uri: string) => {
  //   if (!uri) {
  //     return;
  //   }
  //   if (!uri.startsWith('file')) {
  //     const origUri = URI.parse(uri);
  //     const customUri = URI.from({
  //       scheme: 'json-schema',
  //       authority: origUri.authority,
  //       path: origUri.path.endsWith('.json') ? origUri.path : `${origUri.path}.json`,
  //       fragment: uri
  //     });
  //     uri = customUri.toString();
  //   }
  //   const result = await connection.window.showDocument({ uri, external: false, takeFocus: true });
  //   if (!result) {
  //     connection.window.showErrorMessage(`Cannot open ${uri}`);
  //   }
  // });
  commandExecutor.registerCommand(YamlCommands.OPEN_EXTERNAL_LINK, async (uri: string) => {
    return connection.window.showDocument({ uri, external: true, takeFocus: true });
    //   return openurl(uri);
    //   if (!uri) {
    //     return;
    //   }
    //   if (!uri.startsWith('file')) {
    //     const origUri = URI.parse(uri);
    //     const customUri = URI.from({
    //       scheme: 'json-schema',
    //       authority: origUri.authority,
    //       path: origUri.path.endsWith('.json') ? origUri.path : `${origUri.path}.json`,
    //       fragment: uri
    //     });
    //     uri = customUri.toString();
    //   }
    //   const result = await connection.window.showDocument({ uri, external: false, takeFocus: true });
    //   if (!result) {
    //     connection.window.showErrorMessage(`Cannot open ${uri}`);
    //   }
    // });
  });
}
