const path = require('node:path');
const { request } = require('../setup');
const { resolveLock, writeJsonAtomic } = require('../lib/source-lock');
const sources = require('../skill-sources.json');

resolveLock(sources, request).then((lock) => {
    writeJsonAtomic(path.join(__dirname, '..', 'skill-sources.lock.json'), lock);
    console.log(JSON.stringify(lock, null, 2));
}).catch((error) => { console.error(error.message); process.exitCode = 1; });
