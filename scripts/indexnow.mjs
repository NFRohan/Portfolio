/**
 * Submit every URL in the sitemap to IndexNow.
 *
 * IndexNow is a push protocol: instead of waiting for a crawler to notice a
 * change, you tell the engines directly. Bing, Yandex, Seznam and Naver share
 * one endpoint, so a single call reaches all of them. Google does not
 * participate — use Search Console for that.
 *
 * The key is deliberately public. It is verified by hosting the same value at
 * https://<host>/<key>.txt, which proves control of the domain.
 *
 *   npm run indexnow
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const KEY = '05e377ea35b913f54e33c9be1fa285ad';
const HOST = 'nayeemfardin.vercel.app';
const ENDPOINT = 'https://api.indexnow.org/indexnow';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sitemap = readFileSync(join(root, 'public', 'sitemap.xml'), 'utf8');
const urlList = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1].trim());

if (!urlList.length) {
  console.error('No <loc> entries found in public/sitemap.xml — nothing to submit.');
  process.exit(1);
}

const body = {
  host: HOST,
  key: KEY,
  keyLocation: `https://${HOST}/${KEY}.txt`,
  urlList,
};

console.log(`Submitting ${urlList.length} URLs to IndexNow as ${HOST}`);
urlList.forEach((u) => console.log('  ' + u));

const res = await fetch(ENDPOINT, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify(body),
});

// 200 accepted, 202 accepted but key not yet verified, 400 bad request,
// 403 key not found at keyLocation, 422 url does not match host, 429 too many.
const text = await res.text();
console.log(`\n${res.status} ${res.statusText}${text ? ' — ' + text : ''}`);

if (res.status === 403) {
  console.error(`\nIndexNow could not read the key at https://${HOST}/${KEY}.txt.`);
  console.error('That file must be deployed and publicly reachable before submitting.');
}

process.exit(res.ok || res.status === 202 ? 0 : 1);
