import { DateTime } from 'luxon';
import log from 'npmlog';
import fetch from 'node-fetch';

function constructEmbed(closest) {
  return {
    username: 'WildfireFYI',
    avatar_url: '',
    content: '',
    embeds: [
      {
        title: 'Closest known wildfire:',
        color: 7440858,
        description: `${closest.fire.incidentName} - ${closest.distanceKmString}km (${closest.distanceMilesString}mi)`,
        timestamp: DateTime.fromMillis(closest.fire.lastUpdate).toISO(),
        url: 'http://fireinfo.dnr.wa.gov/',
        author: {
          name: '',
        },
        image: {},
        thumbnail: {},
        footer: {
          text: 'Click the title to view: http://fireinfo.dnr.wa.gov/',
        },
        fields: [
          {
            name: 'Fire Id',
            value: `${closest.fire.uniqueFireId}`,
            inline: false,
          },
          {
            name: 'Location',
            value: `https://www.google.com/maps/search/?api=1&query=${closest.fire.latitude},${closest.fire.longitude}`,
            inline: false,
          },
          {
            name: 'Acres',
            value: `${closest.fire.dailyAcres}`,
            inline: false,
          },
        ],
      },
    ],
    components: [],
  };
}

async function sendDiscordMessage(closest, hook, token) {
  const discordMessage = constructEmbed(closest);

  log.info(`SENDING MESSAGE to hook ${hook}.`);

  await fetch(`https://discord.com/api/webhooks/${hook}/${token}`, {
    method: 'post',
    body: JSON.stringify(discordMessage),
    headers: { 'Content-Type': 'application/json' },
  });
}

export default sendDiscordMessage;
