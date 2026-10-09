import { Hover, Position } from 'vscode-languageserver-types';
import { JSONHover } from 'vscode-json-languageservice/lib/umd/services/jsonHover';
import { Range } from 'vscode-json-languageservice/lib/umd/jsonLanguageTypes';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { matchOffsetToDocument } from '../utils/arrUtils';
import { LanguageSettings } from '../yamlLanguageService';
import { yamlDocumentsCache } from '../parser/yaml-documents';
import { SingleYAMLDocument } from '../parser/yamlParser07';
import { isActive } from '../../is-active';
import { getPropertyDetails } from '../utils/schemaUtils';
import { getReferenceAtOffset } from '../utils/stacktapeReferences';
// import { printObject } from '../utils/printer';
import { YAMLSchemaService } from './yamlSchemaService';

export class YAMLHover {
  private shouldHover: boolean;
  private jsonHover: JSONHover;
  private schemaService: YAMLSchemaService;

  constructor(schemaService: YAMLSchemaService) {
    this.shouldHover = true;
    this.jsonHover = new JSONHover(schemaService, [], Promise);
    this.schemaService = schemaService;
  }

  public configure(languageSettings: LanguageSettings): void {
    if (languageSettings) {
      this.shouldHover = languageSettings.hover;
    }
  }

  public async doHover(document: TextDocument, position: Position): Promise<Hover> {
    if (!this.shouldHover || !document || !isActive(document.uri)) {
      return Promise.resolve(undefined);
    }
    const doc = yamlDocumentsCache.getYamlDocument(document);
    const offset = document.offsetAt(position);
    const currentDoc = matchOffsetToDocument(offset, doc);
    if (currentDoc === null) {
      return Promise.resolve(undefined);
    }

    const currentDocIndex = doc.documents.indexOf(currentDoc);
    currentDoc.currentDocIndex = currentDocIndex;

    const resourceSchema = await this.schemaService.getSchemaForResource(document.uri);
    let node = currentDoc.getNodeFromOffset(offset);

    const hoverRange = getHoverRange({ currentDoc, document, position });
    if (!hoverRange) {
      return null;
    }

    if (node.type === 'string') {
      const parent = node.parent;
      if (parent && parent.type === 'property' && parent.keyNode === node) {
        node = parent.valueNode;
        if (!node) {
          return null;
        }
      }
    }

    const matchingSchemas = currentDoc.getMatchingSchemas(resourceSchema.schema, node.offset);
    const propDetails = getPropertyDetails(matchingSchemas, node);

    // Stacktape: when hovering a directive argument or connectTo item that references a
    // resource/variable, prepend a line describing (or flagging) the referenced target.
    const reference = getReferenceAtOffset(currentDoc, offset);
    if (reference) {
      const contents = [propDetails.prettyDescription];
      if (reference.targetKeyNode) {
        const typeInfo = reference.targetType ? ` of type \`${reference.targetType}\`` : '';
        contents.unshift(`References ${reference.kind} **${reference.name}**${typeInfo}.`);
      } else {
        contents.unshift(`⚠️ Unknown ${reference.kind} **${reference.name}** — not defined in this config.`);
      }
      return { contents, range: hoverRange };
    }
    // const parentMatchingSchemas = currentDoc.getMatchingSchemas(resourceSchema.schema, node.parent.offset);
    // const parentPropDetails = getPropertyDetails(parentMatchingSchemas, node.parent);
    // const parentParentMatchingSchemas = currentDoc.getMatchingSchemas(resourceSchema.schema, node.parent.parent.offset);
    // const parentParentPropDetails = getPropertyDetails(parentParentMatchingSchemas, node.parent.parent);

    // printObject({ propDetails, parentPropDetails, parentParentPropDetails });

    // if (parentParentPropDetails?.title?.endsWith('Integration')) {
    //   return { contents: [parentPropDetails.prettyDescription], range: hoverRange };
    // }

    return { contents: [propDetails.prettyDescription], range: hoverRange };
  }
}

// const getNode = (node: ASTNode, depth: number): ASTNode => {
//   if (depth === 0) {
//     return node;
//   }
//   return getNode(node.parent, depth - 1);
// };

const getHoverRange = ({
  currentDoc,
  document,
  position
}: {
  document: TextDocument;
  currentDoc: SingleYAMLDocument;
  position: Position;
}) => {
  const offset = document.offsetAt(position);
  const node = currentDoc.getNodeFromOffset(offset);

  if (
    !node ||
    ((node.type === 'object' || node.type === 'array') &&
      offset > node.offset + 1 &&
      offset < node.offset + node.length - 1)
  ) {
    return null;
  }
  return Range.create(document.positionAt(node.offset), document.positionAt(node.offset + node.length));
};
