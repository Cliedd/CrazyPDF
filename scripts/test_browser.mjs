/** Real browser regression. Requires a running deployment and leaves a verification account. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const origin = process.env.TEST_ORIGIN || 'http://127.0.0.1:10001';
const portrait = new URL('../frontend/public/assets/243d5220011d19a6.png', import.meta.url).pathname;
const email = `verification-browser-${Date.now()}-${Math.random().toString(16).slice(2, 8)}@example.com`;
const password = `Verify-${crypto.randomUUID()}!`;
const browser = await chromium.launch({headless:true, executablePath:process.env.CHROMIUM_PATH || '/snap/bin/chromium', args:['--no-sandbox','--disable-dev-shm-usage']});
const context = await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1100}});
const page = await context.newPage();
const failures = [], checks = [];
let jobPosts = 0;
page.on('console',message=>{if(message.type()==='error')failures.push(`Console: ${message.text()}`)});
page.on('pageerror', error => failures.push(`JavaScript: ${error.message}`));
page.on('requestfailed', request => failures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText}`));
page.on('response', response => { if(response.status() >= 400 && new URL(response.url()).pathname.startsWith('/api/')) failures.push(`HTTP ${response.status()} ${new URL(response.url()).pathname}`); });
page.on('request', request => { if(request.method()==='POST' && new URL(request.url()).pathname==='/api/jobs') jobPosts++; });
page.setDefaultTimeout(30_000);
page.setDefaultNavigationTimeout(90_000);

async function session(){const response=await context.request.get(origin+'/api/auth/session');assert.equal(response.status(),200);const body=await response.json();assert.equal(body.user?.email,email);}
async function go(path){await page.goto(origin+path,{waitUntil:'domcontentloaded'});await page.locator('main').waitFor();await session();}
async function upload(selector){const chooser=page.waitForEvent('filechooser');await page.locator(selector).click();await (await chooser).setFiles(portrait);}
async function exportDownload(selector,name){const event=page.waitForEvent('download',{timeout:600_000});await page.locator(selector).click();const download=await event;const error=await download.failure();assert.equal(error,null);const path=`/tmp/docuvisa-browser-${name}`;await download.saveAs(path);return {path,bytes:await readFile(path)};}
async function pixels(bytes){return page.evaluate(async base64=>{const image=new Image();image.src='data:application/octet-stream;base64,'+base64;await image.decode();const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return {width:canvas.width,height:canvas.height,corner:[...ctx.getImageData(10,10,1,1).data]};},bytes.toString('base64'));}
async function jobs(){const response=await context.request.get(origin+'/api/jobs');assert.equal(response.status(),200);return response.json();}

try{
  await page.goto(origin+'/account',{waitUntil:'domcontentloaded'});
  await page.locator('#auth-form').waitFor();
  const blobFetch=await page.evaluate(async()=>{const url=URL.createObjectURL(new Blob(['CSP blob check']));try{return await fetch(url).then(r=>r.text())}finally{URL.revokeObjectURL(url)}});
  assert.equal(blobFetch,'CSP blob check','CSP must allow transparent export blobs to be reused');
  await page.locator('[data-action="auth-switch"]').click();
  await page.locator('#auth-form input[name="name"]').fill('Vérification navigateur');
  await page.locator('#auth-form input[name="email"]').fill(email);
  await page.locator('#auth-form input[name="password"]').fill(password);
  const registration=page.waitForResponse(r=>r.url().endsWith('/api/auth/register')&&r.request().method()==='POST');
  await page.locator('#auth-form button[type="submit"]').click();
  assert.equal((await registration).status(),200,'Registration must succeed in the real UI');
  await page.locator('#modal').waitFor({state:'hidden'});
  await session();checks.push('signup UI');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator('#profile-form').waitFor();
  await page.locator('[data-action="close"]').click();
  await session();checks.push('session after reload');

  await go('/background');
  await upload('[data-action="upload-background"]');
  await page.locator('#batch-files button').waitFor();
  const before=jobPosts;
  const white=await exportDownload('#downloadBtn','white.png');
  assert.equal(jobPosts-before,2,'A transparent master and colored export should be archived');
  const whiteImage=await pixels(white.bytes);
  assert.deepEqual(whiteImage,{width:512,height:279,corner:[255,255,255,255]});
  await session();checks.push('real segmentation and white export');
  await page.screenshot({path:'/tmp/docuvisa-browser-background.png',fullPage:true});
  await page.locator('.color-swatch-btn[data-bg="#F1F5F9"]').click();
  const beforeRecolor=jobPosts;
  const grey=await exportDownload('#downloadBtn','grey.png');
  assert.equal(jobPosts-beforeRecolor,1,'Recolor should reuse the transparent master');
  assert.deepEqual((await pixels(grey.bytes)).corner,[241,245,249,255]);
  checks.push('grey recolor reuses master');

  await page.locator('[data-action="send-studio"]').first().click();
  await page.waitForURL(origin+'/studio');
  await page.locator('#preset-select').selectOption('fr-visa');
  await page.locator('#photo-format').selectOption('PNG');
  const dimensions=await page.locator('#photo-canvas').evaluate(canvas=>({width:canvas.width,height:canvas.height}));
  assert.deepEqual(dimensions,{width:413,height:531});
  const visa=await exportDownload('#btn-download-photo','visa.png');
  const visaImage=await pixels(visa.bytes);
  assert.equal(visaImage.width,413);assert.equal(visaImage.height,531);
  await session();checks.push('processed photo transferred and visa export413x531');
  await page.screenshot({path:'/tmp/docuvisa-browser-studio.png',fullPage:true});
  for(const preset of ['us-visa','de-visa']){
    await page.locator('#preset-select').selectOption(preset);
    assert(await page.locator('#btn-ai-remove-bg').isDisabled());
    assert(await page.locator('#slider-bright').isDisabled());
  }
  checks.push('US/Germany no-retouch controls');

  await go('/documents');
  const archived=await jobs();
  assert(archived.length>=4);
  const photo=archived.find(job=>job.mode==='photo'&&job.status==='completed');
  assert(photo,'Exported visa photo must appear in persisted history');
  await page.locator(`[data-preview="${photo.id}"]`).click();
  await page.locator('#modal img').waitFor();
  await page.waitForFunction(()=>{const image=document.querySelector('#modal img');return image?.complete&&image.naturalWidth===413});
  await page.locator('[data-action="close"]').click();
  const zip=await exportDownload('#batchExportBtn','exports.zip');
  assert.equal(zip.bytes.subarray(0,2).toString(),'PK');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.locator(`[data-preview="${photo.id}"]`).waitFor();
  await session();checks.push('persisted history, preview, ZIP after navigation/reload');
  const anonymous=await browser.newContext();
  const privateDownload=await anonymous.request.get(origin+photo.download_url);
  assert.equal(privateDownload.status(),401,'Exports must remain private');
  await anonymous.close();checks.push('anonymous export denied');
  await page.screenshot({path:'/tmp/docuvisa-browser-documents.png',fullPage:true});
  assert.deepEqual(failures,[],'No browser JavaScript/network/API failure expected');
  await context.storageState({path:process.env.AUTH_STATE_PATH||'/tmp/docuvisa-browser-state.json'});
  console.log(JSON.stringify({origin,checks,jobPosts,browserErrors:failures},null,2));
}finally{
  if(failures.length)console.error(JSON.stringify({browserErrors:failures}));
  await page.screenshot({path:'/tmp/docuvisa-browser-last.png',fullPage:true}).catch(()=>{});
  await browser.close();
}
