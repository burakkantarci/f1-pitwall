import type { FastifyInstance } from 'fastify';
import https from 'node:https';
import fs from 'node:fs';

const NAMESPACE = 'pitwall';

// In-cluster Kubernetes API access
function k8sRequest(method: string, path: string, body?: object): Promise<{ status: number; data: unknown }> {
  const tokenPath = '/var/run/secrets/kubernetes.io/serviceaccount/token';
  const caPath = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';

  // Check if running in-cluster
  if (!fs.existsSync(tokenPath)) {
    return Promise.reject(new Error('Not running inside Kubernetes cluster'));
  }

  const token = fs.readFileSync(tokenPath, 'utf8');
  const ca = fs.readFileSync(caPath);

  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = https.request(
      {
        hostname: 'kubernetes.default.svc',
        port: 443,
        path,
        method,
        ca,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 0, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode || 0, data });
          }
        });
      },
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function scaleResource(kind: 'deployments' | 'statefulsets', name: string, replicas: number) {
  const group = kind === 'statefulsets' ? 'apps' : 'apps';
  const path = `/apis/${group}/v1/namespaces/${NAMESPACE}/${kind}/${name}/scale`;
  return k8sRequest('PATCH', path, { spec: { replicas } }).then((res) => {
    if (res.status >= 400) {
      throw new Error(`K8s API error ${res.status}: ${JSON.stringify(res.data)}`);
    }
    return res;
  });
}

// Use strategic merge patch content type
function k8sScalePatch(kind: 'deployments' | 'statefulsets', name: string, replicas: number): Promise<{ status: number; data: unknown }> {
  const tokenPath = '/var/run/secrets/kubernetes.io/serviceaccount/token';
  const caPath = '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt';

  if (!fs.existsSync(tokenPath)) {
    return Promise.reject(new Error('Not running inside Kubernetes cluster'));
  }

  const token = fs.readFileSync(tokenPath, 'utf8');
  const ca = fs.readFileSync(caPath);
  const path = `/apis/apps/v1/namespaces/${NAMESPACE}/${kind}/${name}/scale`;
  const payload = JSON.stringify({ spec: { replicas } });

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'kubernetes.default.svc',
        port: 443,
        path,
        method: 'PATCH',
        ca,
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/merge-patch+json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode || 0, data: JSON.parse(data) });
          } catch {
            resolve({ status: res.statusCode || 0, data });
          }
        });
      },
    );
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

export async function k8sChaosRoutes(app: FastifyInstance) {
  // Kill Redis
  app.post('/chaos/infra/redis-kill', async () => {
    await k8sScalePatch('deployments', 'redis', 0);
    app.log.warn('CHAOS: Redis killed (scaled to 0)');
    return { status: 'killed', resource: 'redis' };
  });

  // Restore Redis
  app.post('/chaos/infra/redis-restore', async () => {
    await k8sScalePatch('deployments', 'redis', 1);
    app.log.info('CHAOS: Redis restored (scaled to 1)');
    return { status: 'restored', resource: 'redis' };
  });

  // Kill PostgreSQL
  app.post('/chaos/infra/db-kill', async () => {
    await k8sScalePatch('statefulsets', 'postgres', 0);
    app.log.warn('CHAOS: PostgreSQL killed (scaled to 0)');
    return { status: 'killed', resource: 'postgres' };
  });

  // Restore PostgreSQL
  app.post('/chaos/infra/db-restore', async () => {
    await k8sScalePatch('statefulsets', 'postgres', 1);
    app.log.info('CHAOS: PostgreSQL restored (scaled to 1)');
    return { status: 'restored', resource: 'postgres' };
  });

  // Kill Ingestion service
  app.post('/chaos/infra/ingestion-kill', async () => {
    await k8sScalePatch('deployments', 'ingestion', 0);
    app.log.warn('CHAOS: Ingestion service killed (scaled to 0)');
    return { status: 'killed', resource: 'ingestion' };
  });

  // Restore Ingestion service
  app.post('/chaos/infra/ingestion-restore', async () => {
    await k8sScalePatch('deployments', 'ingestion', 1);
    app.log.info('CHAOS: Ingestion service restored (scaled to 1)');
    return { status: 'restored', resource: 'ingestion' };
  });

  // Kill Notifications service
  app.post('/chaos/infra/notifications-kill', async () => {
    await k8sScalePatch('deployments', 'notifications', 0);
    app.log.warn('CHAOS: Notifications service killed (scaled to 0)');
    return { status: 'killed', resource: 'notifications' };
  });

  // Restore Notifications service
  app.post('/chaos/infra/notifications-restore', async () => {
    await k8sScalePatch('deployments', 'notifications', 1);
    app.log.info('CHAOS: Notifications service restored (scaled to 1)');
    return { status: 'restored', resource: 'notifications' };
  });

  // Meltdown - kill everything
  app.post('/chaos/infra/meltdown', async () => {
    const results = await Promise.allSettled([
      k8sScalePatch('statefulsets', 'postgres', 0),
      k8sScalePatch('deployments', 'redis', 0),
      k8sScalePatch('deployments', 'ingestion', 0),
    ]);
    app.log.warn('CHAOS: MELTDOWN - PostgreSQL, Redis, Ingestion killed');
    return { status: 'meltdown', results: results.map((r) => r.status) };
  });

  // Meltdown restore
  app.post('/chaos/infra/meltdown-restore', async () => {
    const results = await Promise.allSettled([
      k8sScalePatch('statefulsets', 'postgres', 1),
      k8sScalePatch('deployments', 'redis', 1),
      k8sScalePatch('deployments', 'ingestion', 1),
    ]);
    app.log.info('CHAOS: MELTDOWN RESTORED - all services scaled back');
    return { status: 'restored', results: results.map((r) => r.status) };
  });

  // Get infra status
  app.get('/chaos/infra/status', async () => {
    try {
      const [redis, postgres, ingestion, notifications] = await Promise.all([
        k8sRequest('GET', `/apis/apps/v1/namespaces/${NAMESPACE}/deployments/redis/scale`),
        k8sRequest('GET', `/apis/apps/v1/namespaces/${NAMESPACE}/statefulsets/postgres/scale`),
        k8sRequest('GET', `/apis/apps/v1/namespaces/${NAMESPACE}/deployments/ingestion/scale`),
        k8sRequest('GET', `/apis/apps/v1/namespaces/${NAMESPACE}/deployments/notifications/scale`),
      ]);
      const getReplicas = (res: { data: unknown }) => {
        const d = res.data as { spec?: { replicas?: number }; status?: { replicas?: number } };
        return { desired: d.spec?.replicas ?? 0, ready: d.status?.replicas ?? 0 };
      };
      return {
        redis: getReplicas(redis),
        postgres: getReplicas(postgres),
        ingestion: getReplicas(ingestion),
        notifications: getReplicas(notifications),
      };
    } catch (err) {
      return { error: 'Not running in Kubernetes cluster' };
    }
  });
}
