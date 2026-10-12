/** @type {import('next').NextConfig} */
// Next.js loads .env files itself. Server-only secrets (PRIVATE_KEY, MONGODB_URI)
// must not be listed under `env`, which would inline them into the browser bundle.
const nextConfig = {};

export default nextConfig;
