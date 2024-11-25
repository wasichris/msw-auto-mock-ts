import * as fs from 'node:fs';
import * as path from 'node:path';

import ApiGenerator, { isReference } from 'oazapfts/generate';
import { OpenAPIV3 } from 'openapi-types';
import camelCase from 'lodash/camelCase';
import { cosmiconfig } from 'cosmiconfig';

import { getV3Doc } from './swagger';
import { prettify, toExpressLikePath } from './utils';
import { getOverrideHandlerName, getOverrideHandlerFolderName, Operation } from './transform';
import {
  browserIntegration,
  mockTemplate,
  nodeIntegration,
  overrideHandlerTemplate,
  reactNativeIntegration,
} from './template';
import { CliOptions, ConfigOptions } from './types';
import { name as moduleName } from '../package.json';

export function generateOperationCollection(apiDoc: OpenAPIV3.Document, options: CliOptions) {
  const apiGen = new ApiGenerator(apiDoc, {});
  const operationDefinitions = getOperationDefinitions(apiDoc);

  return operationDefinitions
    .filter(op => operationFilter(op, options))
    .map(op => codeFilter(op, options))
    .map(definition => toOperation(definition, apiGen));
}

export const defaultHandlerName = 'handlers.ts';

export async function generate(spec: string, inlineOptions: CliOptions) {
  const explorer = cosmiconfig(moduleName);
  const finalOptions: ConfigOptions = {
    ...inlineOptions,
    handlerName: inlineOptions.handlerName ?? defaultHandlerName,
  };

  try {
    const result = await explorer.search();
    if (!result?.isEmpty) {
      Object.assign(finalOptions, result?.config);
    }
  } catch (e) {
    console.log(e);
    process.exit(1);
  }

  const { output: outputFolder } = finalOptions;
  const targetFolder = path.resolve(process.cwd(), outputFolder);

  let code: string;
  const apiDoc = await getV3Doc(spec);
  const operationCollection = generateOperationCollection(apiDoc, finalOptions);

  let baseURL = '';
  if (finalOptions.baseUrl === true) {
    baseURL = getServerUrl(apiDoc);
  } else if (typeof finalOptions.baseUrl === 'string') {
    baseURL = finalOptions.baseUrl;
  }

  code = mockTemplate(operationCollection, baseURL, finalOptions);

  try {
    fs.mkdirSync(targetFolder);
  } catch {}

  // skip it cause it's not necessary for me
  // const handlerModuleName = removeExtension(finalOptions.handlerName!);
  // fs.writeFileSync(path.resolve(process.cwd(), targetFolder, 'native.ts'), reactNativeIntegration(handlerModuleName));
  // fs.writeFileSync(path.resolve(process.cwd(), targetFolder, 'node.ts'), nodeIntegration(handlerModuleName));
  // fs.writeFileSync(path.resolve(process.cwd(), targetFolder, 'browser.ts'), browserIntegration(handlerModuleName));

  // create msw api handler file
  fs.writeFileSync(
    path.resolve(process.cwd(), targetFolder, finalOptions.handlerName!),
    await prettify(finalOptions.handlerName!, code),
  );

  // create override msw api handler folder & files
  createOverrideHandlers(operationCollection, targetFolder, finalOptions);
}

async function createOverrideHandlers(operationCollection: Operation[], targetFolder: string, options: CliOptions) {
  const folderPath = `${targetFolder}/${getOverrideHandlerFolderName(options.handlerName!)}`;
  try {
    fs.mkdirSync(folderPath);
  } catch {}

  operationCollection.forEach(async op => {
    const fileName = `${getOverrideHandlerName(op.id, options.camel)}.ts`;
    const code = overrideHandlerTemplate(op, options);

    // not overwrite if file exists
    const filePath = path.resolve(process.cwd(), folderPath, fileName);
    if (fs.existsSync(filePath)) {
      console.log(`File ${fileName} already exists, skip creating.`);
      return;
    }

    fs.writeFileSync(filePath, await prettify(fileName, code));
  });
}

function getServerUrl(apiDoc: OpenAPIV3.Document) {
  let server = apiDoc.servers?.at(0);
  let url = '';
  if (server) {
    url = server.url;
  }
  if (server?.variables) {
    Object.entries(server.variables).forEach(([key, value]) => {
      url = url.replace(`{${key}}`, value.default);
    });
  }

  return url;
}

const operationKeys = Object.values(OpenAPIV3.HttpMethods) as OpenAPIV3.HttpMethods[];

type OperationDefinition = {
  path: string;
  verb: string;
  responses: OpenAPIV3.ResponsesObject;
  requestBody?: OpenAPIV3.ReferenceObject | OpenAPIV3.RequestBodyObject;
  id: string;
};

