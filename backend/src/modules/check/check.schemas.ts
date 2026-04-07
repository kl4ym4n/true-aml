import { z } from 'zod';

/**
 * TRON address validation schema
 * TRON addresses are 34 characters, starting with 'T'
 */
const tronAddressSchema = z
  .string()
  .length(34, 'Address must be 34 characters')
  .regex(/^T[A-Za-z1-9]{33}$/, 'Invalid TRON address format');

/**
 * Transaction hash validation schema
 * TRON transaction hashes are 64 character hex strings
 */
const txHashSchema = z
  .string()
  .length(64, 'Transaction hash must be 64 characters')
  .regex(/^[a-fA-F0-9]{64}$/, 'Invalid transaction hash format');

/**
 * Address check request schema
 */
export const addressCheckRequestSchema = z.object({
  address: tronAddressSchema,
  /** When true, logs full SoF sample rows to server console (JSON). */
  debugSof: z.boolean().optional(),
});

/**
 * Transaction check request schema
 */
export const transactionCheckRequestSchema = z.object({
  txHash: txHashSchema,
});

export type AddressCheckRequest = z.infer<typeof addressCheckRequestSchema>;
export type TransactionCheckRequest = z.infer<
  typeof transactionCheckRequestSchema
>;
