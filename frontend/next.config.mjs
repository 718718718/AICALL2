/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  reactStrictMode: false,
  async rewrites() {
    // 本番環境（Vercel）では外部APIへのrewriteを無効化
    if (process.env.NODE_ENV === 'production') {
      return [];
    }

    // 開発環境でのみローカルAPIサーバーへのrewrite
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:5000/api/:path*',
      },
    ];
  },
}

export default nextConfig
