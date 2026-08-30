import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // We live in a nested folder with a stray parent lockfile; pin the trace root.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
