# msw-auto-mock-ts

![npm](https://img.shields.io/npm/v/msw-auto-mock-ts)
![npm](https://img.shields.io/npm/dw/msw-auto-mock-ts)

A cli tool to generate random typescript mock data from OpenAPI specification for [msw](https://github.com/mswjs/msw).

## Why

Since we already have all the type definitions from the OpenAPI specification, manually writing each response resolver is entirely unnecessary.


## Getting Started

We typically use tools like [openapi-generator-cli](https://openapi-generator.tech/docs/installation/) to create an HTTP client based on OpenAPI specification. These tools also generate all the necessary request and response models. Our goal is to reuse those models and automatically mock all API response data. Assuming we already have all the request and response models in our project, let’s see how it works.

## Usage

**This tool also requires @faker-js/faker >= 8 and msw >= 2.**

Install:

```sh
npm add msw-auto-mock-ts @faker-js/faker -D
```


Read from your OpenAPI specification, locate the models folder or file (relative to the output path), and then generate the output code:


```sh
# can be http url or a file path on your machine, support both yaml and json.
npx msw-auto-mock-ts http://your_openapi.json -o ./mock --related-model-path ../api/models -camel --handler-name openApiHandler.ts
```


Then we will get a handler file such as 'openApiHandler.ts' which contains all mocked APIs and responses like below:

```typescript
export const openApiHandler = [
  http.post<never, ApiReqBaseWalletTransferReq>(
    `${baseURL}/api/v1/trans/walletTransfer`,
    async ({ request }) => {
      const req = await request.json();

      // modify walletTransferHandler function to override the response
      const response = await walletTransferHandler(req);
      if (response) {
        return response;
      }

      const res = await getWalletTransfer200Response();
      return HttpResponse.json<ApiResBaseWalletTransferRes>(res);
    },
  )
  // others ...
]
```

It also creates an override handler, such as 'walletTransferHandler' in the example, allowing users to add customized responses. The override handler file is located in a subfolder and will not be overwritten unless the file is deleted before regenerating mock data.


```typescript
const walletTransferHandler = async (request: ApiReqBaseWalletTransferReq) => {
  // disable this handler
  return null;

  // await delay(200);

  // return new HttpResponse(null, {
  //   status: 500,
  //   statusText: "Internal Server Error",
  // });

  // const response: ApiResBaseWalletTransferRes = { };
  // return HttpResponse.json<ApiResBaseWalletTransferRes>(response);
};

export default walletTransferHandler;

```


The final step is to use 'openApiHandler.ts' to integrate with msw, see [Mock Service Worker's doc](https://mswjs.io/docs/getting-started/integrate/browser) for more detail.

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
