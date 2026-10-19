require('dotenv').config();

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { WebSocketServer, WebSocket } = require('ws');
const { Client, GatewayIntentBits } = require('discord.js');

const PORT = Number(process.env.PORT || 3000);
const CHANNEL_ID = process.env.FLIGHT_CHANNEL_ID;
const TOKEN = process.env.DISCORD_TOKEN;
const DATA_FILE = path.join(__dirname, 'flights.json');

if (!TOKEN || !CHANNEL_ID) {
  console.error('Missing DISCORD_TOKEN or FLIGHT_CHANNEL_ID. Copy .env.example to .env and fill them in.');
  process.exit(1);
}

function loadFlights() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
let flights = loadFlights();

function saveFlights() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(flights, null, 2));
}
function clean(value, max = 120) {
  return String(value || '').trim().slice(0, max);
}
function parseFields(content) {
  const out = {};
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*(callsign|departure|destination|route|altitude|status|position|latitude|longitude)\s*:\s*(.*?)\s*$/i);
    if (match) out[match[1].toLowerCase()] = match[2];
  }
  return out;
}
function upsertFromMessage(message) {
  const fields = parseFields(message.content);
  const callsign = clean(fields.callsign, 24).toUpperCase();
  if (!callsign) return false;

  const idx = flights.findIndex(f => f.callsign === callsign);
  const old = idx >= 0 ? flights[idx] : {};
  const flight = {
    callsign,
    departure: clean(fields.departure || old.departure, 12).toUpperCase(),
    destination: clean(fields.destination || old.destination, 12).toUpperCase(),
    route: clean(fields.route || old.route, 300),
    altitude: clean(fields.altitude || old.altitude, 20),
    status: clean(fields.status || old.status || 'FILED', 24).toUpperCase(),
    latitude: old.latitude ?? null,
    longitude: old.longitude ?? null,
    positionUpdatedAt: old.positionUpdatedAt || null,
    discordUser: clean(message.author?.username || old.discordUser, 80),
    sourceMessageId: message.id,
    updatedAt: new Date().toISOString()
  };

  // Only store a plotted position when a pilot actually provides coordinates.
  // A flight plan alone is not enough to infer the aircraft's current location.
  if (fields.position) {
    const pair = fields.position.split(/[,\s]+/).map(Number);
    if (pair.length >= 2 && Number.isFinite(pair[0]) && Number.isFinite(pair[1]) &&
        Math.abs(pair[0]) <= 90 && Math.abs(pair[1]) <= 180) {
      flight.latitude = pair[0];
      flight.longitude = pair[1];
      flight.positionUpdatedAt = new Date().toISOString();
    }
  } else if (fields.latitude !== undefined && fields.longitude !== undefined) {
    const lat = Number(fields.latitude);
    const lon = Number(fields.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon) &&
        Math.abs(lat) <= 90 && Math.abs(lon) <= 180) {
      flight.latitude = lat;
      flight.longitude = lon;
      flight.positionUpdatedAt = new Date().toISOString();
    }
  }

  if (idx >= 0) flights[idx] = flight;
  else flights.push(flight);
  saveFlights();
  broadcast({ type: 'flights', flights });
  return true;
}

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/flights', (_req, res) => res.json(flights));
app.get('/health', (_req, res) => res.json({ ok: true, flights: flights.length }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
function broadcast(payload) {
  const encoded = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(encoded);
  }
}
wss.on('connection', socket => {
  socket.send(JSON.stringify({ type: 'flights', flights }));
});

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

client.once('ready', () => {
  console.log(`Discord bot logged in as ${client.user.tag}`);
  console.log(`Listening for flight plans in channel ${CHANNEL_ID}`);
});
client.on('messageCreate', message => {
  if (message.author.bot || message.channelId !== CHANNEL_ID) return;
  if (upsertFromMessage(message)) {
    console.log(`Updated flight plan for ${parseFields(message.content).callsign}`);
  }
});
client.on('messageUpdate', (_oldMessage, newMessage) => {
  if (!newMessage.author || newMessage.author.bot || newMessage.channelId !== CHANNEL_ID) return;
  if (newMessage.content) upsertFromMessage(newMessage);
});
client.on('error', error => console.error('Discord client error:', error));

server.listen(PORT, () => console.log(`Radar website running at http://localhost:${PORT}`));
client.login(TOKEN);
