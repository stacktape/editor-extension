import * as JsonParser from 'vscode-json-languageservice/lib/umd/parser/jsonParser';
import { JSONSchema } from '../jsonSchema';
import { IApplicableSchema, getNodePath } from '../parser/jsonParser07';
import { ASTNode } from '../jsonASTTypes';
import { getDirectiveName, getIsDirective } from './directives';

export function getSchemaTypeName(schema: JSONSchema): string {
  if (schema.$id) {
    const type = getSchemaRefTypeTitle(schema.$id);
    return type;
  }
  if (schema.$ref || schema._$ref) {
    const type = getSchemaRefTypeTitle(schema.$ref || schema._$ref);
    return type;
  }
  const typeStr = schema.title || (Array.isArray(schema.type) ? schema.type.join(' | ') : schema.type); // object
  return typeStr;
}

/**
 * Get type name from reference url
 * @param $ref reference to the same file OR to the another component OR to the section in another component:
 * `schema-name.schema.json` -> schema-name
 * `custom-scheme://shared-schema.json#/definitions/SomeType` -> SomeType
 * `custom-scheme://schema-name.schema.json` -> schema-name
 * `shared-schema.schema.json#/definitions/SomeType` -> SomeType
 * `file:///Users/user/Documents/project/schemas/schema-name.schema.json` -> schema-name
 * `#/definitions/SomeType` -> SomeType
 * `#/definitions/io.k8s.api.apps.v1.DaemonSetSpec` => io.k8s.api.apps.v1.DaemonSetSpec
 * `file:///default_schema_id.yaml` => default_schema_id.yaml
 * test: https://regex101.com/r/ZpuXxk/1
 */
export function getSchemaRefTypeTitle($ref: string): string {
  const match = $ref.match(/^(?:.*\/)?(.*?)(?:\.schema\.json)?$/);
  let type = !!match && match[1];
  if (!type) {
    type = 'typeNotFound';
    console.error(`$ref (${$ref}) not parsed properly`);
  }
  return type;
}

export const getPropertyDetails = (matchingSchemas: IApplicableSchema[], node: ASTNode) => {
  let title: string | undefined;
  let defaultValue: string;
  let markdownDescription: string | undefined;
  let markdownEnumValueDescription: string | undefined;
  let enumValue: string | undefined;
  matchingSchemas.forEach((matchingSchema) => {
    if (matchingSchema.node === node && !matchingSchema.inverted && matchingSchema.schema) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const ref = matchingSchema.schema._$ref;
      const defaultCandidate = matchingSchema.schema.default;
      defaultValue = typeof defaultCandidate === 'string' ? defaultCandidate : defaultCandidate?.[0]?.text;
      title = title || matchingSchema.schema.title || (ref ? ref.slice(14) : undefined);
      markdownDescription =
        markdownDescription ||
        matchingSchema.schema.markdownDescription ||
        toMarkdown(matchingSchema.schema.description);
      if (matchingSchema.schema.enum) {
        const idx = matchingSchema.schema.enum.indexOf(JsonParser.getNodeValue(node));
        if (matchingSchema.schema.markdownEnumDescriptions) {
          markdownEnumValueDescription = matchingSchema.schema.markdownEnumDescriptions[idx];
        } else if (matchingSchema.schema.enumDescriptions) {
          markdownEnumValueDescription = toMarkdown(matchingSchema.schema.enumDescriptions[idx]);
        }
        if (markdownEnumValueDescription) {
          enumValue = matchingSchema.schema.enum[idx];
          if (typeof enumValue !== 'string') {
            enumValue = JSON.stringify(enumValue);
          }
        }
      }
    }
  });

  let propertyDescription = '';
  if (markdownDescription) {
    if (propertyDescription.length > 0) {
      propertyDescription += '\n\n';
    }
    propertyDescription += markdownDescription;
  }
  if (markdownEnumValueDescription) {
    if (propertyDescription.length > 0) {
      propertyDescription += '\n\n';
    }
    propertyDescription += `${enumValue}: ${markdownEnumValueDescription}`;
  }

  const prettyDescription = getPrettyDescription({ defaultValue, node, propertyDescription, propertyName: title });

  return { prettyDescription, defaultValue, enumValue, title };
};

