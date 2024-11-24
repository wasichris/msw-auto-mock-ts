import vm from 'node:vm';
import { OpenAPIV3 } from 'openapi-types';
import merge from 'lodash/merge';
import camelCase from 'lodash/camelCase';
import { faker } from '@faker-js/faker';
import { ConfigOptions } from './types';
import { kebabCase, upperFirst } from 'lodash';

const MAX_STRING_LENGTH = 42;

export interface ResponseMap {
  code: string;
  id: string;
  responses?: Record<string, OpenAPIV3.SchemaObject>;
}

export interface Operation {
  verb: string;
  path: string;
  response: ResponseMap[];
  requestBody?: OpenAPIV3.ReferenceObject | OpenAPIV3.RequestBodyObject;
}

export type OperationCollection = Operation[];

export function getResIdentifierName(res: ResponseMap) {
  if (!res.id) {
    return '';
  }
  return camelCase(`get ${res.id}${res.code}Response`);
}

function adjustConsecutiveUppercase(str: string) {
  // use regular expression to find consecutive uppercase letters
  return str.replace(/[A-Z]{2,}/g, match => {
    // first letter uppercase, the rest lowercase
    return match.charAt(0).toUpperCase() + match.slice(1).toLowerCase();
  });
}

export function getRequestType(requestBody: OpenAPIV3.RequestBodyObject, isCamelCase: boolean = false) {
  const type = (requestBody?.content['application/json'] as any).schema['$ref'].split('/').pop();
  return isCamelCase ? upperFirst(camelCase(type)) : type;
}

export function getResType(res: ResponseMap, isCamelCase: boolean = false) {
  const refPath = res.responses?.['application/json'] as any;
  const type = refPath['x-component-ref-path'].split('/').pop();
  return isCamelCase ? upperFirst(camelCase(type)) : type;
}

export function getResTypeFileName(res: ResponseMap, isCamelCase: boolean = false) {
  // case 1: getRESKeyResponse => get-res-key-response
  // case 2: getRESKeyResponse => get-reskey-response (typescript-axios)
  const resType = getResType(res, isCamelCase);
  return kebabCase(isCamelCase ? camelCase(resType) : adjustConsecutiveUppercase(resType));
}

export function getRequestTypeFileName(requestBody: OpenAPIV3.RequestBodyObject, isCamelCase: boolean = false) {
  // case 1: getRESKeyRequest => get-res-key-request
  // case 2: getRESKeyRequest => get-reskey-request (typescript-axios)
  const reqType = getRequestType(requestBody, isCamelCase);
  return kebabCase(isCamelCase ? camelCase(reqType) : adjustConsecutiveUppercase(reqType));
}

export function getOverrideHandlerName(res: ResponseMap, isCamelCase: boolean = false) {
  if (!res.id) {
    return '';
  }

  const id = isCamelCase ? camelCase(res.id) : res.id;
  return `${id}Handler`;
}

export function transformToGenerateResultFunctions(
  operationCollection: OperationCollection,
  baseURL: string,
  options?: ConfigOptions,
): string {
  const context = {
    faker,
    MAX_STRING_LENGTH,
    MAX_ARRAY_LENGTH: options?.maxArrayLength ?? 20,
    baseURL: baseURL ?? '',
    result: null,
  };
  vm.createContext(context);

  return operationCollection
    .map(op =>
      op.response
        .map(r => {
          const name = getResIdentifierName(r);
          if (!name) {
            return '';
          }

          const useFaker = options?.ai?.enable !== true;

          if (useFaker) {
            const fakerResult = transformJSONSchemaToFakerCode(r.responses?.['application/json']);
            if (options?.static) {
              vm.runInContext(`result = ${fakerResult};`, context);
            }

            return [
              `export function `,
              `${name}() { `,
              `return ${options?.static ? JSON.stringify(context.result) : fakerResult} `,
              `};\n`,
            ].join('\n');
          }

          const operationString = JSON.stringify(r.responses?.['application/json'], null, 4);
          return [
            `export async function `,
            `${name}() { `,
            `return await ${options.static ? `withCacheOne(ask)(${operationString})` : `ask(${operationString})`} `,
            `};\n`,
          ].join('\n');
        })
        .join('\n'),
    )
    .join('\n');
}

