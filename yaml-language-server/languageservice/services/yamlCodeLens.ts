import { TextDocument } from 'vscode-languageserver-textdocument';
import { CodeLens, Range } from 'vscode-languageserver-types';
import { CodeLensParams } from 'vscode-languageserver-protocol';
import { YamlCommands } from '../../commands';
import { isActive } from '../../is-active';
import { schemaVersion, schemaWarning } from '../../../extension/json-schema-content-provider';
import { YAMLSchemaService } from './yamlSchemaService';
// import { URI } from 'vscode-uri';
// import { yamlDocumentsCache } from '../parser/yaml-documents';
// import { JSONSchema, JSONSchemaRef } from '../jsonSchema';
// import { isBoolean } from '../utils/objects';

// const STACKTAPE_CONFIGURATION_VERSION = 'latest';
const externalLinkLens: { title: string; url: string }[] = [
  {
    title: 'Create new Stacktape issue',
    url: 'https://github.com/stacktape/stacktape/issues/new'
  },
  {
    title: 'AWS docs',
    url: 'https://docs.aws.amazon.com/'
  },
  {
    title: 'AWS console',
    url: 'https://console.aws.amazon.com/'
  }
];

export class YamlCodeLens {
  constructor(private schemaService: YAMLSchemaService) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async getCodeLens(document: TextDocument, params: CodeLensParams): Promise<CodeLens[]> {
    // const yamlDocument = yamlDocumentsCache.getYamlDocument(document);
    if (!isActive(document.uri)) {
      return [];
    }

    const links = [
      {
        title: `Using Stacktape version ${schemaVersion}`,
        url: 'https://docs.stacktape.com'
      },
      ...externalLinkLens
    ];
    if (schemaWarning) {
      links.unshift({ title: `⚠️ ${schemaWarning}`, url: 'https://docs.stacktape.com' });
    }
    return links.map((linkData) => {
      const lens = CodeLens.create(Range.create(0, 0, 0, 0));
      lens.command = {
        title: linkData.title,
        command: YamlCommands.OPEN_EXTERNAL_LINK,
        arguments: [linkData.url]
      };
      return lens;
    });
  }
  resolveCodeLens(param: CodeLens): Thenable<CodeLens> | CodeLens {
    return param;
  }
}

// function getCommandTitle(url: string, schema: JSONSchema): string {
//   const uri = URI.parse(url);
//   let baseName = path.basename(uri.fsPath);
//   if (!path.extname(uri.fsPath)) {
//     baseName += '.json';
//   }
//   if (Object.getOwnPropertyDescriptor(schema, 'name')) {
//     return `${Object.getOwnPropertyDescriptor(schema, 'name').value} (${baseName})`;
//   }
//   if (schema.title) {
//     return `${schema.title} (${baseName})`;
//   }

//   return baseName;
// }

// function getSchemaUrl(schema: JSONSchema): Map<string, JSONSchema> {
//   const result = new Map<string, JSONSchema>();
//   if (!schema) {
//     return result;
//   }
//   const url = schema.url;
//   if (url) {
//     if (url.startsWith('schemaservice://combinedSchema/')) {
//       addSchemasForOf(schema, result);
//     } else {
//       result.set(schema.url, schema);
//     }
//   } else {
//     addSchemasForOf(schema, result);
//   }
//   return result;
// }

// function addSchemasForOf(schema: JSONSchema, result: Map<string, JSONSchema>): void {
//   if (schema.allOf) {
//     addInnerSchemaUrls(schema.allOf, result);
//   }
//   if (schema.anyOf) {
//     addInnerSchemaUrls(schema.anyOf, result);
//   }
//   if (schema.oneOf) {
//     addInnerSchemaUrls(schema.oneOf, result);
//   }
// }

// function addInnerSchemaUrls(schemas: JSONSchemaRef[], result: Map<string, JSONSchema>): void {
//   for (const subSchema of schemas) {
//     if (!isBoolean(subSchema)) {
//       if (subSchema.url && !result.has(subSchema.url)) {
//         result.set(subSchema.url, subSchema);
//       }
//     }
//   }
// }
