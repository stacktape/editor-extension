import { Diagnostic, DiagnosticSeverity, Range } from 'vscode-languageserver-types';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ASTNode } from '../jsonASTTypes';
import type { SingleYAMLDocument } from '../parser/yamlParser07';
import { getIsDirective } from './directives';

export type RefKind = 'resource' | 'variable';

const STACKTAPE_SOURCE = 'Stacktape';

// Directive name -> which top-level map its first argument references.
const DIRECTIVE_REF_KIND: Record<string, RefKind> = {
  ResourceParam: 'resource',
  CfResourceParam: 'resource',
  Var: 'variable'
};

const MAP_KEY: Record<RefKind, string> = { resource: 'resources', variable: 'variables' };

// Matches `$Name('arg` / `$Name("arg`, capturing the directive name and the first
// (possibly partial) quoted argument. Used to find references inside a scalar value.
const DIRECTIVE_CALL_RE = /\$(\w+)\(\s*['"]([^'"]+)/g;

interface DirectiveRef {
  kind: RefKind;
  name: string;
  argStart: number; // offset of the argument within the scalar string
  argEnd: number;
}

const parseDirectiveRefs = (scalar: string): DirectiveRef[] => {
  const refs: DirectiveRef[] = [];
  DIRECTIVE_CALL_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((match = DIRECTIVE_CALL_RE.exec(scalar)) !== null) {
    const kind = DIRECTIVE_REF_KIND[match[1]];
    if (!kind) {
      continue;
    }
    const name = match[2];
    const argStart = match.index + match[0].length - name.length;
    refs.push({ kind, name, argStart, argEnd: argStart + name.length });
  }
  return refs;
};

// member name -> its key node, for a top-level map (resources / variables).
const getDefinedNames = (root: ASTNode | undefined, mapKey: string): Map<string, ASTNode> => {
  const result = new Map<string, ASTNode>();
  if (!root || root.type !== 'object') {
    return result;
  }
  const mapProp = root.properties.find((p) => p.keyNode.value === mapKey);
  const mapNode = mapProp?.valueNode;
  if (mapNode && mapNode.type === 'object') {
    for (const property of mapNode.properties) {
      if (typeof property.keyNode.value === 'string') {
        result.set(property.keyNode.value, property.keyNode);
      }
    }
  }
  return result;
};

// Given a resource's name key node, read its `type` value (e.g. 'dynamo-db-table').
const getResourceTypeOfKeyNode = (keyNode: ASTNode): string | undefined => {
  const property = keyNode.parent;
  const valueNode = property && property.type === 'property' ? property.valueNode : undefined;
  if (valueNode && valueNode.type === 'object') {
    const typeValue = valueNode.properties.find((p) => p.keyNode.value === 'type')?.valueNode;
    if (typeValue && typeValue.type === 'string') {
      return typeValue.value;
    }
  }
  return undefined;
};

// Is this string node an item of a `connectTo:` array (which references resources)?
const isConnectToItem = (node: ASTNode): boolean => {
  const array = node.parent;
  if (!array || array.type !== 'array') {
    return false;
  }
  const property = array.parent;
  return !!property && property.type === 'property' && property.keyNode.value === 'connectTo';
};

const visitStrings = (node: ASTNode | undefined, visit: (node: ASTNode) => void): void => {
  if (!node) {
    return;
  }
  if (node.type === 'string') {
    visit(node);
  }
  node.children?.forEach((child) => visitStrings(child, visit));
};

export interface ResolvedReference {
  kind: RefKind;
  name: string;
  targetKeyNode?: ASTNode; // resources.<name> / variables.<name> key node, if defined
  targetType?: string; // resource type, when the target is a resource
}

const resolveReference = (doc: SingleYAMLDocument, kind: RefKind, name: string): ResolvedReference => {
  const targetKeyNode = getDefinedNames(doc.root, MAP_KEY[kind]).get(name);
  return {
    kind,
    name,
    targetKeyNode,
    targetType: targetKeyNode && kind === 'resource' ? getResourceTypeOfKeyNode(targetKeyNode) : undefined
  };
};

/**
 * Diagnostics for directive references ($ResourceParam / $CfResourceParam / $Var) and
 * `connectTo` items that point to a resource/variable not defined in the config.
 */
export const getReferenceDiagnostics = (doc: SingleYAMLDocument, textDocument: TextDocument): Diagnostic[] => {
  const resources = getDefinedNames(doc.root, 'resources');
  const variables = getDefinedNames(doc.root, 'variables');
  const diagnostics: Diagnostic[] = [];

  const addDiagnostic = (kind: RefKind, name: string, offset: number, length: number): void => {
    const defined = kind === 'resource' ? resources : variables;
    // Skip when the map is absent/empty to avoid noise on an incomplete document.
    if (defined.size === 0 || defined.has(name)) {
      return;
    }
    diagnostics.push(
      Diagnostic.create(
        Range.create(textDocument.positionAt(offset), textDocument.positionAt(offset + length)),
        `Unknown ${kind} "${name}" — no ${kind} with this name is defined in this config.`,
        DiagnosticSeverity.Warning,
        undefined,
        STACKTAPE_SOURCE
      )
    );
  };

  visitStrings(doc.root, (node) => {
    const value = node.value as string;
    if (getIsDirective(value)) {
      parseDirectiveRefs(value).forEach((ref) => addDiagnostic(ref.kind, ref.name, node.offset, node.length));
    } else if (isConnectToItem(node) && value) {
      addDiagnostic('resource', value, node.offset, node.length);
    }
  });

  return diagnostics;
};

/**
 * The reference under the given offset (directive argument or connectTo item), if any,
 * resolved to its definition. Used by hover and go-to-definition.
 */
export const getReferenceAtOffset = (doc: SingleYAMLDocument, offset: number): ResolvedReference | undefined => {
  const node = doc.getNodeFromOffset(offset);
  if (!node || node.type !== 'string' || typeof node.value !== 'string') {
    return undefined;
  }
  const value = node.value;
  if (getIsDirective(value)) {
    for (const ref of parseDirectiveRefs(value)) {
      if (offset >= node.offset + ref.argStart && offset <= node.offset + ref.argEnd) {
        return resolveReference(doc, ref.kind, ref.name);
      }
    }
    return undefined;
  }
  if (isConnectToItem(node)) {
    return resolveReference(doc, 'resource', value);
  }
  return undefined;
};

/**
 * When the cursor sits inside the first argument of a resource/variable directive
 * (even an empty/partial one, e.g. `$ResourceParam('`), returns completion candidates:
 * the names defined in the corresponding top-level map, with their resource type.
 */
export interface DirectiveCompletions {
  replaceStart: number; // document offset where the (partial) argument begins
  items: { name: string; detail?: string }[];
}

export const getDirectiveReferenceCompletions = (
  doc: SingleYAMLDocument,
  offset: number
): DirectiveCompletions | undefined => {
  const node = doc.getNodeFromOffset(offset);
  if (!node || node.type !== 'string' || typeof node.value !== 'string') {
    return undefined;
  }
  const before = node.value.slice(0, offset - node.offset);
  const match = /\$(\w+)\(\s*['"]([^'"]*)$/.exec(before);
  if (!match) {
    return undefined;
  }
  const kind = DIRECTIVE_REF_KIND[match[1]];
  if (!kind) {
    return undefined;
  }
  const partial = match[2];
  const items = Array.from(getDefinedNames(doc.root, MAP_KEY[kind]).entries(), ([name, keyNode]) => ({
    name,
    detail: kind === 'resource' ? getResourceTypeOfKeyNode(keyNode) : undefined
  }));
  return { replaceStart: offset - partial.length, items };
};
