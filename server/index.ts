import { createApp } from './app.js';
const port = Number(process.env.PORT || 3000);
const { app, close } = await createApp();
const server = app.listen(port, '0.0.0.0', () => {
 console.log(`FILLICO running on port ${port}`);
 console.log('Initial owner credentials, when generated, are stored in .local/admin-credentials.txt');
});
const shutdown = () => server.close(async () => { await close(); process.exit(0); });
process.on('SIGINT',shutdown);
process.on('SIGTERM',shutdown);
