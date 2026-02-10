import { Router } from 'express';
import { checkAddress, checkTransaction } from './check.controller';
import { validate } from '../../middleware/validation';
import {
  addressCheckRequestSchema,
  transactionCheckRequestSchema,
} from './check.schemas';
import { apiKeyAuth } from '../../middleware/apiKeyAuth';
import { checkRateLimiter } from '../../middleware/rateLimiter';

const router = Router();

/**
 * @openapi
 * /api/v1/check/address:
 *   post:
 *     summary: Check TRON address for AML risk
 *     tags: [Check]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - address
 *             properties:
 *               address:
 *                 type: string
 *                 description: TRON address to check (34 characters, starts with T)
 *                 example: "TExample1234567890123456789012345678"
 *     responses:
 *       200:
 *         description: Address check completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     address:
 *                       type: string
 *                     riskScore:
 *                       type: number
 *                     riskLevel:
 *                       type: string
 *                       enum: [LOW, MEDIUM, HIGH, CRITICAL]
 *                     flags:
 *                       type: array
 *                       items:
 *                         type: string
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Too many requests
 *       500:
 *         description: Internal server error
 */
router.post(
  '/address',
  apiKeyAuth,
  checkRateLimiter,
  validate(addressCheckRequestSchema),
  checkAddress
);

/**
 * @openapi
 * /api/v1/check/transaction:
 *   post:
 *     summary: Check TRON transaction for AML risk
 *     tags: [Check]
 *     security:
 *       - ApiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - txHash
 *             properties:
 *               txHash:
 *                 type: string
 *                 description: Transaction hash (64 character hex string)
 *                 example: "abc123def456..."
 *     responses:
 *       200:
 *         description: Transaction check completed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     txHash:
 *                       type: string
 *                     riskScore:
 *                       type: number
 *                     riskLevel:
 *                       type: string
 *                       enum: [LOW, MEDIUM, HIGH, CRITICAL]
 *                     flags:
 *                       type: array
 *                       items:
 *                         type: string
 *       400:
 *         description: Invalid request
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Too many requests
 *       500:
 *         description: Internal server error
 */
router.post(
  '/transaction',
  apiKeyAuth,
  checkRateLimiter,
  validate(transactionCheckRequestSchema),
  checkTransaction
);

export default router;

