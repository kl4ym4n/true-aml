import app from './app';
import { env } from './config/env';
import prisma from './config/database';
import { initializeBlacklist } from './modules/blacklist';

const startServer = async (): Promise<void> => {
  try {
    // Test database connection
    await prisma.$connect();
    console.log('✅ Database connected successfully');

    // Load blacklist from file
    await initializeBlacklist();

    // Start server
    const expressApp = app();
    expressApp.listen(env.port, () => {
      console.log(`🚀 Server running on port ${env.port}`);
      console.log(`📍 Health check: http://localhost:${env.port}/health`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

startServer();
