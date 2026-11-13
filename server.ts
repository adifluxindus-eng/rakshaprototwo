import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import type {
  Hospital,
  Incident,
  IncidentCategory,
  IncidentType,
  JudgeSuggestion,
  WsEvent,
} from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.max(0.6, Number((R * c).toFixed(2)));
}

const hospitals: Hospital[] = [
  {
    id: 'HOSP-101',
    name: 'AIIMS Trauma & Emergency Center',
    city: 'New Delhi',
    area: 'Ansari Nagar',
    address: 'Sri Aurobindo Marg, Ansari Nagar East, New Delhi',
    latitude: 28.5672,
    longitude: 77.21,
    icuBedsAvailable: 14,
    ambulancesReady: 5,
    phone: '+91 11 2659 3308',
    addedByAdmin: false,
    createdAt: new Date(Date.now() - 86400000 * 12).toISOString(),
  },
  {
    id: 'HOSP-102',
    name: 'Dr. Ram Manohar Lohia Hospital',
    city: 'New Delhi',
    area: 'Connaught Place West',
    address: 'Baba Kharak Singh Marg, New Delhi',
    latitude: 28.6256,
    longitude: 77.2022,
    icuBedsAvailable: 9,
    ambulancesReady: 4,
    phone: '+91 11 2340 4286',
    addedByAdmin: false,
    createdAt: new Date(Date.now() - 86400000 * 9).toISOString(),
  },
  {
    id: 'HOSP-103',
    name: 'Sir Ganga Ram Emergency Wing',
    city: 'New Delhi',
    area: 'Rajinder Nagar',
    address: 'Old Rajinder Nagar, New Delhi',
    latitude: 28.6388,
    longitude: 77.1895,
    icuBedsAvailable: 11,
    ambulancesReady: 3,
    phone: '+91 11 2575 0000',
    addedByAdmin: false,
    createdAt: new Date(Date.now() - 86400000 * 6).toISOString(),
  },
  {
    id: 'HOSP-104',
    name: 'Manipal Emergency & Trauma Unit',
    city: 'Bengaluru',
    area: 'HAL Old Airport Rd',
    address: '98 HAL Old Airport Road, Bengaluru',
    latitude: 12.9589,
    longitude: 77.6489,
    icuBedsAvailable: 16,
    ambulancesReady: 6,
    phone: '+91 80 2502 4444',
    addedByAdmin: false,
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
];

const incidents: Incident[] = [];

const suggestions: JudgeSuggestion[] = [
  {
    id: 'SUG-01',
    judgeName: 'Dr. Arvind Mehta',
    role: 'Healthcare Systems Advisor',
    category: 'Triage & Dispatch',
    message: 'Connecting live ICU bed counts with nearest ambulance routing reduces golden-hour handover delay.',
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
];

const DRIVER_ROSTER = [
  { code: 'AMB-DL-104', driver: 'Rajesh Kumar', phone: '+91 98110 44219' },
  { code: 'AMB-DL-208', driver: 'Vikram Singh', phone: '+91 98731 82041' },
  { code: 'AMB-KA-312', driver: 'Suresh Gowda', phone: '+91 99002 61820' },
];

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use('/api', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  const aliveMap = new WeakMap<WebSocket, boolean>();

  function broadcast(msg: WsEvent) {
    const raw = JSON.stringify(msg);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(raw);
      }
    });
  }

  wss.on('connection', (socket) => {
    aliveMap.set(socket, true);
    socket.on('pong', () => {
      aliveMap.set(socket, true);
    });
    const syncPayload: WsEvent = {
      event: 'state:sync',
      payload: { hospitals, incidents, suggestions },
    };
    socket.send(JSON.stringify(syncPayload));
  });

  wss.on('error', (err) => {
    console.error('WebSocket server error:', err.message);
  });

  // Keep WebSocket connections alive behind reverse proxies
  const wsHeartbeat = setInterval(() => {
    wss.clients.forEach((client) => {
      if (aliveMap.get(client) === false) {
        client.terminate();
        return;
      }
      aliveMap.set(client, false);
      if (client.readyState === WebSocket.OPEN) {
        client.ping();
      }
    });
  }, 25000);
  wss.on('close', () => clearInterval(wsHeartbeat));

  // Server-authoritative ambulance route telemetry tick for accepted incidents
  const routeTick = setInterval(() => {
    incidents.forEach((inc) => {
      if (inc.status === 'ACCEPTED' || inc.status === 'EN_ROUTE') {
        if (inc.routeProgress < 1) {
          const nextProgress = Math.min(1, Number((inc.routeProgress + 0.045).toFixed(3)));
          inc.routeProgress = nextProgress;
          inc.status = nextProgress >= 1 ? 'ARRIVED' : 'EN_ROUTE';
          const remainingRatio = Math.max(0, 1 - nextProgress);
          const totalDist =
            inc.assignedHospitalLat !== null && inc.assignedHospitalLng !== null
              ? haversineKm(
                  inc.assignedHospitalLat,
                  inc.assignedHospitalLng,
                  inc.latitude,
                  inc.longitude,
                )
              : 2.4;
          inc.distanceKm = Number((totalDist * remainingRatio).toFixed(2));
          inc.etaMinutes = nextProgress >= 1 ? 0 : Math.max(1, Math.ceil(totalDist * 3.2 * remainingRatio));

          broadcast({ event: 'incident:updated', payload: { ...inc } });
        }
      }
    });
  }, 1400);

  app.get('/raksha-sos.apk', (_req, res) => {
    const apkPath = path.resolve(__dirname, 'public', 'raksha-sos.apk');
    res.setHeader('Content-Type', 'application/vnd.android.package-archive');
    res.download(apkPath, 'raksha-sos.apk');
  });

  // REST Endpoints mirroring Raksha AI FastAPI API groups
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'raksha-ai-demo', timestamp: new Date().toISOString() });
  });

  app.get('/api/state', (_req, res) => {
    res.json({ hospitals, incidents, suggestions });
  });

  app.post('/api/auth/admin-login', (req, res) => {
    const { email, password } = req.body ?? {};
    if (
      String(email || '').trim().toLowerCase() === 'admin@raksha.ai' &&
      String(password || '') === 'raksha2026'
    ) {
      return res.json({
        authenticated: true,
        admin: {
          name: 'Command Officer Priya Sharma',
          email: 'admin@raksha.ai',
          role: 'Central Emergency Admin',
        },
      });
    }
    return res.status(401).json({ error: 'Invalid admin credentials. Use admin@raksha.ai / raksha2026.' });
  });

  app.get('/api/hospitals', (_req, res) => {
    res.json(hospitals);
  });

  app.post('/api/hospitals', (req, res) => {
    const {
      name,
      city,
      area,
      address,
      latitude,
      longitude,
      icuBedsAvailable,
      ambulancesReady,
      phone,
    } = req.body ?? {};

    if (!name || !city || typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({ error: 'Hospital name, city, latitude, and longitude are required.' });
    }

    const newHospital: Hospital = {
      id: `HOSP-${Math.floor(200 + Math.random() * 799)}`,
      name: String(name).trim(),
      city: String(city).trim(),
      area: String(area || 'Central Zone').trim(),
      address: String(address || `${area || 'Central Zone'}, ${city}`).trim(),
      latitude,
      longitude,
      icuBedsAvailable: Math.max(1, Number(icuBedsAvailable) || 8),
      ambulancesReady: Math.max(1, Number(ambulancesReady) || 3),
      phone: String(phone || '+91 11 4000 1108').trim(),
      addedByAdmin: true,
      createdAt: new Date().toISOString(),
    };

    hospitals.unshift(newHospital);
    broadcast({ event: 'hospital:created', payload: newHospital });
    return res.status(201).json(newHospital);
  });

  app.post('/api/incidents', (req, res) => {
    const {
      id,
      type,
      category,
      reporterName,
      reporterPhone,
      locationLabel,
      latitude,
      longitude,
      accuracyMeters,
      isDemoLocation,
      notes,
    } = req.body ?? {};

    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({ error: 'Valid GPS coordinates are required.' });
    }

    // Idempotency check
    if (id) {
      const existing = incidents.find((item) => item.id === id);
      if (existing) {
        return res.json(existing);
      }
    }

    // Find nearest registered hospital
    let nearest = hospitals[0];
    let minDistance = Infinity;
    for (const h of hospitals) {
      const dist = haversineKm(h.latitude, h.longitude, latitude, longitude);
      if (dist < minDistance) {
        minDistance = dist;
        nearest = h;
      }
    }

    const incidentId =
      id || `INC-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 8999)}`;

    const newIncident: Incident = {
      id: incidentId,
      type: (type as IncidentType) || 'DISTRESS_SOS',
      category: (category as IncidentCategory) || 'Medical Emergency',
      reporterName:
        type === 'SECURE_ALERT'
          ? 'Anonymous Reporter'
          : String(reporterName || 'Citizen User').trim(),
      reporterPhone:
        type === 'SECURE_ALERT'
          ? 'Identity Protected'
          : String(reporterPhone || '+91 98XXX XX412').trim(),
      locationLabel: String(locationLabel || 'Captured GPS Location').trim(),
      latitude,
      longitude,
      accuracyMeters: Number(accuracyMeters) || 6.5,
      isDemoLocation: Boolean(isDemoLocation),
      notes: String(notes || '').trim(),
      status: 'REPORTED',
      assignedHospitalId: nearest ? nearest.id : null,
      assignedHospitalName: nearest ? nearest.name : null,
      assignedHospitalLat: nearest ? nearest.latitude : null,
      assignedHospitalLng: nearest ? nearest.longitude : null,
      assignedAmbulanceCode: null,
      driverName: null,
      driverPhone: null,
      routeProgress: 0,
      etaMinutes: Math.max(3, Math.ceil(minDistance * 3.2)),
      distanceKm: Number.isFinite(minDistance) ? minDistance : 2.1,
      createdAt: new Date().toISOString(),
      acceptedAt: null,
    };

    incidents.unshift(newIncident);
    broadcast({ event: 'incident:created', payload: newIncident });
    return res.status(201).json(newIncident);
  });

  app.post('/api/incidents/:id/accept', (req, res) => {
    const incident = incidents.find((item) => item.id === req.params.id);
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found.' });
    }

    const requestedHospitalId = req.body?.hospitalId;
    const chosenHospital =
      hospitals.find((h) => h.id === requestedHospitalId) ||
      hospitals.find((h) => h.id === incident.assignedHospitalId) ||
      hospitals[0];

    const rosterEntry = DRIVER_ROSTER[incidents.indexOf(incident) % DRIVER_ROSTER.length];
    const dist = chosenHospital
      ? haversineKm(
          chosenHospital.latitude,
          chosenHospital.longitude,
          incident.latitude,
          incident.longitude,
        )
      : 2.2;

    incident.status = 'EN_ROUTE';
    incident.assignedHospitalId = chosenHospital ? chosenHospital.id : null;
    incident.assignedHospitalName = chosenHospital ? chosenHospital.name : 'Central Trauma Unit';
    incident.assignedHospitalLat = chosenHospital ? chosenHospital.latitude : incident.latitude + 0.015;
    incident.assignedHospitalLng = chosenHospital ? chosenHospital.longitude : incident.longitude - 0.018;
    incident.assignedAmbulanceCode = rosterEntry.code;
    incident.driverName = rosterEntry.driver;
    incident.driverPhone = rosterEntry.phone;
    incident.routeProgress = 0.06;
    incident.distanceKm = dist;
    incident.etaMinutes = Math.max(2, Math.ceil(dist * 3.2));
    incident.acceptedAt = new Date().toISOString();

    broadcast({ event: 'incident:updated', payload: { ...incident } });
    return res.json(incident);
  });

  app.patch('/api/incidents/:id/status', (req, res) => {
    const incident = incidents.find((item) => item.id === req.params.id);
    if (!incident) {
      return res.status(404).json({ error: 'Incident not found.' });
    }
    const { status } = req.body ?? {};
    if (status === 'ARRIVED') {
      incident.status = 'ARRIVED';
      incident.routeProgress = 1;
      incident.distanceKm = 0;
      incident.etaMinutes = 0;
    } else if (status === 'RESOLVED') {
      incident.status = 'RESOLVED';
      incident.routeProgress = 1;
      incident.distanceKm = 0;
      incident.etaMinutes = 0;
    }
    broadcast({ event: 'incident:updated', payload: { ...incident } });
    return res.json(incident);
  });

  app.post('/api/suggestions', (req, res) => {
    const { judgeName, role, category, message } = req.body ?? {};
    if (!message || !String(message).trim()) {
      return res.status(400).json({ error: 'Suggestion message is required.' });
    }
    const item: JudgeSuggestion = {
      id: `SUG-${Math.floor(100 + Math.random() * 899)}`,
      judgeName: String(judgeName || 'Hackathon Judge').trim(),
      role: String(role || 'Reviewer').trim(),
      category: String(category || 'Product & Architecture').trim(),
      message: String(message).trim(),
      createdAt: new Date().toISOString(),
    };
    suggestions.unshift(item);
    broadcast({ event: 'suggestion:created', payload: item });
    return res.status(201).json(item);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, hmr: false, ws: false },
      appType: 'spa',
    });
    app.get('/@vite/client', async (_req, res, next) => {
      try {
        const result = await vite.transformRequest('/@vite/client');
        if (!result) return next();
        const code = result.code
          .replace(
            'transport.connect(createHMRHandler(handleMessage));',
            '/* HMR WebSocket disabled */',
          )
          .replace(
            'else throw new SendBeforeConnectError("send was called before connect");',
            'else return;',
          )
          .replace(
            'else throw new SendBeforeConnectError("invoke was called before connect");',
            'else return;',
          );
        res.type('application/javascript').send(code);
      } catch (err) {
        next(err);
      }
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    console.error('HTTP server error:', err.message);
    if (err.code === 'EADDRINUSE') {
      process.exit(1);
    }
  });

  const shutdown = () => {
    clearInterval(routeTick);
    clearInterval(wsHeartbeat);
    wss.close(() => {
      httpServer.close(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 1500).unref();
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Raksha AI Demo Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
