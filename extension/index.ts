/* eslint-disable no-param-reassign */
/* eslint-disable promise/catch-or-return */
import path from 'path';
import { workspace, ExtensionContext } from 'vscode';
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
  NotificationType,
  RequestType,
  RevealOutputChannelOn
} from 'vscode-languageclient/node';
import * as vscode from 'vscode';
import { CUSTOM_SCHEMA_REQUEST, CUSTOM_CONTENT_REQUEST, SchemaExtensionAPI } from './schema-extension-api';
import { getJsonSchemaContent, JSONSchemaDocumentContentProvider } from './json-schema-content-provider';
import { registerStacktapeCommands } from './commands';

export interface ISchemaAssociations {
  [pattern: string]: string[];
}

export interface ISchemaAssociation {
  fileMatch: string[];
  uri: string;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace SchemaAssociationNotification {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const type: NotificationType<ISchemaAssociations | ISchemaAssociation[]> = new NotificationType(
    'json/schemaAssociations'
  );
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace VSCodeContentRequestRegistration {
  export const type: NotificationType<{}> = new NotificationType('yaml/registerContentRequest');
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace VSCodeContentRequest {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export const type: RequestType<string, string, any> = new RequestType('vscode/content');
}

// eslint-disable-next-line @typescript-eslint/no-namespace
namespace DynamicCustomSchemaRequestRegistration {
  export const type: NotificationType<{}> = new NotificationType('yaml/registerCustomSchemaRequest');
}

let client: LanguageClient;

export function activate(context: ExtensionContext): SchemaExtensionAPI {
  // Create an OutputChannel
  // this enables us to see logs in Output section of VSCode
  const outputChannel = vscode.window.createOutputChannel('Stacktape');
  context.subscriptions.push(outputChannel);

  // The YAML language server is implemented in node
  const serverModule = context.asAbsolutePath(path.join('dist', 'yaml-language-server', 'server.js'));

  // The debug options for the server
  const debugOptions = { execArgv: ['--nolazy', '--inspect=6019'] };

  // If the extension is launched in debug mode then the debug server options are used
  // Otherwise the run options are used
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
  };

  // Options to control the language client
  const clientOptions: LanguageClientOptions = {
    // Stacktape config files get their own `stacktape` language id (contributed in
    // package.json via filenamePatterns), so the official YAML extension — which only
    // registers for `yaml` — no longer touches them. The second selector is a safety
    // net: if a file's language wasn't switched to `stacktape` for any reason, we still
    // attach via the `yaml` language + filename pattern (degrading to coexistence rather
    // than silently doing nothing). The server also gates every feature on `isActive()`.
    documentSelector: [{ language: 'stacktape' }, { language: 'yaml', pattern: '**/*{stacktape,stp}*.{yml,yaml}' }],
    synchronize: {
      // Synchronize these setting sections with the server
      configurationSection: ['stacktape', 'http.proxy', 'http.proxyStrictSSL', 'editor.tabSize', '[stacktape]'],
      // Notify the server about file changes to YAML and JSON files contained in the workspace
      fileEvents: [
        workspace.createFileSystemWatcher('**/*.?(e)y?(a)ml'),
        workspace.createFileSystemWatcher('**/*.json')
      ]
    },
    outputChannel,
    revealOutputChannelOn: RevealOutputChannelOn.Never
  };

  // Create the language client and start it
  client = new LanguageClient('stacktape', 'Stacktape', serverOptions, clientOptions);

  const disposable = client.start();

  const schemaExtensionAPI = new SchemaExtensionAPI(client);

  // Push the disposable to the context's subscriptions so that the
  // client can be deactivated on extension deactivation
  context.subscriptions.push(disposable);
  context.subscriptions.push(
    workspace.registerTextDocumentContentProvider('json-schema', new JSONSchemaDocumentContentProvider())
  );

  registerStacktapeCommands(context);
  client.onReady().then(() => {
    // Send a notification to the server with the Stacktape schema associations
    client.sendNotification(SchemaAssociationNotification.type, getSchemaAssociations());
    // Tell the server that the client is ready to provide custom schema content
    client.sendNotification(DynamicCustomSchemaRequestRegistration.type);
    // Tell the server that the client supports schema requests sent directly to it
    client.sendNotification(VSCodeContentRequestRegistration.type);
    // If the server asks for custom schema content, get it and send it back
    client.onRequest(CUSTOM_SCHEMA_REQUEST, (resource: string) => {
      return schemaExtensionAPI.requestCustomSchema(resource);
    });
    client.onRequest(CUSTOM_CONTENT_REQUEST, (uri: string) => {
      return schemaExtensionAPI.requestCustomSchemaContent(uri);
    });
    client.onRequest(VSCodeContentRequest.type, () => {
      return getJsonSchemaContent();
    });
  });

  return schemaExtensionAPI;
}

function getSchemaAssociations(): ISchemaAssociation[] {
  return [
    {
      fileMatch: ['/*stacktape.yml', '/*stp.yml', '/*stacktape.yaml', '/*stp.yaml'],
      uri: null
    }
  ];
}

export function logToExtensionOutputChannel(message: string): void {
  client.outputChannel.appendLine(message);
}
