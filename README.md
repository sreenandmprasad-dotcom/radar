# Discord ATC Radar starter

This starter listens to **one configured Discord text channel**, turns manually submitted flight plans into structured records, and updates a dark ATC-style web dashboard live.

## Important limitation

A flight plan is not a live aircraft position. This starter does not invent coordinates or plot an aircraft just because a departure/destination is known. It shows flight-plan strips and makes the radar scope clearly indicate when no position feed is available. Position reports can be included in the same message format, but a real geographic projection and airport/range configuration must be added before plotting them accurately.

## 1. Requirements

- Node.js 20 or newer
- A Discord application/bot that you control
- Permission from the server owner/admin to add the bot and read the flight-plan channel

## 2. Create and configure the bot

1. Open the Discord Developer Portal: https://discord.com/developers/applications
2. Create an application, then add a bot.
3. Copy the bot token. Keep it private; never paste it into chat or commit it to GitHub.
4. Under **Bot → Privileged Gateway Intents**, enable **Message Content Intent** if the bot must parse pilots' ordinary text messages. Discord may restrict this for larger/verified apps. See https://discord.com/developers/docs/events/gateway#message-content-intent
5. Invite the bot to your server with only the permissions it needs: View Channel and Read Message History (plus any needed access to the target channel).
6. Copy `.env.example` to `.env`, and set `DISCORD_TOKEN` and `FLIGHT_CHANNEL_ID`.

## 3. Run locally

```bash
npm install
npm start
```

Open http://localhost:3000. Keep the terminal running while testing.

## 4. Pilot message format

In the configured flight-plan channel, post one message with one field per line:

```text
Callsign: DAL173
Departure: KATL
Destination: KJFK
Route: LGC J14 EMI
Altitude: FL350
Status: FILED
```

Editing/reposting a message with the same callsign updates the record. Use a unique callsign per active flight. The starter currently retains old flights until the JSON file is manually cleaned up; add lifecycle commands and expiry rules before production.

### Optional position report

A flight plan alone does not provide a position. If a pilot knows their current coordinates and is permitted to report them, they can add:

```text
Position: 33.6407, -84.4277
```

This stores the coordinates, but the starter intentionally does not plot them on the scope until an airport-centered geographic projection, range, and map conventions have been configured. Coordinates must be real reports, not guessed from the route.

## 5. Production checklist

Before putting the website on the public internet:
- Add authentication for controllers and viewers; the starter dashboard is not access-controlled.
- Use HTTPS/WSS and secure hosting.
- Restrict allowed Discord channel and roles, validate pilot permissions, and add an audit trail.
- Add flight lifecycle controls (activate, amend, cancel, land) and stale-flight expiry.
- Configure the airport reference point, coordinate projection, radar range, and map layers before drawing targets.
- Never use this hobby tool for real-world separation or safety-critical air traffic control.

## Current architecture

Discord message → `discord.js` bot → validated record in `flights.json` → Express API + WebSocket → dashboard.

This is a learning prototype, not an operational ATC system.
