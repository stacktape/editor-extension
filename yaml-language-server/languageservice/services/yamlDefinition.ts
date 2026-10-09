import { DefinitionLink, LocationLink, Range, Position } from 'vscode-languageserver-types';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { matchOffsetToDocument } from '../utils/arrUtils';
import { yamlDocumentsCache } from '../parser/yaml-documents';
import { getReferenceAtOffset } from '../utils/stacktapeReferences';
import { isActive } from '../../is-active';

/**
 * Go-to-definition for Stacktape references: a directive argument
 * ($ResourceParam/$CfResourceParam/$Var) or a `connectTo` item jumps to the
 * resources.<name> / variables.<name> key where the target is defined.
 */
export function findDefinition(document: TextDocument, position: Position): DefinitionLink[] {
  if (!isActive(document.uri)) {
    return [];
  }
  const yamlDocument = yamlDocumentsCache.getYamlDocument(document);
  const offset = document.offsetAt(position);
  const currentDoc = matchOffsetToDocument(offset, yamlDocument);
  if (!currentDoc) {
    return [];
  }
  const reference = getReferenceAtOffset(currentDoc, offset);
  if (!reference?.targetKeyNode) {
    return [];
  }
  const target = reference.targetKeyNode;
  const targetRange = Range.create(
    document.positionAt(target.offset),
    document.positionAt(target.offset + target.length)
  );
  return [LocationLink.create(document.uri, targetRange, targetRange)];
}
