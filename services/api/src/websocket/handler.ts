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

async function setupSubscription() {
  if (subscribed) return;
  subscribed = true;

  await redisSub.subscribe(...CHANNELS);

  redisSub.on('message', (channel, message) => {
    const type = channelToMessageType(channel);
    const payload = JSON.stringify({ type, data: JSON.parse(message) });
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
    'f1:fastest-lap': 'fastest_lap',
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