function getOperationDefinitions(v3Doc: OpenAPIV3.Document): OperationDefinition[] {
  return Object.entries(v3Doc.paths).flatMap(([path, pathItem]) =>
    !pathItem
      ? []
      : Object.entries(pathItem)
          .filter((arg): arg is [string, OpenAPIV3.OperationObject] => operationKeys.includes(arg[0] as any))
          .map(([verb, operation]) => {
            // Keep the original id naming, because there are multiple uppercase letters connected together,
            // there will be two camelCase conversion methods by openapi-generator (e.g. getAPIKey, getApiKey)
            // especially convert it to filename, e.g. getAPIKey will be get-api-key.ts or get-apikey.ts (typescript-axios)
            // causing the filename loaded to be different, so do not convert here,
            const id = operation.operationId ?? camelCase(verb + '/' + path);
            return {
              path,
              verb,
              id,
              responses: operation.responses,
              requestBody: operation.requestBody,
            };
          }),
  );
}

function matchesWithWildcard(input: string, target: string): boolean {
  const regexPattern = '^' + input.replace(/\*/g, '.*') + '$';
  const regex = new RegExp(regexPattern);
  return regex.test(target);
}

function operationFilter(operation: OperationDefinition, options: CliOptions): boolean {
  const includes = options?.includes?.split(',') ?? null;
  const excludes = options?.excludes?.split(',') ?? null;

  const isNotInclude = includes && !includes?.some(exclude => matchesWithWildcard(exclude, operation.path));
  if (isNotInclude) {
    return false;
  }

  const isExclude = excludes?.some(exclude => matchesWithWildcard(exclude, operation.path));
  if (isExclude) {
    return false;
  }

  return true;
}

function codeFilter(operation: OperationDefinition, options: CliOptions): OperationDefinition {
  const codes = options?.codes?.split(',') ?? null;

  const responses = Object.entries(operation.responses)
    .filter(([code]) => {
      if (codes && !codes.includes(code)) {
        return false;
      }
      return true;
    })
    .map(([code, response]) => ({
      [code]: response,
    }))
    .reduce((acc, curr) => Object.assign(acc, curr), {} as OpenAPIV3.ResponsesObject);

  return {
    ...operation,
    responses,
  };
}

function toOperation(definition: OperationDefinition, apiGen: ApiGenerator): Operation {
  const { verb, path, responses, id } = definition;

  const responseMap = Object.entries(responses).map(([code, response]) => {
    const content = apiGen.resolve(response).content;
    if (!content) {
      return { code, id: '', responses: {} };
    }

    const resolvedResponse = Object.keys(content).reduce(
      (resolved, type) => {
        const schema = content[type].schema;
        if (typeof schema !== 'undefined') {
          resolved[type] = recursiveResolveSchema(schema, apiGen);
        }

        return resolved;
      },
      {} as Record<string, OpenAPIV3.SchemaObject>,
    );

    return {
      code,
      id,
      responses: resolvedResponse,
    };
  });

  return {
    id,
    verb,
    path: toExpressLikePath(path),
    response: responseMap,
    requestBody: definition.requestBody,
  };
}

const resolvingRefs: string[] = [];

function autoPopRefs<T>(cb: () => T) {
  const n = resolvingRefs.length;
  const res = cb();
  resolvingRefs.length = n;
  return res;
}

function resolve(schema: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject, apiGen: ApiGenerator) {
  if (isReference(schema)) {
    if (resolvingRefs.includes(schema.$ref)) {
      console.warn(`circular reference for path ${[...resolvingRefs, schema.$ref].join(' -> ')} found`);
      return {};
    }
    resolvingRefs.push(schema.$ref);
  }
  return { ...apiGen.resolve(schema) };
}

function recursiveResolveSchema(schema: OpenAPIV3.ReferenceObject | OpenAPIV3.SchemaObject, apiGen: ApiGenerator) {
  return autoPopRefs(() => {
    const resolvedSchema = resolve(schema, apiGen) as OpenAPIV3.SchemaObject;

    if (resolvedSchema.type === 'array') {
      resolvedSchema.items = resolve(resolvedSchema.items, apiGen);
      resolvedSchema.items = recursiveResolveSchema(resolvedSchema.items, apiGen);
    } else if (resolvedSchema.type === 'object') {
      if (!resolvedSchema.properties && typeof resolvedSchema.additionalProperties === 'object') {
        if (isReference(resolvedSchema.additionalProperties)) {
          resolvedSchema.additionalProperties = recursiveResolveSchema(
            resolve(resolvedSchema.additionalProperties, apiGen),
            apiGen,
          );
        }
      }

      if (resolvedSchema.properties) {
        resolvedSchema.properties = Object.entries(resolvedSchema.properties).reduce(
          (resolved, [key, value]) => {
            resolved[key] = recursiveResolveSchema(value, apiGen);
            return resolved;
          },
          {} as Record<string, OpenAPIV3.SchemaObject>,
        );
      }
    } else if (resolvedSchema.allOf) {
      resolvedSchema.allOf = resolvedSchema.allOf.map(item => recursiveResolveSchema(item, apiGen));
    } else if (resolvedSchema.oneOf) {
      resolvedSchema.oneOf = resolvedSchema.oneOf.map(item => recursiveResolveSchema(item, apiGen));
    } else if (resolvedSchema.anyOf) {
      resolvedSchema.anyOf = resolvedSchema.anyOf.map(item => recursiveResolveSchema(item, apiGen));
    }

    return resolvedSchema;
  });
}
