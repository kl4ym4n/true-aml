import { createRequire } from 'node:module';
import path from 'node:path';

// Anchor resolution at project root (two levels up from this file: src/lib -> app root).
// process.cwd() can differ from /app in some setups; __dirname does not.
export const requireFromProjectRoot = createRequire(
  path.join(__dirname, '../../package.json')
);
