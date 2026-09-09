import { startStaticServer } from './server.js';

const { url } = await startStaticServer(Number(process.env.PORT || 4173));
console.log(`ZOLF Lift served at ${url}`);