export function getOverrideHandlerFolderName(handlersFileName: string) {
  const fileNameWithoutExtension = handlersFileName.replace(/\.[^/.]+$/, '');
  return `override${upperFirst(fileNameWithoutExtension)}`;
}

export function removeExtension(filenameWithExtension: string) {
  return filenameWithExtension.replace(/\.[^/.]+$/, '');
}

export function transformToImportOverrideHandlerTypeCode(
  operationCollection: OperationCollection,
  handlersFileName: string,
  isCamelCase: boolean = false,
): string {
  return operationCollection
    .map(op => {
      return `import ${getOverrideHandlerName(op.response[0], isCamelCase)} from './${getOverrideHandlerFolderName(handlersFileName)}/${getOverrideHandlerName(op.response[0], isCamelCase)}';\n`;
    })
    .join(' ')
    .trimEnd();
}

export function transformToImportReqTypeCode(
  operationCollection: OperationCollection,
  modelLocation: string,
  isCamelCase: boolean = false,
): string {
  const isSingleFile = modelLocation[modelLocation.length - 1] !== '/';

  if (isSingleFile) {
    const types = operationCollection
      .map(op => {
        return `${getRequestType(op.requestBody as OpenAPIV3.RequestBodyObject, isCamelCase)},`;
      })
      .join(' ')
      .trimEnd();
    return `import {${types}} from '${modelLocation}';\n`;
  } else {
    return operationCollection
      .map(op => {
        return `import {${getRequestType(op.requestBody as OpenAPIV3.RequestBodyObject, isCamelCase)}} from '${modelLocation}${getRequestTypeFileName(op.requestBody as OpenAPIV3.RequestBodyObject, isCamelCase)}';\n`;
      })
      .join(' ')
      .trimEnd();
  }
}

export function transformToImportResTypeCode(
  operationCollection: OperationCollection,
  modelLocation: string,
  isCamelCase: boolean = false,
): string {
  const isSingleFile = modelLocation[modelLocation.length - 1] !== '/';
  if (isSingleFile) {
    const types = operationCollection
      .map(op => {
        return `${getResType(op.response[0], isCamelCase)},`;
      })
      .join(' ')
      .trimEnd();
    return `import {${types}} from '${modelLocation}';\n`;
  } else {
    return operationCollection
      .map(op => {
        return `import {${getResType(op.response[0], isCamelCase)}} from '${modelLocation}${getResTypeFileName(op.response[0], isCamelCase)}';\n`;
      })
      .join(' ')
      .trimEnd();
  }
}

export function transformToHandlerCode(operationCollection: OperationCollection, isCamelCase: boolean = false): string {
  return operationCollection
    .map(op => {
      return `http.${op.verb}<never,${getRequestType(op.requestBody as OpenAPIV3.RequestBodyObject, isCamelCase)}>(\`\${baseURL}${op.path}\`, async ({request}) => {
        const req = await request.json();

        // modify ${getOverrideHandlerName(op.response[0], isCamelCase)} function to override the response 
        const response = await ${getOverrideHandlerName(op.response[0], isCamelCase)}(req);
        if (response) {
          return response;
        }

        const res = ${op.response
          .filter((_, index) => index === 0)
          .map(response => {
            const identifier = getResIdentifierName(response);
            return `${identifier ? `await ${identifier}()` : 'undefined'}`;
          })}; 
          return HttpResponse.json<${getResType(op.response[0], isCamelCase)}>(res)
        }),\n`;
    })
    .join('  ')
    .trimEnd();
}

