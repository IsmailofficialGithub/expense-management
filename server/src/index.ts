import { buildApp } from './app.js';
import { startMessagingWorker } from './messaging.js';
import { startReportScheduler } from './reports.js';

const app = await buildApp();
startMessagingWorker();
startReportScheduler();
await app.listen({ host: '0.0.0.0', port: Number(process.env.PORT ?? 3020) });
