import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import http from 'node:http';
import helmet from 'helmet';
import express from 'express';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), process.cwd().endsWith('gateway') ? '../.env' : '.env'), quiet: true });

@Module({})
class AppModule {}

async function bootstrap() {
  // Keep the original multipart stream intact; Python enforces upload limits.
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(helmet({ contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'], imgSrc: ["'self'", 'blob:', 'data:'],
      connectSrc: ["'self'"], frameSrc: ["'self'", 'blob:'], objectSrc: ["'none'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  } }));
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.url.startsWith('/api/')) return next();
    const target = new URL(req.url, process.env.PYTHON_API_URL || 'http://127.0.0.1:8000');
    const headers: Record<string, string | number | string[] | undefined> = { ...req.headers, host: target.host, 'x-internal-token': process.env.INTERNAL_API_TOKEN || 'local-development' };
    delete headers['x-user-id'];
    const proxy = http.request(target, { method: req.method, headers, timeout: 120000 }, response => {
      res.writeHead(response.statusCode || 502, response.headers);
      response.pipe(res);
    });
    proxy.on('timeout', () => proxy.destroy(new Error('API timeout')));
    proxy.on('error', () => { if (!res.headersSent) res.status(502).json({ detail: 'Le serveur de traitement est indisponible. Réessayez.' }); else res.destroy(); });
    req.on('aborted', () => proxy.destroy());
    req.pipe(proxy);
  });
  const root = path.resolve(process.cwd(), process.cwd().endsWith('gateway') ? '../frontend/dist' : 'frontend/dist');
  app.use(express.static(root, { index: false }));
  app.use((req: express.Request, res: express.Response) => {
    if (req.method !== 'GET') return res.status(404).json({ detail: 'Route introuvable' });
    res.sendFile(path.join(root, 'index.html'));
  });
  await app.listen(Number(process.env.PORT || 3000), '0.0.0.0');
}
bootstrap();