function transformJSONSchemaToFakerCode(jsonSchema?: OpenAPIV3.SchemaObject, key?: string): string {
  if (!jsonSchema) {
    return 'null';
  }

  if (jsonSchema.example) {
    if (jsonSchema.example.$ref) {
    }
    return JSON.stringify(jsonSchema.example);
  }

  if (Array.isArray(jsonSchema.type)) {
    return `faker.helpers.arrayElement([${jsonSchema.type
      .map(type => transformJSONSchemaToFakerCode({ ...jsonSchema, type }))
      .join(',')}])`;
  }

  if (jsonSchema.enum) {
    return `faker.helpers.arrayElement(${JSON.stringify(jsonSchema.enum)})`;
  }

  if (jsonSchema.allOf) {
    const { allOf, ...rest } = jsonSchema;
    return transformJSONSchemaToFakerCode(merge({}, ...allOf, rest));
  }

  if (jsonSchema.oneOf) {
    const schemas = jsonSchema.oneOf as OpenAPIV3.SchemaObject[];
    return `faker.helpers.arrayElement([${schemas.map(i => transformJSONSchemaToFakerCode(i))}])`;
  }

  if (jsonSchema.anyOf) {
    const schemas = jsonSchema.anyOf as OpenAPIV3.SchemaObject[];
    return `faker.helpers.arrayElement([${schemas.map(i => transformJSONSchemaToFakerCode(i))}])`;
  }

  switch (jsonSchema.type) {
    case 'string':
      return transformStringBasedOnFormat(jsonSchema, key);
    case 'number':
    case 'integer':
      const params = JSON.stringify({ min: jsonSchema.minimum, max: jsonSchema.maximum });
      if (jsonSchema.minimum || jsonSchema.maxItems) {
        return `faker.number.int(${params})`;
      }
      return `faker.number.int()`;
    case 'boolean':
      return `faker.datatype.boolean()`;
    case 'object':
      if (!jsonSchema.properties && typeof jsonSchema.additionalProperties === 'object') {
        return `[...new Array(5).keys()].map(_ => ({ [faker.lorem.word()]: ${transformJSONSchemaToFakerCode(
          jsonSchema.additionalProperties as OpenAPIV3.SchemaObject,
        )} })).reduce((acc, next) => Object.assign(acc, next), {})`;
      }

      return `{
        ${Object.entries(jsonSchema.properties ?? {})
          .map(([k, v]) => {
            return `${JSON.stringify(k)}: ${transformJSONSchemaToFakerCode(v as OpenAPIV3.SchemaObject, k)}`;
          })
          .join(',\n')}
    }`;
    case 'array':
      return `[...(new Array(faker.number.int({ min: ${jsonSchema.minItems ?? 1}, max: ${
        jsonSchema.maxItems ?? 'MAX_ARRAY_LENGTH'
      } }))).keys()].map(_ => (${transformJSONSchemaToFakerCode(jsonSchema.items as OpenAPIV3.SchemaObject)}))`;
    default:
      return 'null';
  }
}

/**
 * See https://json-schema.org/understanding-json-schema/reference/string.html#built-in-formats
 */
function transformStringBasedOnFormat(schema: OpenAPIV3.NonArraySchemaObject, key?: string) {
  const { format, minLength, maxLength } = schema;
  if (['date-time', 'date', 'time'].includes(format ?? '') || key?.toLowerCase().endsWith('_at')) {
    return `faker.date.past()`;
  } else if (format === 'uuid') {
    return `faker.string.uuid()`;
  } else if (['idn-email', 'email'].includes(format ?? '') || key?.toLowerCase().endsWith('email')) {
    return `faker.internet.email()`;
  } else if (['hostname', 'idn-hostname'].includes(format ?? '')) {
    return `faker.internet.domainName()`;
  } else if (format === 'ipv4') {
    return `faker.internet.ip()`;
  } else if (format === 'ipv6') {
    return `faker.internet.ipv6()`;
  } else if (
    ['uri', 'uri-reference', 'iri', 'iri-reference', 'uri-template'].includes(format ?? '') ||
    key?.toLowerCase().includes('url')
  ) {
    if (['photo', 'image', 'picture'].some(image => key?.toLowerCase().includes(image))) {
      return `faker.image.url()`;
    }
    return `faker.internet.url()`;
  } else if (key?.toLowerCase().endsWith('name')) {
    return `faker.person.fullName()`;
  } else {
    if (minLength && maxLength) {
      return `faker.string.alpha({ length: { min: ${minLength}, max: ${maxLength} }})`;
    } else if (minLength) {
      return `faker.string.alpha({ length: { min: ${minLength}, max: MAX_STRING_LENGTH }})`;
    } else if (maxLength) {
      return `faker.string.alpha({ length: { min: 0, max: ${maxLength} }})`;
    } else {
      return `faker.lorem.words()`;
    }
  }
}