const builtInDirectives = [
  'CliArgs',
  'File',
  'Format',
  'Var',
  'Stage',
  'Region',
  'Profile',
  'This',
  'GitInfo',
  'StackOutput',
  'ResourceParam',
  'CfResourceParam',
  'Secret',
  'CfFormat',
  'CfStackOutput'
];

export const getPrettyDescription = ({
  defaultValue,
  propertyDescription,
  node,
  propertyName
}: {
  propertyName: string;
  propertyDescription: string;
  defaultValue: any;
  node: ASTNode;
}) => {
  let directiveLine = '';
  if (typeof node.value === 'string' && getIsDirective(node.value)) {
    const directiveName = getDirectiveName(node.value);
    directiveLine += '\n\nThis property uses a directive. Directive used:\n';
    directiveLine += builtInDirectives.includes(directiveName)
      ? `${DOCS_BASE}/configuration/directives/#${directiveName.toLowerCase()}`
      : `${DOCS_BASE}/configuration/variables-and-reuse/#custom-directives`;
  }
  if (['type', 'properties'].includes(propertyName) && !propertyDescription) {
    return 'Documentation: https://docs.stacktape.com';
  }

  try {
    const [shortDescription, longDescription, docsLink] = propertyDescription.split('---');
    const description = getDescription(shortDescription, longDescription, node);
    const defaultValueLine = defaultValue ? `\n\n*Default*: **${defaultValue}**` : '';
    const docsLinkLine = `\n\nDocumentation: ${docsLink || getDocumentationLinkFromNode(node)}`;
    return `${description}${defaultValueLine}${docsLinkLine}${directiveLine}`;
  } catch (err) {
    // console.log(err.message);
    // console.log(err.stack);
    return 'Documentation: https://docs.stacktape.com';
  }
};

const toMarkdown = (plain: string | undefined): string | undefined => {
  if (plain) {
    return plain;
    // const res = plain.replace(/([^\n\r])(\r?\n)([^\n\r])/gm, '$1\n\n$3'); // single new lines to \n\n (Markdown paragraph)
    // return res.replace(/[\\`*_{}[]()#+\-.!]/g, '\\$&'); // escape markdown syntax tokens: http://daringfireball.net/projects/markdown/syntax#backslash
  }
  return undefined;
};

const parsePropertyDescription = (propertyDescription: string) => {
  const [shortDescription, longDescription, docsLink] = propertyDescription.split('---');
  return { shortDescription, longDescription, docsLink };
};

const getDescription = (shortDescription: string, longDescription: string, node: ASTNode) => {
  const pathParts = getNodePath(node as any)
    .toString()
    .split(',');
  if (pathParts[0] === 'variables') {
    const { shortDescription: sd, longDescription: ld } = parsePropertyDescription(
      toMarkdown(`**Declares variables, that can be used for different properties**
    ---
    - Variables can be accessed using $Var().{variable-name}
    - Variables are helpful, when you want to use the same value for multiple properties in your configuration.
    - Example variable: \`dbAddress: $ResourceParam('myDatabase', 'host')\``)!
    );
    return `${sd}\n\n${ld}`;
  }

  const shortDescriptionLine = shortDescription?.length ? `**${shortDescription.replace('####', '').trim()}**` : '';
  const longDescriptionLine = longDescription?.length ? `\n\n${longDescription}` : '';
  return `${shortDescriptionLine}${longDescriptionLine}`;
};

export const DOCS_BASE = 'https://docs.stacktape.com';

// docs.stacktape.com always uses a trailing slash.
const toDocsUrl = (path: string) => `${DOCS_BASE}/${path}/`;

