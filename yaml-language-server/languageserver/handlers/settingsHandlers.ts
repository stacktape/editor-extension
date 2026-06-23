import { DidChangeConfigurationParams, DocumentFormattingRequest, Connection } from 'vscode-languageserver';
import { isRelativePath, relativeToAbsolutePath } from '../../languageservice/utils/paths';
import { checkSchemaURI } from '../../languageservice/utils/schemaUrls';
import { LanguageService, LanguageSettings } from '../../languageservice/yamlLanguageService';
import { Settings, SettingsState } from '../../yamlSettings';
import { ValidationHandler } from './validationHandlers';

export class SettingsHandler {
  constructor(
    private readonly connection: Connection,
    private readonly languageService: LanguageService,
    private readonly yamlSettings: SettingsState,
    private readonly validationHandler: ValidationHandler
  ) {}

  public registerHandlers(): void {
    this.connection.onDidChangeConfiguration((change) => this.configurationChangeHandler(change));
  }

  /**
   * Run when the editor configuration is changed
   * The client syncs the 'yaml', 'http.proxy', 'http.proxyStrictSSL' settings sections
   * Update relevant settings with fallback to defaults if needed
   */
  private configurationChangeHandler(change: DidChangeConfigurationParams): void {
    const settings = change.settings as Settings;

    this.yamlSettings.specificValidatorPaths = [];
    if (settings.stacktape) {
      if (Object.prototype.hasOwnProperty.call(settings.stacktape, 'schemas')) {
        this.yamlSettings.yamlConfigurationSettings = settings.stacktape.schemas;
      }
      if (Object.prototype.hasOwnProperty.call(settings.stacktape, 'validate')) {
        this.yamlSettings.yamlShouldValidate = settings.stacktape.validate;
      }
      if (Object.prototype.hasOwnProperty.call(settings.stacktape, 'hover')) {
        this.yamlSettings.yamlShouldHover = settings.stacktape.hover;
      }
      if (Object.prototype.hasOwnProperty.call(settings.stacktape, 'completion')) {
        this.yamlSettings.yamlShouldCompletion = settings.stacktape.completion;
      }
      if (Object.prototype.hasOwnProperty.call(settings.stacktape, 'validateReferences')) {
        this.yamlSettings.validateReferences = settings.stacktape.validateReferences;
      }
      this.yamlSettings.customTags = settings.stacktape.customTags ? settings.stacktape.customTags : [];

      if (settings.stacktape.schemaStore) {
        this.yamlSettings.schemaStoreEnabled = settings.stacktape.schemaStore.enable;
      }

      if (settings.stacktape.format) {
        this.yamlSettings.yamlFormatterSettings = {
          proseWrap: settings.stacktape.format.proseWrap || 'preserve',
          printWidth: settings.stacktape.format.printWidth || 80
        };

        if (settings.stacktape.format.singleQuote !== undefined) {
          this.yamlSettings.yamlFormatterSettings.singleQuote = settings.stacktape.format.singleQuote;
        }

        if (settings.stacktape.format.bracketSpacing !== undefined) {
          this.yamlSettings.yamlFormatterSettings.bracketSpacing = settings.stacktape.format.bracketSpacing;
        }

        if (settings.stacktape.format.enable !== undefined) {
          this.yamlSettings.yamlFormatterSettings.enable = settings.stacktape.format.enable;
        }
      }
    }

    this.yamlSettings.schemaConfigurationSettings = [];

    if (settings['[stacktape]'] && settings['[stacktape]']['editor.tabSize']) {
      this.yamlSettings.indentation = ' '.repeat(settings['[stacktape]']['editor.tabSize']);
    } else if (settings.editor?.tabSize) {
      this.yamlSettings.indentation = ' '.repeat(settings.editor.tabSize);
    }

    for (const uri in this.yamlSettings.yamlConfigurationSettings) {
      const globPattern = this.yamlSettings.yamlConfigurationSettings[uri];

      const schemaObj = {
        fileMatch: Array.isArray(globPattern) ? globPattern : [globPattern],
        uri: checkSchemaURI(this.yamlSettings.workspaceFolders, this.yamlSettings.workspaceRoot, uri)
      };
      this.yamlSettings.schemaConfigurationSettings.push(schemaObj);
    }

    this.setSchemaStoreSettingsIfNotSet();
    this.updateConfiguration();

    // dynamically enable & disable the formatter
    if (this.yamlSettings.clientDynamicRegisterSupport) {
      const enableFormatter =
        settings && settings.stacktape && settings.stacktape.format && settings.stacktape.format.enable;

      if (enableFormatter) {
        if (!this.yamlSettings.formatterRegistration) {
          this.yamlSettings.formatterRegistration = this.connection.client.register(DocumentFormattingRequest.type, {
            documentSelector: [{ language: 'yaml' }]
          });
        }
      } else if (this.yamlSettings.formatterRegistration) {
        // eslint-disable-next-line promise/catch-or-return
        this.yamlSettings.formatterRegistration.then((r) => {
          return r.dispose();
        });
        this.yamlSettings.formatterRegistration = null;
      }
    }
  }

