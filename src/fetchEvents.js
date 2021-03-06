/* eslint-disable import/prefer-default-export */
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

import fetch from 'node-fetch';
import log from 'npmlog';
import GeoJSON from 'geojson';

const ddbClient = new DynamoDBClient({ region: 'us-west-2' });
const s3Client = new S3Client({ region: 'us-west-2' });

const fireState = 'US-WA';
const daysBack = 5;

// Grab some attributes from the fire
async function parseArcGisFire(fire) {
  const parsedFire = {};

  // Location
  parsedFire.latitude = fire.attributes.InitialLatitude;
  parsedFire.longitude = fire.attributes.InitialLongitude;

  // Timeline
  parsedFire.startTime = fire.attributes.FireDiscoveryDateTime;
  parsedFire.lastUpdate = fire.attributes.ModifiedOnDateTime_dt;
  parsedFire.containmentTime = fire.attributes.ContainmentDateTime;
  parsedFire.controlTime = fire.attributes.ControlDateTime;
  parsedFire.outTime = fire.attributes.FireOutDateTime;

  // Metadata
  parsedFire.uniqueFireId = fire.attributes.UniqueFireIdentifier;
  parsedFire.incidentName = fire.attributes.IncidentName;
  parsedFire.globalUID = fire.attributes.GlobalID;

  // Details
  parsedFire.discoveryAcres = fire.attributes.DiscoveryAcres;
  parsedFire.dailyAcres = fire.attributes.DailyAcres;
  parsedFire.initialResponseAcres = fire.attributes.InitialResponseAcres;

  parsedFire.causeType = fire.attributes.FireCause;
  parsedFire.causeDetail = fire.attributes.FireCauseGeneral;
  parsedFire.causeSubDetail = fire.attributes.FireCauseSpecific;

  const input = {
    TableName: process.env.firesTableName,
    Item: marshall(parsedFire),
  };

  const command = new PutItemCommand(input);
  await ddbClient.send(command);

  // geojson expects a title, which doesn't need to go to ddb
  parsedFire.title = `${parsedFire.incidentName} - ${parsedFire.uniqueFireId}`;

  return parsedFire;
}

function constructArcGisUrl() {
  const previousDate = new Date();
  previousDate.setDate(previousDate.getDate() - daysBack);

  return encodeURIComponent(`POOState = '${fireState}' AND ModifiedOnDateTime_dt >= TIMESTAMP '${previousDate.getMonth() + 1}-${previousDate.getDate()}-${previousDate.getFullYear()} 0:00:0'`);
}

export async function handler() {
  let features;

  await fetch(`https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/CY_WildlandFire_Locations_ToDate/FeatureServer/0/query?where=${constructArcGisUrl()}&outFields=*&outSR=4326&f=json`)
    .then((res) => res.json())
    .then((json) => {
      features = json.features;
    })
    .catch((err) => {
      log.error('FETCH', JSON.stringify(err));

      return {
        statusCode: 500,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Failure.',
      };
    });

  const fires = await Promise.all(features.map(parseArcGisFire));

  const geojson = GeoJSON.parse(fires, { Point: ['latitude', 'longitude'] });

  const s3PutParams = {
    Bucket: process.env.geojsonBucketName,
    Key: 'geojson.json',
    Body: JSON.stringify(geojson),
  };

  const results = await s3Client.send(new PutObjectCommand(s3PutParams)).catch((err) => {
    log.error('S3', JSON.stringify(err));
  });

  log.info('S3 Results', `${JSON.stringify(results)}`);

  log.info('FIRE', `Fire Count: ${fires.length}`);

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/plain' },
    body: `${JSON.stringify(fires[0])}`,
  };
}
