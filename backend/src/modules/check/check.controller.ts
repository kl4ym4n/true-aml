import { Request, Response, NextFunction } from 'express';
import { addressCheckService } from '../address-check';
import { transactionCheckService } from '../transaction-check';
import { InternalServerError, AppError } from '../../lib/errors';

/**
 * Check address for AML risk
 * POST /api/v1/check/address
 */
export const checkAddress = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { address } = req.body;

    const result = await addressCheckService.analyzeAddress(address);

    // Determine risk level based on score ranges
    // 0–20 → clean (LOW), 21–40 → low risk (LOW), 41–60 → medium risk (MEDIUM), 61–80 → high risk (HIGH), 81–100 → critical (CRITICAL)
    const riskLevel =
      result.riskScore >= 81
        ? 'CRITICAL'
        : result.riskScore >= 61
          ? 'HIGH'
          : result.riskScore >= 41
            ? 'MEDIUM'
            : 'LOW';

    res.status(200).json({
      success: true,
      data: {
        address: result.metadata.address,
        riskScore: result.riskScore,
        riskLevel,
        flags: result.flags,
        metadata: {
          isBlacklisted: result.metadata.isBlacklisted,
          blacklistCategory: result.metadata.blacklistCategory,
          transactionCount: result.metadata.transactionCount,
          addressAgeDays: result.metadata.addressAgeDays,
          firstSeenAt: result.metadata.firstSeenAt?.toISOString() || null,
        },
      },
    });
  } catch (error) {
    // If it's already an AppError, pass it through
    if (error instanceof AppError) {
      next(error);
      return;
    }
    // Otherwise, wrap in InternalServerError
    if (error instanceof Error) {
      next(
        new InternalServerError(`Failed to check address: ${error.message}`)
      );
      return;
    }
    next(error);
  }
};

/**
 * Check transaction for AML risk
 * POST /api/v1/check/transaction
 */
export const checkTransaction = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { txHash } = req.body;

    const result = await transactionCheckService.analyzeTransaction(txHash);

    res.status(200).json({
      success: true,
      data: {
        txHash: result.txHash,
        riskScore: result.riskScore,
        riskLevel: result.riskLevel,
        flags: result.flags,
        metadata: {
          transferData: {
            from: result.metadata.transferData.from,
            to: result.metadata.transferData.to,
            amount: result.metadata.transferData.amount,
            tokenAddress: result.metadata.transferData.tokenAddress,
            tokenSymbol: result.metadata.transferData.tokenSymbol,
          },
          sender: {
            address: result.metadata.senderAnalysis.metadata.address,
            riskScore: result.metadata.senderAnalysis.riskScore,
            flags: result.metadata.senderAnalysis.flags,
            isBlacklisted:
              result.metadata.senderAnalysis.metadata.isBlacklisted,
          },
          receiver: {
            address: result.metadata.receiverAnalysis.metadata.address,
            riskScore: result.metadata.receiverAnalysis.riskScore,
            flags: result.metadata.receiverAnalysis.flags,
            isBlacklisted:
              result.metadata.receiverAnalysis.metadata.isBlacklisted,
          },
          tainting: {
            isTainted: result.metadata.taintingCheck.isTainted,
            taintedFromAddress:
              result.metadata.taintingCheck.taintedFromAddress,
          },
          timestamp: result.metadata.timestamp.toISOString(),
        },
      },
    });
  } catch (error) {
    // If it's already an AppError, pass it through
    if (error instanceof AppError) {
      next(error);
      return;
    }
    // Otherwise, wrap in InternalServerError
    if (error instanceof Error) {
      next(
        new InternalServerError(`Failed to check transaction: ${error.message}`)
      );
      return;
    }
    next(error);
  }
};
