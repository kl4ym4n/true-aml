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
    const { address, debugSof } = req.body as {
      address: string;
      debugSof?: boolean;
    };

    const result = await addressCheckService.analyzeAddress(address, {
      debugSof,
    });

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

    const { metadata } = result;

    res.status(200).json({
      success: true,
      data: {
        address: metadata.address,
        riskScore: result.riskScore,
        riskLevel,
        flags: result.flags,
        metadata: {
          isBlacklisted: metadata.isBlacklisted,
          blacklistCategory: metadata.blacklistCategory,
          blacklistRiskScore: metadata.blacklistRiskScore,
          transactionCount: metadata.transactionCount,
          addressAgeDays: metadata.addressAgeDays,
          firstSeenAt: metadata.firstSeenAt?.toISOString() || null,
          sourceBreakdown: metadata.sourceBreakdown ?? undefined,
          ...(metadata.allTrc20IncomingVolume !== undefined && {
            allTrc20IncomingVolume: metadata.allTrc20IncomingVolume,
          }),
          ...(metadata.stablecoinIncomingVolume !== undefined && {
            stablecoinIncomingVolume: metadata.stablecoinIncomingVolume,
          }),
          ...(metadata.totalIncomingVolume !== undefined && {
            totalIncomingVolume: metadata.totalIncomingVolume,
          }),
          ...(metadata.hasStablecoinSourceSample !== undefined && {
            hasStablecoinSourceSample: metadata.hasStablecoinSourceSample,
          }),
          ...(metadata.stablecoinSourceSampleReason !== undefined && {
            stablecoinSourceSampleReason: metadata.stablecoinSourceSampleReason,
          }),
          ...(metadata.stablecoinSofWarning !== undefined && {
            stablecoinSofWarning: metadata.stablecoinSofWarning,
          }),
          ...(metadata.stablecoinSofDataSource !== undefined && {
            stablecoinSofDataSource: metadata.stablecoinSofDataSource,
          }),
          ...(metadata.walletActivityContext !== undefined && {
            walletActivityContext: metadata.walletActivityContext,
          }),
          ...(metadata.taintInput !== undefined && {
            taintInput: metadata.taintInput,
          }),
          ...(metadata.riskyIncomingVolume !== undefined && {
            riskyIncomingVolume: metadata.riskyIncomingVolume,
          }),
          ...(metadata.taintPercent !== undefined && {
            taintPercent: metadata.taintPercent,
          }),
          ...(metadata.topRiskyCounterparties !== undefined && {
            topRiskyCounterparties: metadata.topRiskyCounterparties.map(cp => ({
              address: cp.address,
              incomingVolume: cp.incomingVolume,
              riskScore: cp.riskScore,
              risky: cp.risky,
              ...(cp.entityType !== undefined && { entityType: cp.entityType }),
              ...(cp.hopLevel !== undefined && { hopLevel: cp.hopLevel }),
              ...(cp.sofDebug !== undefined && { sofDebug: cp.sofDebug }),
            })),
          }),
          ...(metadata.taintCalculationStats !== undefined && {
            taintCalculationStats: metadata.taintCalculationStats,
          }),
          ...(metadata.scoreBreakdown !== undefined && {
            scoreBreakdown: metadata.scoreBreakdown,
          }),
          ...(metadata.sourceFlowCalibration !== undefined && {
            sourceFlowCalibration: metadata.sourceFlowCalibration,
          }),
          ...(metadata.sourceOfFundsSampleDebug !== undefined && {
            sourceOfFundsSampleDebug: metadata.sourceOfFundsSampleDebug,
          }),
          ...(metadata.walletContext !== undefined && {
            walletContext: metadata.walletContext,
          }),
          ...(metadata.explanation !== undefined &&
            metadata.explanation.length > 0 && {
              explanation: metadata.explanation,
            }),
          ...(metadata.addressSecurity !== undefined && {
            addressSecurity: metadata.addressSecurity,
          }),
          ...(metadata.liquidityPoolInteractions !== undefined && {
            liquidityPoolInteractions: metadata.liquidityPoolInteractions,
          }),
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