  /**
   * This function helps set the schema store if it hasn't already been set
   * AND the schema store setting is enabled. If the schema store setting
   * is not enabled we need to clear the schemas.
   */
  public async setSchemaStoreSettingsIfNotSet(): Promise<void> {
    const schemaStoreIsSet = this.yamlSettings.schemaStoreSettings.length !== 0;

    if (this.yamlSettings.schemaStoreEnabled && !schemaStoreIsSet) {
      try {
        const schemaStore = await this.getSchemaStoreMatchingSchemas();
        this.yamlSettings.schemaStoreSettings = schemaStore.schemas;
        this.updateConfiguration();
      } catch (err) {
        // ignore
      }
    } else if (!this.yamlSettings.schemaStoreEnabled) {
      this.yamlSettings.schemaStoreSettings = [];
      this.updateConfiguration();
    }
  }

  /**
   * When the schema store is enabled, download and store YAML schema associations
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getSchemaStoreMatchingSchemas(): Promise<{ schemas: any[] }> {
    return Promise.resolve({ schemas: [] });
  }

  /**
   * Called when server settings or schema associations are changed
   * Re-creates schema associations and re-validates any open YAML files
   */
  public updateConfiguration(): void {
    let languageSettings: LanguageSettings = {
      validate: this.yamlSettings.yamlShouldValidate,
      hover: this.yamlSettings.yamlShouldHover,
      completion: this.yamlSettings.yamlShouldCompletion,
      validateReferences: this.yamlSettings.validateReferences,
      schemas: [],
      // { fileMatch: ['/*stacktape.yml', '/*stp.yml', '/*stacktape.yaml', '/*stp.yaml'], uri: '*' }
      customTags: this.yamlSettings.customTags,
      format: this.yamlSettings.yamlFormatterSettings.enable,
      indentation: this.yamlSettings.indentation
    };

    if (this.yamlSettings.schemaAssociations) {
      if (Array.isArray(this.yamlSettings.schemaAssociations)) {
        this.yamlSettings.schemaAssociations.forEach((association) => {
          languageSettings = this.configureSchemas(
            association.uri,
            association.fileMatch,
            association.schema,
            languageSettings
          );
        });
      } else {
        for (const uri in this.yamlSettings.schemaAssociations) {
          const fileMatch = this.yamlSettings.schemaAssociations[uri];
          languageSettings = this.configureSchemas(uri, fileMatch, null, languageSettings);
        }
      }
    }

    if (this.yamlSettings.schemaConfigurationSettings) {
      this.yamlSettings.schemaConfigurationSettings.forEach((schema) => {
        let uri = schema.uri;
        if (!uri && schema.schema) {
          uri = schema.schema.id;
        }
        if (!uri && schema.fileMatch) {
          uri = `vscode://schemas/custom/${encodeURIComponent(schema.fileMatch.join('&'))}`;
        }
        if (uri) {
          if (isRelativePath(uri)) {
            uri = relativeToAbsolutePath(this.yamlSettings.workspaceFolders, this.yamlSettings.workspaceRoot, uri);
          }

          languageSettings = this.configureSchemas(uri, schema.fileMatch, schema.schema, languageSettings);
        }
      });
    }

    if (this.yamlSettings.schemaStoreSettings) {
      languageSettings.schemas = languageSettings.schemas.concat(this.yamlSettings.schemaStoreSettings);
    }

    this.languageService.configure(languageSettings);

    // Revalidate any open text documents
    this.yamlSettings.documents.all().forEach((document) => this.validationHandler.validate(document));
  }

  /**
   * Stores schema associations in server settings, handling kubernetes
   * @param uri string path to schema (whether local or online)
   * @param fileMatch file pattern to apply the schema to
   * @param schema schema id
   * @param languageSettings current server settings
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private configureSchemas(
    uri: string,
    fileMatch: string[],
    schema: unknown,
    languageSettings: LanguageSettings
  ): LanguageSettings {
    return languageSettings;
  }
}
