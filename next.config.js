/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // Allow images from data URLs (base64)
    images: {
        remotePatterns: [],
    },
};

module.exports = nextConfig;
