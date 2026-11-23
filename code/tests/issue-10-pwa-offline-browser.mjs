import assert from "node:assert/strict";
import {chromium} from "playwright";

// The production app registers the service worker only on HTTPS. On localhost,
// install it explicitly so a clean-profile offline launch follows the same SW
// fetch/cache contract as the deployed HTTPS installation.
const browser=await chromium.launch({headless:true});
try{
  const context=await browser.newContext({serviceWorkers:"allow"});
  try{
    const page=await context.newPage();
    await page.goto("http://127.0.0.1:4173/",{waitUntil:"domcontentloaded"});
    await page.evaluate(async()=>{
      await navigator.serviceWorker.register("/service-worker.js",{scope:"/"});
      await navigator.serviceWorker.ready;
    });
    await page.waitForFunction(()=>Boolean(navigator.serviceWorker.controller),null,{timeout:20000});
    const cacheState=await page.evaluate(async()=>{
      const keys=(await caches.keys()).filter(key=>key.startsWith("mu-chordbot-"));
      const cache=await caches.open(keys.at(-1));
      const expected=["/ratio-mode/","/ratio-mode/index.html",
        "/ratio-mode/app.js","/ratio-mode/model.mjs","/ratio-mode/loudness.mjs"];
      const entries=await Promise.all(expected.map(async path=>Boolean(await cache.match(path))));
      return {keys,expected,entries};
    });
    assert.equal(cacheState.keys.length,1,"clean install should create one versioned app cache");
    assert.ok(cacheState.entries.every(Boolean),
      "fresh install missed ratio navigation/module precache: "+JSON.stringify(cacheState));

    await context.setOffline(true);
    await page.goto("http://127.0.0.1:4173/ratio-mode/",{waitUntil:"domcontentloaded"});
    await page.locator(".progression-cell[data-cid]").first().waitFor({timeout:10000});
    assert.ok(await page.locator(".progression-cell[data-cid]").count()>=5,
      "first offline ratio launch did not initialize the progression");
    await page.reload({waitUntil:"domcontentloaded"});
    assert.ok(await page.locator(".progression-cell[data-cid]").count()>=5,
      "offline ratio reload cannot resolve module graph");
    console.log("CLEAN_PROFILE_OFFLINE_RATIO_LAUNCH PASS "+JSON.stringify(cacheState));
  }finally{await context.close()}
}finally{await browser.close()}
