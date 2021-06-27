import { DynamoDBClient, ScanCommand } from "@aws-sdk/client-dynamodb";
import { unmarshall } from '@aws-sdk/util-dynamodb';


const ddbClient = new DynamoDBClient({ region: 'us-west-2' });

const earthRadius = 3958.75;
const meterConversion = 1609;
const toRadians = Math.PI / 180;
const kmToMiles = 0.6213711922;

function distanceLatLng(lat_a, lng_a, lat_b, lng_b) {
  let latDiff = toRadians * (lat_b - lat_a);
  let lngDiff = toRadians * (lng_b - lng_a);
  let a = Math.sin(latDiff / 2) * Math.sin(latDiff / 2) +
    Math.cos(toRadians * (lat_a)) * Math.cos(toRadians * (lat_b)) *
    Math.sin(lngDiff / 2) * Math.sin(lngDiff / 2);
  let c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  let distance = earthRadius * c;

  return distance * meterConversion;
}

async function getLocationsToNotify() {
  let command = new ScanCommand({
    TableName: process.env.usersTableName,
  });

  let response = await ddbClient.send(command)
    .catch(err => {
      console.log(err);

      return {
        statusCode: 500,
        headers: { "Content-Type": "text/plain" },
        body: `Failure.`,
      };
    });

  return response.Items;
}

async function getActiveFires() {
  let command = new ScanCommand({
    TableName: process.env.firesTableName,
    FilterExpression: "attribute_not_exists(outTime) or outTime = :null",
    ExpressionAttributeValues: {
      ":null": { "NULL": true }
    }
  });

  let response = await ddbClient.send(command)
    .catch(err => {
      console.log(err);

      return {
        statusCode: 500,
        headers: { "Content-Type": "text/plain" },
        body: `Failure.`,
      };
    });

  console.log(`Found ${response.Items.length} active fires of ${response.ScannedCount} total fires.`);

  return response.Items;
}

export async function handler() {

  let locations = await getLocationsToNotify();
  if (!locations) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/plain" },
      body: `Failure.`,
    };
  } else if (locations.statusCode) {
    return locations;
  }

  let fires = await getActiveFires();
  if (!fires) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "text/plain" },
      body: `Failure.`,
    };
  } else if (fires.statusCode) {
    return fires;
  }

  let closest = { distance: Number.MAX_VALUE, fire: null };
  locations.forEach((location) => {
    location = unmarshall(location);
    fires.forEach((fire) => {
      fire = unmarshall(fire);
      let distance = distanceLatLng(location.latitude, location.longitude, fire.latitude, fire.longitude);
      if (distance < closest.distance) {
        closest = { distance, fire };
        console.log(`New closest fire: ${fire.incidentName} is ${distance} meters away`);
      }
    });
  });

  closest.distanceKm = closest.distance / 1000;
  closest.distanceMiles = closest.distanceKm * kmToMiles;

  closest.distanceKmString = closest.distanceKm.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  closest.distanceMilesString = closest.distanceMiles.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return {
    statusCode: 200,
    headers: { "Content-Type": "text/plain" },
    body: `Closest known wildfire: ${closest.fire.incidentName} - ${closest.distanceKmString}km (${closest.distanceMilesString}mi)\n
    FIRE_ID: ${closest.fire.uniqueFireId}\n
    LAT/LNG: ${closest.fire.latitude}, ${closest.fire.longitude}\n
      ACRES: ${closest.fire.dailyAcres}`,
  };
}
