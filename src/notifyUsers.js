/* eslint-disable import/prefer-default-export */
import { DynamoDBClient, ScanCommand } from '@aws-sdk/client-dynamodb';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import { DateTime } from 'luxon';
import log from 'npmlog';
import sendDiscordMessage from './discordPublisher';

const ddbClient = new DynamoDBClient({ region: 'us-west-2' });
const snsClient = new SNSClient({ region: 'us-west-2' });

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
      log.info(err);

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
      log.error('DDB', JSON.stringify(err));

      return {
        statusCode: 500,
        headers: { 'Content-Type': 'text/plain' },
        body: 'Failure.',
      };
    });

  log.info('FIRE', `Found ${response.Items.length} active fires of ${response.ScannedCount} total fires.`);

  return response.Items;
}

async function constructMessage(closest) {
  return `Closest known wildfire: ${closest.fire.incidentName} - ${closest.distanceKmString}km (${closest.distanceMilesString}mi)\n
 UPDATED: ${new Date(closest.fire.lastUpdate).toDateString()}\n
 FIRE_ID: ${closest.fire.uniqueFireId}\n
 LAT/LNG: https://www.google.com/maps/search/?api=1&query=${closest.fire.latitude},${closest.fire.longitude} \n
   ACRES: ${closest.fire.dailyAcres}\n
http://fireinfo.dnr.wa.gov/`;
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

  const closestFires = locations.map((location) => {
    const tmpLocation = unmarshall(location);
    log.info('FIRE', `Searching for closest fire to ${tmpLocation.phone}`);
    let closest = { distance: Number.MAX_VALUE, fire: null };
    fires.forEach((fire) => {
      const tmpFire = unmarshall(fire);
      const fireTime = DateTime.fromMillis(tmpFire.lastUpdate);

      if (Math.abs(fireTime.diffNow('days').toObject().days) < 5) {
        const distance = distanceLatLng(
          tmpLocation.latitude,
          tmpLocation.longitude,
          tmpFire.latitude,
          tmpFire.longitude,
        );

        if (distance < closest.distance) {
          closest = { distance, fire: tmpFire };
          log.info('FIRE', `New closest fire: ${tmpFire.incidentName} is ${distance} meters away`);
        }
      }
    });

    closest.distanceKm = closest.distance / 1000;
    closest.distanceMiles = closest.distanceKm * kmToMiles;

    closest.distanceKmString = closest.distanceKm.toLocaleString(
      undefined,
      { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    );
    closest.distanceMilesString = closest.distanceMiles.toLocaleString(
      undefined,
      { minimumFractionDigits: 2, maximumFractionDigits: 2 },
    );

    tmpLocation.closest = closest;
    return tmpLocation;
  });

  await Promise.all(
    closestFires.map(async (location) => {
      if (!location.closest.fire) {
        return;
      }

      const { closest } = location;

      if (location.phone) {
        const message = constructMessage(closest);

        const snsPublishRequest = {
          Message: message,
          PhoneNumber: location.phone,
        };

        const command = new PublishCommand(snsPublishRequest);

        await snsClient.send(command)
          .catch((err) => {
            log.error('SNS', JSON.stringify(err));

            return {
              statusCode: 500,
              headers: { 'Content-Type': 'text/plain' },
              body: 'Failure.',
            };
          });
      } else if (location.hook && location.token) {
        await sendDiscordMessage(closest, location.hook, location.token);
      }
    }),
  );

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/plain' },
    body: 'Successfully sent all messages',
  };
}
