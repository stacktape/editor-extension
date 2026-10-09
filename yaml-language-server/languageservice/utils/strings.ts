export function startsWith(haystack: string, needle: string): boolean {
  if (haystack.length < needle.length) {
    return false;
  }

  for (let i = 0; i < needle.length; i++) {
    if (haystack[i] !== needle[i]) {
      return false;
    }
  }

  return true;
}

/**
 * Determines if haystack ends with needle.
 */
export function endsWith(haystack: string, needle: string): boolean {
  const diff = haystack.length - needle.length;
  if (diff > 0) {
    return haystack.lastIndexOf(needle) === diff;
  }
  if (diff === 0) {
    return haystack === needle;
  }
  return false;
}

export function convertSimple2RegExp(pattern: string): RegExp {
  // eslint-disable-next-line prefer-regex-literals
  const match = pattern.match(new RegExp('^/(.*?)/([gimy]*)$'));
  return match ? convertRegexString2RegExp(match[1], match[2]) : convertGlobalPattern2RegExp(pattern);
}

function convertGlobalPattern2RegExp(pattern: string): RegExp {
  return new RegExp(`${pattern.replace(/[-\\{}+?|^$.,[\]()#\s]/g, '\\$&').replace(/[*]/g, '.*')}$`);
}

function convertRegexString2RegExp(pattern: string, flag: string): RegExp {
  return new RegExp(pattern, flag);
}

export function convertSimple2RegExpPattern(pattern: string): string {
  return pattern.replace(/[-\\{}+?|^$.,[\]()#\s]/g, '\\$&').replace(/[*]/g, '.*');
}
