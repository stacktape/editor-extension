import { Connection } from 'vscode-languageserver';
import {
  MODIFICATION_ACTIONS,
  SchemaAdditions,
  SchemaDeletions,
  SchemaDeletionsAll
} from '../../languageservice/services/yamlSchemaService';
import { LanguageService } from '../../languageservice/yamlLanguageService';
import { SchemaModificationNotification } from '../../requestTypes';

export class RequestHandlers {
  private languageService: LanguageService;
  constructor(private readonly connection: Connection, languageService: LanguageService) {
    this.languageService = languageService;
  }

  public registerHandlers(): void {
    this.connection.onRequest(SchemaModificationNotification.type, (modifications) =>
      this.registerSchemaModificationNotificationHandler(modifications)
    );
  }

  private registerSchemaModificationNotificationHandler(
    modifications: SchemaAdditions | SchemaDeletions | SchemaDeletionsAll
  ): void {
    if (modifications.action === MODIFICATION_ACTIONS.add) {
      this.languageService.modifySchemaContent(modifications);
    } else if (modifications.action === MODIFICATION_ACTIONS.delete) {
      this.languageService.deleteSchemaContent(modifications);
    } else if (modifications.action === MODIFICATION_ACTIONS.deleteAll) {
      this.languageService.deleteSchemasWhole(modifications);
    }
  }
}
