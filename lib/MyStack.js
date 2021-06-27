import * as sst from "@serverless-stack/resources";

export default class MyStack extends sst.Stack {
  constructor(scope, id, props) {
    super(scope, id, props);

    // Construct the DDB table for our fire info
    const table = new sst.Table(this, "Fires", {
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
      primaryIndex: { partitionKey: "uniqueFireId" },
    });

    const notificationsTable = new sst.Table(this, "UserNotifications", {
      fields: {
        phone: sst.TableFieldType.STRING,
        lastNotificationTime: sst.TableFieldType.NUMBER,
      },
      primaryIndex: { partitionKey: "phone", sortKey: "lastNotificationTime" }
    });

    if (process.env.IS_LOCAL) {
      // Create a HTTP API
      const api = new sst.Api(this, "Api", {
        defaultFunctionProps: {
          // Pass in the table name to our API
          environment: {
            firesTableName: table.dynamodbTable.tableName,
            usersTableName: notificationsTable.tableName,
          },
        },
        routes: {
          "GET /fires": "src/fetchEvents.handler",
          "GET /notify": "src/notifyUsers.handler",
        },
      });
      api.attachPermissions([table, notificationsTable]);

      this.addOutputs({
        "ApiEndpoint": api.url
      });
    }

    const cron = new sst.Cron(this, "FireWatch", {
      schedule: "rate(8 hours)",
      job: {
        handler: "src/fetchEvents.handler",
        environment: {
          firesTableName: table.dynamodbTable.tableName,
        },
      }
    });

    cron.attachPermissions([table]);

    // Show the table arn in build output
    this.addOutputs({
      "FiresARN": table.tableArn,
    });
  }
}
