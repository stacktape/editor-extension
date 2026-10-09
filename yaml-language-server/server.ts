import { createConnection, Connection, ProposedFeatures } from 'vscode-languageserver/node';
import * as nls from 'vscode-nls';
import { workspaceContext } from './languageservice/services/schemaRequestHandler';
import { YAMLServerInit } from './yamlServerInit';
import { SettingsState } from './yamlSettings';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
nls.config(process.env.VSCODE_NLS_CONFIG as any);

// Create a connection for the server.
let connection: Connection = null;

if (process.argv.indexOf('--stdio') === -1) {
  connection = createConnection(ProposedFeatures.all);
} else {
  connection = createConnection();
}

console.log = connection.console.log.bind(connection.console);
console.error = connection.console.error.bind(connection.console);

const yamlSettings = new SettingsState();

new YAMLServerInit(connection, yamlSettings, workspaceContext).start();
