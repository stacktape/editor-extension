import { SymbolInformation, DocumentSymbol } from 'vscode-languageserver-types';
import { JSONDocumentSymbols } from 'vscode-json-languageservice/lib/umd/services/jsonDocumentSymbols';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { yamlDocumentsCache } from '../parser/yaml-documents';
import { YAMLSchemaService } from './yamlSchemaService';

export class YAMLDocumentSymbols {
  private jsonDocumentSymbols;

  constructor(schemaService: YAMLSchemaService) {
    this.jsonDocumentSymbols = new JSONDocumentSymbols(schemaService);
    const origKeyLabel = this.jsonDocumentSymbols.getKeyLabel;

    // override 'getKeyLabel' to handle complex mapping
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.jsonDocumentSymbols.getKeyLabel = (property: any) => {
      if (typeof property.keyNode.value === 'object') {
        return property.keyNode.value.value;
      }
      return origKeyLabel.call(this.jsonDocumentSymbols, property);
    };
  }

  public findDocumentSymbols(document: TextDocument): SymbolInformation[] {
    const doc = yamlDocumentsCache.getYamlDocument(document);
    if (!doc || doc.documents.length === 0) {
      return null;
    }

    let results = [];
    for (const yamlDoc of doc.documents) {
      if (yamlDoc.root) {
        results = results.concat(this.jsonDocumentSymbols.findDocumentSymbols(document, yamlDoc));
      }
    }

    return results;
  }

  public findHierarchicalDocumentSymbols(document: TextDocument): DocumentSymbol[] {
    const doc = yamlDocumentsCache.getYamlDocument(document);
    if (!doc || doc.documents.length === 0) {
      return null;
    }

    let results = [];
    for (const yamlDoc of doc.documents) {
      if (yamlDoc.root) {
        results = results.concat(this.jsonDocumentSymbols.findDocumentSymbols2(document, yamlDoc));
      }
    }

    return results;
  }
}
