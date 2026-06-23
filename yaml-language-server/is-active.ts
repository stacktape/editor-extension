import { basename } from 'path';
import { isMatch } from 'micromatch';

const VALID_STACKTAPE_CONFIG_PATTERNS = ['*stacktape.yml', '*stp.yml', '*stacktape.yaml', '*stp.yaml'];

export const isActive = (uri: string): boolean => {
  return isMatch(basename(uri), [...VALID_STACKTAPE_CONFIG_PATTERNS, ...STACKTAPE_DEBUG_FILE_PATTERNS]);
};

export const STACKTAPE_DEBUG_FILE_PATTERNS = [
  '*stacktape.debug.yml',
  '*stp.debug.yml',
  '*stacktape.debug.yaml',
  '*stp.debug.yaml'
];

export const isDebugFilePath = (uri: string): boolean => {
  return isMatch(basename(uri), STACKTAPE_DEBUG_FILE_PATTERNS);
};
