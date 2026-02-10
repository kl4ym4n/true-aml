import { Request, Response } from 'express';
import prisma from '../../config/database';

export const healthCheck = async (
  _req: Request,
  res: Response
): Promise<void> => {
  try {
    // Check database connection
    await prisma.$queryRaw`SELECT 1`;

    res.status(200).json({
      success: true,
      data: {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
      },
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      data: {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: 'Database connection failed',
      },
    });
  }
};
