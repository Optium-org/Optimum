import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Включаем typedRoutes по новой схеме
  typedRoutes: true,
  // Включаем Turbopack по новой схеме
  turbopack: {},
  // Отключаем React Compiler, чтобы не требовать babel-plugin-react-compiler
  experimental: {
    // reactCompiler: true, // отключено
  },
  // Гасим предупреждение о корне воркспейса
  outputFileTracingRoot: path.resolve(process.cwd()),
};

export default nextConfig;
