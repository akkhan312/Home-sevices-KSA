const config = require('./config');
const { createApp } = require('./app');
const { initTimeoutScheduler } = require('./services/timeoutScheduler');

const { server, io } = createApp();

server.listen(config.PORT, '0.0.0.0', () => {
  console.log(`🚀 ServeHome API listening on port ${config.PORT} (${config.NODE_ENV})`);
  console.log(`🌐 Public URL: ${config.API_HOST}`);
  if (!config.STRIPE_SECRET_KEY) console.warn('⚠️  STRIPE_SECRET_KEY not set: card payments are disabled (bank transfer still works).');
  initTimeoutScheduler(io);
});

function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  io.close();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => console.error('Unhandled promise rejection:', reason));
