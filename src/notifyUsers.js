/* eslint-disable import/prefer-default-export */
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const ddbClient = new DynamoDBClient({ region: 'us-west-2' });

const earthRadius = 3958.75;
const meterConversion = 1609;
const toRadians = Math.PI / 180;
const kmToMiles = 0.6213711922;

function distanceLatLng(latA, lngA, latB, lngB) {
  const latDiff = toRadians * (latB - latA);
  const lngDiff = toRadians * (lngB - lngA);
  const a = Math.sin(latDiff / 2) * Math.sin(latDiff / 2)
    + Math.cos(toRadians * (latA)) * Math.cos(toRadians * (latB))
    * Math.sin(lngDiff / 2) * Math.sin(lngDiff / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = earthRadius * c;

  return distance * meterConversion;
}

async function getLocationsToNotify() {
  const command = new ScanCommand({
    TableName: process.env.usersTableName,
  });

  const response = await ddbClient.send(command)
    .catch((err) => {
      console.log(err);

      return {
        statusCode: 500,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Failure.',
      };
    });

  return response.Items;
}

async function getActiveFires() {
  const command = new ScanCommand({
    TableName: process.env.firesTableName,
    FilterExpression: 'attribute_not_exists(outTime) or outTime = :null',
    ExpressionAttributeValues: {
      ':null': { NULL: true },
    },
  });

  const response = await ddbClient.send(command)
    .catch((err) => {
      console.log(err);

      return {
        statusCode: 500,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Failure.',
      };
    });

  console.log(`Found ${response.Items.length} active fires of ${response.ScannedCount} total fires.`);

  return response.Items;
}

export async function handler() {
  const locations = await getLocationsToNotify();
  if (!locations) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/plain' },
      body: 'Failure.',
    };
  } if (locations.statusCode) {
    return locations;
  }

  const fires = await getActiveFires();
  if (!fires) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/plain' },
      body: 'Failure.',
    };
  } if (fires.statusCode) {
    return fires;
  }

  let closest = { distance: Number.MAX_VALUE, fire: null };
  locations.forEach((location) => {
    const tmpLocation = unmarshall(location);
    fires.forEach((fire) => {
      const tmpFire = unmarshall(fire);
      const distance = distanceLatLng(tmpLocation.latitude,
        tmpLocation.longitude,
        tmpFire.latitude,
        tmpFire.longitude);

      if (distance < closest.distance) {
        closest = { distance, fire: tmpFire };
        console.log(`New closest fire: ${tmpFire.incidentName} is ${distance} meters away`);
      }
    });
  });

  closest.distanceKm = closest.distance / 1000;
  closest.distanceMiles = closest.distanceKm * kmToMiles;

  closest.distanceKmString = closest.distanceKm.toLocaleString(undefined,
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  closest.distanceMilesString = closest.distanceMiles.toLocaleString(undefined,
    { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/plain' },
    body: `Closest known wildfire: ${closest.fire.incidentName} - ${closest.distanceKmString}km (${closest.distanceMilesString}mi)\n
    FIRE_ID: ${closest.fire.uniqueFireId}\n
    LAT/LNG: ${closest.fire.latitude}, ${closest.fire.longitude}\n
      ACRES: ${closest.fire.dailyAcres}`,
  };
}
