/** Reuse an existing browser cookie after a container replacement or redeploy. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin=process.env.TEST_ORIGIN||'http://127.0.0.1:10001';
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/snap/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
try{
  const context=await browser.newContext({storageState:process.env.AUTH_STATE_PATH||'/tmp/docuvisa-browser-state.json'});
  const session=await context.request.get(origin+'/api/auth/session',{timeout:90000});
  assert.equal(session.status(),200,'Saved browser session must be readable');
  assert((await session.json()).user?.id,'Saved browser cookie must still identify the account');
  const history=await context.request.get(origin+'/api/jobs');
  assert.equal(history.status(),200,'Persisted history must be authorized');
  const completed=(await history.json()).filter(job=>job.status==='completed');
  assert(completed.length>0,'Expected completed jobs from the earlier browser run');
  let downloads=0;
  for(const job of completed){
    const response=await context.request.get(origin+job.download_url);
    assert.equal(response.status(),200,'Archived output must survive container replacement');
    const bytes=await response.body();
    assert(bytes.length>0,'Archived output must contain bytes');
    const type=response.headers()['content-type']||'';
    if(type.includes('png'))assert.deepEqual(bytes.subarray(0,8),Buffer.from([137,80,78,71,13,10,26,10]));
    else if(type.includes('jpeg'))assert.deepEqual(bytes.subarray(0,3),Buffer.from([255,216,255]));
    else if(type.includes('pdf'))assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
    else if(type.includes('officedocument'))assert.equal(bytes.subarray(0,2).toString(),'PK');
    else assert.fail('Expected a recognized image, PDF or Office export content type');
    downloads++;
  }
  const archive=await context.request.get(origin+'/api/jobs/export.zip');
  assert.equal(archive.status(),200,'Bundle of persisted outputs must remain available');
  assert.equal((await archive.body()).subarray(0,2).toString(),'PK');
  console.log(JSON.stringify({accountExists:true,completedDownloads:downloads,zipValid:true}));
}finally{await browser.close()}
