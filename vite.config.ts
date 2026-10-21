import path from 'path';
import fs from 'fs';
import { defineConfig, Plugin } from 'vite';

function copyDirRecursive(src: string, dest: string) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyPortalAssetsPlugin(): Plugin {
  return {
    name: 'copy-portal-assets',
    closeBundle() {
      const rootDir = import.meta.dirname || process.cwd();
      const distDir = path.resolve(rootDir, 'dist');
      copyDirRecursive(path.resolve(rootDir, 'js'), path.join(distDir, 'js'));
      copyDirRecursive(path.resolve(rootDir, 'css'), path.join(distDir, 'css'));
      copyDirRecursive(path.resolve(rootDir, 'assets'), path.join(distDir, 'assets'));
    },
  };
}

export default defineConfig(() => {
  const rootDir = import.meta.dirname || process.cwd();

  return {
    plugins: [copyPortalAssetsPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(rootDir, '.'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          main: path.resolve(rootDir, 'index.html'),
          timetable: path.resolve(rootDir, 'pages/timetable.html'),
          attendance: path.resolve(rootDir, 'pages/attendance.html'),
          results: path.resolve(rootDir, 'pages/results.html'),
          faculty: path.resolve(rootDir, 'pages/faculty.html'),
          login: path.resolve(rootDir, 'pages/login.html'),
        },
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
