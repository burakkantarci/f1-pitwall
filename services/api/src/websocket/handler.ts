import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { redisSub } from '../cache/redis.js';

const clients = new Set<WebSocket>();

const CHANNELS = [
  'f1:position-change',
  'f1:pit-stop',
  'f1:fastest-lap',
  'f1:safety-car',
  'f1:session-status',
];

let subscribed = false;

// Track current position tower (accumulated from individual position_change events)
const positionTower = new Map<number, Record<string, unknown>>();

async function setupSubscription() {
  if (subscribed) return;
  subscribed = true;

  await redisSub.subscribe(...CHANNELS);

  redisSub.on('message', (channel, message) => {
    const type = channelToMessageType(channel);
    const event = JSON.parse(message);
    const innerData = event.data || event;

    let payload: string;

    if (type === 'position_update') {
      // Accumulate position into the tower and broadcast the full tower
      const driverId = innerData.driver_id;
      if (driverId) {
        positionTower.set(driverId, {
          id: driverId,
          session_id: event.session_id,
          driver_id: driverId,
          driver_name: innerData.driver_name || 'Unknown',
          abbreviation: innerData.abbreviation || '',
          team: innerData.team || '',
          number: innerData.number || driverId,
          position: innerData.position,
          gap_to_leader_ms: innerData.gap_to_leader_ms ?? null,
          interval_ms: innerData.interval_ms ?? null,
          last_lap_ms: innerData.last_lap_ms ?? null,
          recorded_at: event.timestamp,
        });
      }

      // Send the full sorted position tower
      const positions = Array.from(positionTower.values()).sort(
        (a, b) => (a.position as number) - (b.position as number),
      );
      payload = JSON.stringify({ type, data: positions });
    } else if (type === 'session_status') {
      // On new session start, clear the tower
      if (innerData.status === 'live') {
        positionTower.clear();
      }
      payload = JSON.stringify({ type, data: innerData });
    } else {
      // pit_stop, fastest_lap - forward the inner data
      payload = JSON.stringify({ type, data: innerData });
    }

    for (const client of clients) {
      if (client.readyState === 1) {
        client.send(payload);
      }
    }
  });
}

function channelToMessageType(channel: string): string {
  const map: Record<string, string> = {
    'f1:position-change': 'position_update',
    'f1:pit-stop': 'pit_stop',
    'f1:fastest-lap': 'lap_complete',
    'f1:safety-car': 'session_status',
    'f1:session-status': 'session_status',
  };
  return map[channel] || 'unknown';
}

export async function wsHandler(app: FastifyInstance) {
  app.get('/ws/live', { websocket: true }, (socket) => {
    clients.add(socket);
    app.log.info(`WebSocket client connected (total: ${clients.size})`);

    setupSubscription().catch((err) => app.log.error(err, 'Failed to setup Redis subscription'));

    socket.on('close', () => {
      clients.delete(socket);
      app.log.info(`WebSocket client disconnected (total: ${clients.size})`);
    });
  });
}
