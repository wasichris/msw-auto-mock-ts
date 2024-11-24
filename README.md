# msw-auto-mock-ts

![npm](https://img.shields.io/npm/v/msw-auto-mock-ts)
![npm](https://img.shields.io/npm/dw/msw-auto-mock-ts)

A cli tool to generate random typescript mock data from OpenAPI descriptions for [msw](https://github.com/mswjs/msw).

## Why

We already have all the type definitions from OpenAPI spec so hand-writing every response resolver is completely unnecessary.



## Usage

**This tool also requires @faker-js/faker >= 8 and msw >= 2.**

Install:

```sh
npm add msw-auto-mock-ts @faker-js/faker -D
```

Read from your OpenAPI descriptions and output generated code:

```sh
# can be http url or a file path on your machine, support both yaml and json.
npx msw-auto-mock-ts http://your_openapi.json -o ./mock --related-model-path ../api/models -camel --handler-name openApiHandler.ts
```

Integrate with msw, see [Mock Service Worker's doc](https://mswjs.io/docs/getting-started/integrate/browser) for more detail:

## Options

- `-o, --output`: specify output file path or output to stdout.
- `--handler-name <ts-file-name>`: Output handler file name. e.g. handlers.ts
- `--related-model-path <directory>`: Path to request / response model folder or file (export all models) related to handler file location. e.g. ../api/models
- `--camel`: Transform request/response type to camelCase. e.g. myVISACard -> myVisaCard
- `-m, --max-array-length <number>`: specify max array length in response, default value is `20`, it'll cost some time if you want to generate a huge chunk of random data.
- `-t, --includes <keywords>`: specify keywords to match if you want to generate mock data only for certain requests, multiple keywords can be seperated with comma.
- `-e, --excludes <keywords>`: specify keywords to exclude, multiple keywords can be seperated with comma.
- `--base-url`: output code with specified base url or fallback to server host specified in OpenAPI.
- `-h, --help`: show help info.
