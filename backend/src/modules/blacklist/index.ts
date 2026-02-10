// Export service functions
export { blacklistService, BlacklistService } from './blacklist.service';

// Export loader functions
export { loadBlacklistFromFile, initializeBlacklist } from './blacklist.loader';

// Export types
export type {
  BlacklistEntry,
  BlacklistJsonEntry,
  BlacklistJsonData,
} from './blacklist.types';