// Resource `type` -> docs path (relative to DOCS_BASE). `null` = no dedicated page exists.
// Renames are NOT mechanical (e.g. function -> compute/lambda-function, bucket -> storage/s3-bucket),
// so this is an explicit lookup table rather than a category + pluralize heuristic.
const resourceTypeToDocsPath: Record<string, string | null> = {
  // Compute
  function: 'resources/compute/lambda-function',
  'web-service': 'resources/compute/web-service',
  'worker-service': 'resources/compute/worker-service',
  'private-service': 'resources/compute/private-service',
  'multi-container-workload': 'resources/compute/multi-container-workload',
  'batch-job': 'resources/compute/batch-job',
  'edge-lambda-function': 'resources/compute/edge-function',
  // Frontend
  'nextjs-website': 'resources/frontend/nextjs',
  'hosting-bucket': 'resources/frontend/static-hosting',
  // Databases
  'relational-database': 'resources/databases/relational-database',
  'dynamo-db-table': 'resources/databases/dynamodb',
  'redis-cluster': 'resources/databases/redis',
  'open-search-domain': 'resources/databases/opensearch',
  'mongo-db-atlas-cluster': 'resources/databases/mongodb-atlas',
  'upstash-redis': 'resources/databases/upstash-redis',
  'upstash-kafka-topic': null,
  // Storage
  bucket: 'resources/storage/s3-bucket',
  'efs-filesystem': 'resources/storage/efs-filesystem',
  // Networking
  cdn: 'resources/networking/cdn',
  'application-load-balancer': 'resources/networking/application-load-balancer',
  'network-load-balancer': 'resources/networking/network-load-balancer',
  'http-api-gateway': 'resources/networking/http-api-gateway',
  'domain-and-certificate': 'resources/networking/custom-domains',
  // Messaging
  'sqs-queue': 'resources/messaging/sqs-queue',
  'sns-topic': 'resources/messaging/sns-topic',
  'event-bus': 'resources/messaging/event-bus',
  // Orchestration
  'state-machine': 'resources/orchestration/state-machine',
  // Security
  bastion: 'resources/security/bastion-host',
  'user-auth-pool': 'resources/security/user-auth-pool',
  'web-app-firewall': 'resources/security/web-application-firewall',
  secret: 'configuration/secrets',
  // Advanced / other
  'deployment-script': 'resources/advanced/deployment-scripts',
  'kubernetes-cluster': null
};

// Trigger event `type` -> dedicated trigger docs page (events are no longer page anchors).
const eventTypeToDocsPath: Record<string, string> = {
  'http-api-gateway': 'resources/triggers/http-triggers',
  'application-load-balancer': 'resources/triggers/http-triggers',
  'network-load-balancer': 'resources/triggers/http-triggers',
  schedule: 'resources/triggers/schedule-triggers',
  s3: 'resources/triggers/s3-events',
  sns: 'resources/triggers/sns-events',
  sqs: 'resources/triggers/sqs-events',
  'event-bus': 'resources/triggers/event-bus-events',
  'kinesis-stream': 'resources/triggers/kinesis-events',
  'dynamo-db-stream': 'resources/triggers/dynamodb-streams',
  'kafka-topic': 'resources/triggers/kafka-topics',
  'cloudwatch-log': 'resources/triggers/cloudwatch-logs'
};

// Packaging `type` -> dedicated packaging docs page.
const packagingTypeToDocsPath: Record<string, string> = {
  'stacktape-lambda-buildpack': 'packaging/function/stacktape-buildpack',
  'custom-artifact': 'packaging/function/custom-artifact',
  'stacktape-image-buildpack': 'packaging/containers/stacktape-buildpack',
  'custom-dockerfile': 'packaging/containers/custom-dockerfile',
  'prebuilt-image': 'packaging/containers/prebuilt-image',
  'external-buildpack': 'packaging/containers/external-buildpack',
  nixpacks: 'packaging/containers/nixpacks'
};

export const getResourceLink = (resourceType: string) => {
  const path = resourceTypeToDocsPath[resourceType];
  return path ? toDocsUrl(path) : DOCS_BASE;
};

