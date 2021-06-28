# Wildfire FYI

*This project is best-effort, untested, and shouldn't be relied on for any critical application.
There are no warrantees on the performance, correctness, or reliability. **USE AT YOUR OWN RISK** *

The goal of Wildfire FYI is to provide a mechanism for updating me via SMS when wildfires are close
to remote property. It works by pulling the latest data from the
[National Interagency Fire Center's](https://data-nifc.opendata.arcgis.com/) Wildfire Open Dataset
every 8 hours and storing it for reference/notifications on a rolling basis.

This project is built using the [Serverless Stack](https://docs.serverless-stack.com/packages/create-serverless-stack)
tool.

You will need an AWS account configured on your development box.

To get started:

```bash
$ npm install
$ npx sst start
```

This will deploy a lambda function that opens a websocket to your local box, so you can make changes
without having to redeploy a full stack all the way up to Lambda.

# Serverless Stack (SST)
## Commands

### `npm run start`

Starts the local Lambda development environment.

### `npm run build`

Build your app and synthesize your stacks.

Generates a `.build/` directory with the compiled files and a `.build/cdk.out/` directory with the synthesized CloudFormation stacks.

### `npm run deploy [stack]`

Deploy all your stacks to AWS. Or optionally deploy, a specific stack.

### `npm run remove [stack]`

Remove all your stacks and all of their resources from AWS. Or optionally removes, a specific stack.

### `npm run test`

Runs your tests using Jest. Takes all the [Jest CLI options](https://jestjs.io/docs/en/cli).

## Documentation

Learn more about the Serverless Stack.
- [Docs](https://docs.serverless-stack.com)
- [@serverless-stack/cli](https://docs.serverless-stack.com/packages/cli)
- [@serverless-stack/resources](https://docs.serverless-stack.com/packages/resources)
