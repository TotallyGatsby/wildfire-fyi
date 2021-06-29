import * as sst from '@serverless-stack/resources';
import * as iam from '@aws-cdk/aws-iam';

export default class MyStack extends sst.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    // Construct the DDB table for our fire info
    const table = new sst.Table(this, 'Fires', {
      fields: {
        latitude: sst.TableFieldType.NUMBER,
        longitude: sst.TableFieldType.NUMBER,

        // Timeline
        startTime: sst.TableFieldType.NUMBER,
        lastUpdate: sst.TableFieldType.NUMBER,
        containmentTime: sst.TableFieldType.NUMBER,
        controlTime: sst.TableFieldType.NUMBER,
        outTime: sst.TableFieldType.NUMBER,

        // Metadata
        uniqueFireId: sst.TableFieldType.STRING,
        incidentName: sst.TableFieldType.STRING,
        globalUID: sst.TableFieldType.STRING,

        // Details
        discoveryAcres: sst.TableFieldType.NUMBER,
        dailyAcres: sst.TableFieldType.NUMBER,
        initialResponseAcres: sst.TableFieldType.NUMBER,

        causeType: sst.TableFieldType.STRING,
        causeDetail: sst.TableFieldType.STRING,
        causeSubDetail: sst.TableFieldType.STRING,
      },
      primaryIndex: { partitionKey: 'uniqueFireId' },
    });

    // Create the DDB table to store info about which phone numbers to notify, and what locations,
    // and when their last notification was sent.
    const notificationsTable = new sst.Table(this, 'UserNotifications', {
      fields: {
        phone: sst.TableFieldType.STRING,
        lastNotificationTime: sst.TableFieldType.NUMBER,
      },
      primaryIndex: { partitionKey: 'phone', sortKey: 'lastNotificationTime' },
    });

    const policy = new iam.PolicyStatement({
      actions: ['sns:Publish'],
      effect: iam.Effect.ALLOW,
      resources: '*', // TODO: Overbroad permissions, almost certainly
    });

    // Don't allow calling these endpoints in prod, but it's convenient to be able to call them
    // directly in dev.
    if (process.env.IS_LOCAL) {
      // Create a HTTP API
      const api = new sst.Api(this, 'Api', {
        defaultFunctionProps: {
          // Pass in the table name to our API
          environment: {
            firesTableName: table.dynamodbTable.tableName,
            usersTableName: notificationsTable.tableName,
          },
        },
        routes: {
          'GET /fires': 'src/fetchEvents.handler',
          'GET /notify': 'src/notifyUsers.handler',
        },
      });
      api.attachPermissions([table, notificationsTable]);

      api.getFunction('GET /notify').attachPermissions([policy]);
      this.addOutputs({
        ApiEndpoint: api.url,
      });
    }

    const cron = new sst.Cron(this, 'FireWatch', {
      schedule: 'cron(30 15 * * ? *)',
      job: {
        handler: 'src/fetchEvents.handler',
        environment: {
          firesTableName: table.dynamodbTable.tableName,
        },
      },
    });
    cron.attachPermissions([table]);

    const notifier = new sst.Cron(this, 'Notifier', {
      schedule: 'cron(15 16 * * ? *)',
      job: {
        handler: 'src/notifyUsers.handler',
        environment: {
          firesTableName: table.dynamodbTable.tableName,
          usersTableName: notificationsTable.tableName,
        },
      },
    });
    notifier.attachPermissions([table, notificationsTable, policy]);

    // Show the table arn in build output
    this.addOutputs({
      FiresARN: table.tableArn,
    });
  }
}