const getDocumentationLinkFromNode = (node: ASTNode) => {
  const pathParts = getNodePath(node as any)
    .toString()
    .split(',');
  if (pathParts[0] === 'hooks') {
    return `${DOCS_BASE}/configuration/hooks-and-scripts/`;
  }
  if (pathParts[0] === 'deploymentConfig') {
    return `${DOCS_BASE}/deployment-and-lifecycle/`;
  }
  if (pathParts[0] === 'directives') {
    return `${DOCS_BASE}/configuration/variables-and-reuse/#custom-directives`;
  }
  if (pathParts[0] === 'variables') {
    return `${DOCS_BASE}/configuration/variables-and-reuse/`;
  }
  if (pathParts[0] === 'resources') {
    const resourceType = getResourceTypeFromNode(node);
    const baseResourceLink = getResourceLink(resourceType);
    if (pathParts.includes('events')) {
      const eventType = getEventTypeFromNode(node);
      const eventPath = eventType ? eventTypeToDocsPath[eventType] : undefined;
      return eventPath ? toDocsUrl(eventPath) : `${DOCS_BASE}/resources/triggers/overview/`;
    }
    if (pathParts.includes('packaging')) {
      const packagingType = getPackagingTypeFromNode(node);
      const packagingPath = packagingType ? packagingTypeToDocsPath[packagingType] : undefined;
      return packagingPath ? toDocsUrl(packagingPath) : `${DOCS_BASE}/packaging/overview/`;
    }
    return baseResourceLink;
  }

  return DOCS_BASE;
};

const getTypeNodeValueFromNode = (node: ASTNode) => {
  const props =
    ((node as any).properties || []).map((p) => ({
      keyNodeValue: p.keyNode.value,
      valueNodeValue: p.valueNode.value,
      type: p.type
    })) || [];
  return props.find((p) => p.keyNodeValue === 'type')?.valueNodeValue;
};

const getEventTypeFromNode = (node: ASTNode): string => {
  const value = getTypeNodeValueFromNode(node);
  if (value && !eventTypes.includes(value)) {
    return null;
  }
  if (value) {
    const remap = { 'http-api-gateway': 'http-api' };
    return remap[value] || value;
  }
  return node.parent ? getEventTypeFromNode(node.parent) : null;
};

const getPackagingTypeFromNode = (node: ASTNode): string => {
  const value = getTypeNodeValueFromNode(node);
  if (value && !packagingTypes.includes(value)) {
    return null;
  }
  if (value) {
    return value;
  }
  return node.parent ? getPackagingTypeFromNode(node.parent) : null;
};

const eventTypes = [
  'kinesis-stream',
  'sqs',
  'sns',
  'workload-internal',
  'http-api-gateway',
  'application-load-balancer',
  'dynamo-db-stream',
  's3',
  'cloudwatch-log',
  'schedule',
  'iot',
  'event-bus',
  'kafka-topic'
] as const;

const packagingTypes = [
  'stacktape-image-buildpack',
  'external-buildpack',
  'custom-dockerfile',
  'prebuilt-image',
  'custom-artifact',
  'stacktape-lambda-buildpack',
  'nixpacks'
] as const;

const rdsEngines = [
  'postgres',
  'mysql',
  'mariadb',
  'oracle-ee',
  'oracle-se2',
  'sqlserver-ee',
  'sqlserver-ex',
  'sqlserver-se',
  'sqlserver-web'
] as const;
const auroraEngines = ['aurora-postgresql', 'aurora-mysql'] as const;
const auroraServerlessEngines = [
  'aurora-postgresql-serverless',
  'aurora-mysql-serverless',
  'aurora-postgresql-serverless-v2',
  'aurora-mysql-serverless-v2'
] as const;
const relationalDatabaseEngines = [...rdsEngines, ...auroraEngines, ...auroraServerlessEngines] as const;

const getResourceTypeFromNode = (node: ASTNode): string => {
  const value = getTypeNodeValueFromNode(node);
  if (value) {
    let upperValue;
    if (relationalDatabaseEngines.includes(value) || eventTypes.includes(value) || packagingTypes.includes(value)) {
      upperValue = getResourceTypeFromNode(node.parent);
    }
    const remap = {
      'custom-resource-definition': 'custom-resource',
      'custom-resource-instance': 'custom-resource'
    };
    const valueToUse = upperValue || value;
    return remap[valueToUse] || valueToUse;
  }
  if (!node.parent) {
    return null;
  }

  return getResourceTypeFromNode(node.parent);
};
