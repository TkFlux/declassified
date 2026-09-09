/**
 * Read-only mode: Vercel / serverless, explicit READ_ONLY=1, or no writable SQLite.
 * In this mode the feed reads bundled JSON and drafts are disabled.
 */
export function isReadOnly(): boolean {
  if (process.env.READ_ONLY === '1' || process.env.READ_ONLY === 'true') {
    return true;
  }
  if (process.env.VERCEL) {
    return true;
  }
  return false;
}

export const READ_ONLY_BANNER =
  'Drafts are disabled on this deploy';
