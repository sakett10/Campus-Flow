import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @param {string} phase
 * @returns {import('next').NextConfig}
 */
export default function createNextConfig(phase) {
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;

  return {
    distDir: isDev ? '.next-dev' : '.next',
    reactStrictMode: true,
    transpilePackages: ['@campusflow/types'],
    outputFileTracingRoot: path.resolve(__dirname, '../../'),
  };
}
