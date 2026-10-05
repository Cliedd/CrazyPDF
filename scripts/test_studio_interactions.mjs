import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile } from 'node:fs/promises';
const origin=process.env.TEST_ORIGIN||'https://crazypdf-g2bc.onrender.com';
const directory=new URL('../data/browser-downloads/',import.meta.url).pathname;
await mkdir(directory,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:'/snap/bin/chromium',downloadsPath:directory,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const context=await browser.newContext({storageState:'/tmp/docuvisa-browser-render-state.json',acceptDownloads:true});
 if(process.env.TEST_FRONTEND_BUNDLE)await context.route('**/assets/index-*.js',route=>route.fulfill({path:process.env.TEST_FRONTEND_BUNDLE,contentType:'application/javascript'}));
 const page=await context.newPage();page.setDefaultTimeout(90000);page.setDefaultNavigationTimeout(120000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/studio');await page.locator('#preset-select').selectOption('fr-visa');
 const chooser=page.waitForEvent('filechooser');await page.locator('[data-action="upload-photo"]').click();const photoPath=process.env.TEST_PHOTO||new URL('../frontend/public/assets/243d5220011d19a6.png',import.meta.url).pathname;await(await chooser).setFiles({name:photoPath.split('/').at(-1),mimeType:'image/jpeg',buffer:await readFile(photoPath)});
 await page.waitForFunction(name=>document.querySelector('#photo-name')?.textContent===name,process.env.TEST_PHOTO?process.env.TEST_PHOTO.split('/').at(-1):'243d5220011d19a6.png');console.log('PASS photo imported');
 const pixels=async()=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));return page.locator('#photo-canvas').evaluate(c=>{const d=c.getContext('2d').getImageData(c.width/2,c.height/2,1,1).data;return [...d]})};
 if(process.env.TEST_PHOTO)assert(await page.locator('#exposure-note').count());
 const before=await pixels();await page.locator('#slider-bright').fill('20');assert.notDeepEqual(await pixels(),before);
 console.log('PASS exposure preview');
 const event=page.waitForEvent('download',{timeout:600000});await page.locator('#btn-download-photo').click();await(await event).saveAs('/tmp/docuvisa-studio-interactions.png');console.log('PASS photo downloaded');
 await page.waitForFunction(()=>!document.querySelector('#btn-download-photo').disabled);
 await page.locator('#slider-bright').fill('-20');assert.notDeepEqual(await pixels(),before);
 await page.locator('#reset-view-btn').click();assert.deepEqual(await pixels(),before);
 await page.locator('#preset-select').selectOption('us-visa');assert(await page.locator('#slider-bright').isDisabled());
 await page.locator('#preset-select').selectOption('fr-visa');assert(!(await page.locator('#slider-bright').isDisabled()));
 await page.locator('header a[href="/documents"]').click();await page.waitForURL(origin+'/documents');
 await page.locator('header a[href="/studio"]').click();await page.waitForURL(origin+'/studio');await page.locator('#slider-bright').fill('15');
 assert.deepEqual(errors,[]);console.log('PASS exposure before/after download, reset, preset rules, navigation and returning to studio');
}finally{await browser.close()}
