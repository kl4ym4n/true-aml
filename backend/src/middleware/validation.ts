import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { BadRequestError } from '../lib/errors';

/**
 * Request validation middleware using Zod
 * @param schema - Zod schema to validate against
 */
export const validate = (schema: ZodSchema) => {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
        }));

        next(new BadRequestError(
          `Validation failed: ${errors.map((e) => e.message).join(', ')}`
        ));
        return;
      }
      next(error);
    }
  };
};

