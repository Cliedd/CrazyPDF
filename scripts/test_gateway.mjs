import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

const upstream = http.createServer(async (request, response) => {
  let body = '';
  for await (const chunk of request) body += chunk;
  response.writeHead(200, {
    'content-type': 'application/json',
    connection: 'keep-alive, x-private-hop',
    'x-private-hop': 'must-not-leave-upstream',
    'keep-alive': 'timeout=999',
    'set-cookie': ['session=test; HttpOnly; Path=/', 'preference=fr; Path=/'],
  });
  response.write(JSON.stringify({ body, cookie: request.headers.cookie,
    injectedIdentity: request.headers['x-user-id'], nominatedHeader: request.headers['x-client-hop'],
    internalToken: request.headers['x-internal-token'] }).slice(0, 10));
  response.end(JSON.stringify({ body, cookie: request.headers.cookie,
    injectedIdentity: request.headers['x-user-id'], nominatedHeader: request.headers['x-client-hop'],
    internalToken: request.headers['x-internal-token'] }).slice(10));
});
upstream.listen(0, '127.0.0.1');
await once(upstream, 'listening');
const placeholder = http.createServer();
placeholder.listen(0, '127.0.0.1');
await once(placeholder, 'listening');
const port = placeholder.address().port;
await new Promise(resolve => placeholder.close(resolve));
const gateway = spawn(process.execPath, ['gateway/dist/main.js'], { env: {
  ...process.env, PORT: String(port), NODE_ENV: 'test', INTERNAL_API_TOKEN: 'gateway-regression',
  PYTHON_API_URL: `http://127.0.0.1:${upstream.address().port}`,
}, stdio: 'ignore' });
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await fetch(`http://127.0.0.1:${port}/api/health`); ready = true; break; } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert(ready, 'Nest gateway did not start');
  const result = await new Promise((resolve, reject) => {
    const request = http.request(`http://127.0.0.1:${port}/api/jobs`, { method: 'POST', headers: {
      cookie: 'docuvisa_session=private-test-token', connection: 'x-client-hop',
      'x-client-hop': 'must-not-reach-python', 'x-user-id': 'spoofed-user',
    } }, response => {
      let body = ''; response.on('data', data => body += data);
      response.on('end', () => resolve({ headers: response.headers, body: JSON.parse(body) }));
    });
    request.on('error', reject);
    request.write('multipart-stream-'); request.end('intact');
  });
  assert.equal(result.body.body, 'multipart-stream-intact');
  assert.equal(result.body.cookie, 'docuvisa_session=private-test-token');
  assert.equal(result.body.internalToken, 'gateway-regression');
  assert.equal(result.body.injectedIdentity, undefined);
  assert.equal(result.body.nominatedHeader, undefined);
  assert.equal(result.headers['x-private-hop'], undefined);
  assert.notEqual(result.headers['keep-alive'], 'timeout=999');
  assert.equal(result.headers['set-cookie'].length, 2);
  console.log('PASS gateway: chunked upload/response, cookies, internal authentication, hop-header filtering.');
} finally {
  gateway.kill('SIGTERM');
  upstream.closeAllConnections();
  await new Promise(resolve => upstream.close(resolve));
}
