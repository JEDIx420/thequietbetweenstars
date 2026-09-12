/**
 * Companion URL Construction Helper
 *
 * Ensures precise URL generation across local development and GitHub Pages project subpaths.
 */

export interface BuildCompanionUrlOptions {
  origin: string;
  pathname: string;
  basePath?: string;
  session: string;
  token: string;
  signalingUrl?: string | null;
}

export function buildCompanionUrl(options: BuildCompanionUrlOptions): string {
  const { origin, pathname, basePath, session, token, signalingUrl } = options;

  const cleanOrigin = origin.trim().replace(/\/+$/, '');

  // Prefer configured Vite base path if it is a project subpath (e.g. '/thequietbetweenstars/')
  let path = (basePath && basePath.trim() !== '' && basePath.trim() !== '/')
    ? basePath.trim()
    : pathname.trim();

  // Strip index.html or similar filenames from path
  path = path.replace(/\/(index\.html?)$/i, '/');

  // Collapse multiple consecutive slashes
  path = path.replace(/\/+/g, '/');

  // Prevent duplicate base segments (e.g. '/thequietbetweenstars/thequietbetweenstars/')
  const duplicateSegment = '/thequietbetweenstars/thequietbetweenstars/';
  if (path.startsWith(duplicateSegment)) {
    path = path.replace(duplicateSegment, '/thequietbetweenstars/');
  }

  // Ensure starts and ends with slash
  if (!path.startsWith('/')) {
    path = '/' + path;
  }
  if (!path.endsWith('/')) {
    path = path + '/';
  }

  const url = new URL(path, cleanOrigin);
  url.searchParams.set('mode', 'companion');
  url.searchParams.set('session', session);
  url.searchParams.set('token', token);

  if (signalingUrl && signalingUrl.trim().length > 0) {
    url.searchParams.set('signaling', signalingUrl.trim());
  }

  return url.toString();
}
