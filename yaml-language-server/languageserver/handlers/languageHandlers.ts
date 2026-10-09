import { FoldingRange } from 'vscode-json-languageservice';
import {
  CodeAction,
  CodeActionParams,
  CompletionList,
  DefinitionParams,
  DidChangeWatchedFilesParams,
  DocumentLink,
  DocumentLinkParams,
  DocumentOnTypeFormattingParams,
  DocumentSymbolParams,
  FoldingRangeParams,
  Connection,
  TextDocumentPositionParams,
  CodeLensParams
} from 'vscode-languageserver';
import {
  CodeLens,
  DefinitionLink,
  DocumentSymbol,
  Hover,
  SymbolInformation,
  TextEdit
} from 'vscode-languageserver-types';
import { LanguageService } from '../../languageservice/yamlLanguageService';
import { SettingsState } from '../../yamlSettings';
import { ValidationHandler } from './validationHandlers';

export class LanguageHandlers {
  private languageService: LanguageService;
  private yamlSettings: SettingsState;
  private validationHandler: ValidationHandler;

  constructor(
    private readonly connection: Connection,
    languageService: LanguageService,
    yamlSettings: SettingsState,
    validationHandler: ValidationHandler
  ) {
    this.languageService = languageService;
    this.yamlSettings = yamlSettings;
    this.validationHandler = validationHandler;
  }

  public registerHandlers(): void {
    this.connection.onDocumentLinks((params) => this.documentLinkHandler(params));
    this.connection.onDocumentSymbol((documentSymbolParams) => this.documentSymbolHandler(documentSymbolParams));
    this.connection.onHover((textDocumentPositionParams) => this.hoverHandler(textDocumentPositionParams));
    this.connection.onDefinition((params) => this.definitionHandler(params));
    this.connection.onCompletion((textDocumentPosition) => this.completionHandler(textDocumentPosition));
    this.connection.onDidChangeWatchedFiles((change) => this.watchedFilesHandler(change));
    this.connection.onFoldingRanges((params) => this.foldingRangeHandler(params));
    this.connection.onCodeAction((params) => this.codeActionHandler(params));
    this.connection.onDocumentOnTypeFormatting((params) => this.formatOnTypeHandler(params));
    this.connection.onCodeLens((params) => this.codeLensHandler(params));
    this.connection.onCodeLensResolve((params) => this.codeLensResolveHandler(params));
  }

  documentLinkHandler(params: DocumentLinkParams): Promise<DocumentLink[]> {
    const document = this.yamlSettings.documents.get(params.textDocument.uri);
    if (!document) {
      return Promise.resolve([]);
    }

    return this.languageService.findLinks(document);
  }

  /**
   * Called when the code outline in an editor needs to be populated
   * Returns a list of symbols that is then shown in the code outline
   */
  documentSymbolHandler(documentSymbolParams: DocumentSymbolParams): DocumentSymbol[] | SymbolInformation[] {
    const document = this.yamlSettings.documents.get(documentSymbolParams.textDocument.uri);

    if (!document) {
      return;
    }

    if (this.yamlSettings.hierarchicalDocumentSymbolSupport) {
      return this.languageService.findDocumentSymbols2(document);
    }
    return this.languageService.findDocumentSymbols(document);
  }

  definitionHandler(params: DefinitionParams): Promise<DefinitionLink[]> {
    const document = this.yamlSettings.documents.get(params.textDocument.uri);
    if (!document) {
      return Promise.resolve([]);
    }
    return this.languageService.findDefinition(document, params.position);
  }

  formatOnTypeHandler(
    params: DocumentOnTypeFormattingParams
  ): Promise<TextEdit[] | undefined> | TextEdit[] | undefined {
    const document = this.yamlSettings.documents.get(params.textDocument.uri);

    if (!document) {
      return;
    }
    return this.languageService.doDocumentOnTypeFormatting(document, params);
  }

  /**
   * Called when the user hovers with their mouse over a keyword
   * Returns an informational tooltip
   */
  hoverHandler(textDocumentPositionParams: TextDocumentPositionParams): Promise<Hover> {
    const document = this.yamlSettings.documents.get(textDocumentPositionParams.textDocument.uri);

    if (!document) {
      return Promise.resolve(undefined);
    }

    return this.languageService.doHover(document, textDocumentPositionParams.position);
  }

  /**
   * Called when auto-complete is triggered in an editor
   * Returns a list of valid completion items
   */
  completionHandler(textDocumentPosition: TextDocumentPositionParams): Promise<CompletionList> {
    const textDocument = this.yamlSettings.documents.get(textDocumentPosition.textDocument.uri);

    const result: CompletionList = {
      items: [],
      isIncomplete: false
    };

    if (!textDocument) {
      return Promise.resolve(result);
    }
    return this.languageService.doComplete(textDocument, textDocumentPosition.position);
  }

  /**
   * Called when a monitored file is changed in an editor
   * Re-validates the entire document
   */
  watchedFilesHandler(change: DidChangeWatchedFilesParams): void {
    let hasChanges = false;

    change.changes.forEach((c) => {
      if (this.languageService.resetSchema(c.uri)) {
        hasChanges = true;
      }
    });

    if (hasChanges) {
      this.yamlSettings.documents.all().forEach((document) => this.validationHandler.validate(document));
    }
  }

  foldingRangeHandler(params: FoldingRangeParams): Promise<FoldingRange[] | undefined> | FoldingRange[] | undefined {
    const textDocument = this.yamlSettings.documents.get(params.textDocument.uri);
    if (!textDocument) {
      return;
    }

    return this.languageService.getFoldingRanges(
      textDocument,
      this.yamlSettings.capabilities.textDocument.foldingRange
    );
  }

  codeActionHandler(params: CodeActionParams): CodeAction[] | undefined {
    const textDocument = this.yamlSettings.documents.get(params.textDocument.uri);
    if (!textDocument) {
      return;
    }

    return this.languageService.getCodeAction(textDocument, params);
  }

  codeLensHandler(params: CodeLensParams): Thenable<CodeLens[] | undefined> | CodeLens[] | undefined {
    const textDocument = this.yamlSettings.documents.get(params.textDocument.uri);
    if (!textDocument) {
      return;
    }
    return this.languageService.getCodeLens(textDocument, params);
  }

  codeLensResolveHandler(param: CodeLens): Thenable<CodeLens> | CodeLens {
    return this.languageService.resolveCodeLens(param);
  }
}
