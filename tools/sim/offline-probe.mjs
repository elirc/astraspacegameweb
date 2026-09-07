import { createServer } from 'node:http';
import { webkit } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
const sw = `self.addEventListener('install',e=>{e.waitUntil(caches.open('probe').then(c=>c.add('/')));self.skipWaiting()});self.addEventListener('activate',e=>e.waitUntil(clients.claim()));self.addEventListener('fetch',e=>e.respondWith(caches.match('/')));`;
const server = createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/sw.js'?'application/javascript':'text/html');res.end(req.url==='/sw.js'?sw:'<!doctype html><title>Offline probe</title><h1>Cached shell</h1><script>navigator.serviceWorker.register("/sw.js")</script>')});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await webkit.launch();
const context=await browser.newContext();
const page=await context.newPage();
const result={at:new Date().toISOString(),browser:'Windows WebKit',application:'minimal independent cache-only service worker'};
try {
 await page.goto('http://127.0.0.1:'+server.address().port);
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 await context.setOffline(true);
 await page.reload({timeout:15000});
 result.passed=(await page.title())==='Offline probe';
} catch(e) {result.passed=false;result.error=e.message}
finally {await browser.close();await new Promise(r=>server.close(r));}
await writeFile('artifacts/pwa-webkit-minimal.json',JSON.stringify(result,null,2));
console.log(JSON.stringify(result));
