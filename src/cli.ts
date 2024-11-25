import cac from 'cac';

import { generate } from './generate';
import { version } from '../package.json';

const cli = cac();

cli
  .command('<spec>', 'Generating msw mock definitions with random fake data.')
  .option('-o, --output <directory>', `Output to a folder.`)
  .option('--camel', `Transform request/response type to camelCase. e.g. myVISACard -> myVisaCard`)
  .option('--handler-name <ts-file-name>', `Output handler file name. e.g. handlers.ts`)
  .option(
    '--related-model-path <directory>',
    `Path to request / response model folder or file (export all models) related to handler file location. e.g. ../api/models`,
  )
  .option('-m, --max-array-length <number>', `Max array length, default to 20.`)
  .option(
    '-t, --includes <keywords>',
    `Include the request path with given string, can be separated with comma. e.g. keyword1,*keyword2, *keyword3*`,
  )
  .option(
    '-e, --excludes <keywords>',
    `Exclude the request path with given string, can be separated with comma. e.g. keyword1,*keyword2, *keyword3*`,
  )
  .option('--base-url [baseUrl]', `Use the one you specified or server url in OpenAPI description as base url.`)
  .example(
    'msw-auto-mock-ts ./mock/openapi.json -o ./mock --handler-name openapiHandler.ts --camel --related-model-path ../axios-client-openapi/api',
  )
  .example(
    'msw-auto-mock-ts ./mock/openapi.json -o ./mock --handler-name openapiHandler.ts --camel --related-model-path ../axios-client-openapi/api -t /api/v1/trans/getProducts',
  )
  .action(async (spec, options) => {
    await generate(spec, options).catch(console.error);
  });

cli.help();
cli.version(version);

cli.parse();
