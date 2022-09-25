import * as sst from '@serverless-stack/resources';
import * as iam from 'aws-cdk-lib/aws-iam';
import { RemovalPolicy } from 'aws-cdk-lib';

export default class MyStack extends sst.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    // Construct the DDB table for our fire info
    const table = new sst.Table(this, 'Fires', {
      fields: {
        latitude: 'number',
        longitude: 'number',

        // Timeline
        startTime: 'number',
        lastUpdate: 'number',
        containmentTime: 'number',
        controlTime: 'number',
        outTime: 'number',

        // Metadata
        uniqueFireId: 'string',
        incidentName: 'string',
        globalUID: 'string',

        // Details
        discoveryAcres: 'number',
        dailyAcres: 'number',
        initialResponseAcres: 'number',

        causeType: 'string',
        causeDetail: 'string',
        causeSubDetail: 'string',
      },
      primaryIndex: { partitionKey: 'uniqueFireId' },
    });

    // Create the DDB table to store info about which phone numbers to notify, and what locations,
    // and when their last notification was sent.
    const notificationsTable = new sst.Table(this, 'UserNotifications', {
      fields: {
        id: 'string',
        phone: 'string',
        lastNotificationTime: 'number',
        hook: 'string',
        token: 'string',
        latitude: 'number',
        longitude: 'number',
      },
      primaryIndex: { partitionKey: 'id', sortKey: 'lastNotificationTime' },
    });

    const policy = new iam.PolicyStatement({
      actions: ['sns:Publish'],
      effect: iam.Effect.ALLOW,
      resources: ['*'], // TODO: Overbroad permissions, almost certainly
    });

    const geojsonBucket = new sst.Bucket(this, 'geojson', {
      cdk: {
        bucket: {
          autoDeleteObjects: true,
          publicReadAccess: true,
          removalPolicy: RemovalPolicy.DESTROY,
        },
      },
    });

    // Don't allow calling these endpoints in prod, but it's convenient to be able to call them
    // directly in dev.
    // TODO: These might not be needed now that there's a fancy new SST debug utility!
    if (process.env.IS_LOCAL) {
      // Create a HTTP API
      const api = new sst.Api(this, 'Api', {
        defaults: {
          function: {
            // Pass in the table name to our API
            environment: {
              firesTableName: table.cdk.table.tableName,
              usersTableName: notificationsTable.tableName,
              geojsonBucketName: geojsonBucket.bucketName,
            },
            runtime: 'nodejs14.x',
          },
        },
        routes: {
          'GET /fires': {
            function: { handler: 'src/fetchEvents.handler' },
          },
          'GET /notify': {
            function: { handler: 'src/notifyUsers.handler' },
          },
        },
      });
      api.attachPermissions([table, notificationsTable, geojsonBucket]);

      api.getFunction('GET /notify').attachPermissions([policy]);
      this.addOutputs({
        ApiEndpoint: api.url,
      });
    }

    const cron = new sst.Cron(this, 'FireWatch', {
      schedule: 'cron(30 15 * * ? *)',
      job: {
        function: {
          handler: 'src/fetchEvents.handler',
          runtime: 'nodejs14.x',
          environment: {
            firesTableName: table.cdk.table.tableName,
            geojsonBucketName: geojsonBucket.bucketName,
          },
        },
      },
    });
    cron.attachPermissions([table, geojsonBucket]);

    const notifier = new sst.Cron(this, 'Notifier', {
      schedule: 'cron(15 16 * * ? *)',
      job: {
        function: {
          handler: 'src/notifyUsers.handler',
          runtime: 'nodejs14.x',
          environment: {
            firesTableName: table.cdk.table.tableName,
            usersTableName: notificationsTable.tableName,
          },
        },
      },
    });
    notifier.attachPermissions([table, notificationsTable, policy]);

    // Show the table arn in build output
    this.addOutputs({
      FiresARN: table.tableArn,
      GeoJSONBucket: geojsonBucket.bucketName,
      GeoJSONBucketArn: geojsonBucket.bucketArn,
    });
  }
}
