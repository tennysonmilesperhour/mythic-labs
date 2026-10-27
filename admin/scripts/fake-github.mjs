// Minimal fake of the GitHub Git Data API, for testing lib/store.ts without a token.
// Strict where it matters: a ref update must build on the current head (else 422),
// like GitHub. Usage: node scripts/fake-github.mjs [port]  (default 4010)
import http from 'node:http';
import crypto from 'node:crypto';

const h = (s) => crypto.createHash('sha1').update(s).digest('hex');
const blobs = {}, trees = {}, commits = {}, refs = {}; let calls = 0; const log = [];
const blobSha = (t) => { const b = Buffer.from(t, 'utf8'); return crypto.createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex'); };
const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
http.createServer((req, res) => {
  let body = ''; req.on('data', (c) => (body += c)); req.on('end', () => {
    calls++;
    const u = new URL(req.url, 'http://x'); const p = decodeURIComponent(u.pathname); const j = body ? JSON.parse(body) : {};
    if (p === '/__stats') return send(res, 200, { calls, refs, log, commits: Object.keys(commits).length });
    if (!req.headers.authorization) return send(res, 401, { message: 'Requires authentication' });
    let m;
    // Repo metadata: private unless FAKE_PUBLIC_REPOS lists it (e.g. "me/site,me/brain").
    if (req.method === 'GET' && (m = p.match(/^\/repos\/([^/]+\/[^/]+)$/))) {
      const isPublic = (process.env.FAKE_PUBLIC_REPOS || '').split(',').includes(m[1]);
      return send(res, 200, { full_name: m[1], private: !isPublic });
    }
    if (req.method === 'GET' && (m = p.match(/^\/repos\/[^/]+\/[^/]+\/git\/ref\/heads\/(.+)$/))) {
      const sha = refs[m[1]]; return sha ? send(res, 200, { ref: `refs/heads/${m[1]}`, object: { sha, type: 'commit' } }) : send(res, 404, { message: 'Not Found' });
    }
    if (req.method === 'GET' && (m = p.match(/git\/commits\/(\w+)$/))) return commits[m[1]] ? send(res, 200, commits[m[1]]) : send(res, 404, {});
    if (req.method === 'GET' && (m = p.match(/git\/trees\/(\w+)$/))) {
      const t = trees[m[1]]; if (!t) return send(res, 404, {});
      return send(res, 200, { sha: m[1], tree: Object.entries(t).map(([path, sha]) => ({ path, sha, type: 'blob', mode: '100644' })), truncated: false });
    }
    if (req.method === 'GET' && (m = p.match(/git\/blobs\/(\w+)$/))) return send(res, 200, { sha: m[1], encoding: 'base64', content: Buffer.from(blobs[m[1]], 'utf8').toString('base64') });
    if (req.method === 'POST' && p.endsWith('/git/trees')) {
      const t = { ...(j.base_tree ? trees[j.base_tree] : {}) };
      for (const e of j.tree) { if (e.sha === null) delete t[e.path]; else { const s = blobSha(e.content); blobs[s] = e.content; t[e.path] = s; } }
      const sha = h(JSON.stringify(t)); trees[sha] = t; return send(res, 201, { sha });
    }
    if (req.method === 'POST' && p.endsWith('/git/commits')) {
      const sha = h(JSON.stringify(j) + Math.random()); commits[sha] = { sha, message: j.message, tree: { sha: j.tree }, parents: j.parents.map((s) => ({ sha: s })) };
      return send(res, 201, { sha });
    }
    if (req.method === 'PATCH' && (m = p.match(/git\/refs\/heads\/(.+)$/))) {
      const c = commits[j.sha];
      if (!refs[m[1]]) return send(res, 422, { message: 'Reference does not exist' });
      if (!j.force && c.parents[0]?.sha !== refs[m[1]]) return send(res, 422, { message: 'Update is not a fast forward' });
      refs[m[1]] = j.sha; log.push(c.message); return send(res, 200, { object: { sha: j.sha } });
    }
    if (req.method === 'POST' && p.endsWith('/git/refs')) {
      const b = j.ref.replace('refs/heads/', ''); if (refs[b]) return send(res, 422, { message: 'Reference already exists' });
      refs[b] = j.sha; log.push(commits[j.sha].message); return send(res, 201, {});
    }
    send(res, 404, { message: `fake: no route ${req.method} ${p}` });
  });
}).listen(Number(process.argv[2] || 4010), () => console.log(`fake github on ${process.argv[2] || 4010}`));
