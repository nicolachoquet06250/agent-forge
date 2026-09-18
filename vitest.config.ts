import path from 'node:path';
import { defineConfig } from 'vitest/config';

const coverageLinkMapper = {
  getPath(node: any): string {
    if (typeof node === 'string') {
      return node;
    }

    let filePath = node.getQualifiedName();

    if (node.isSummary()) {
      return filePath ? `${filePath}/index.html` : 'index.html';
    }

    return `${filePath}.html`;
  },

  relativePath(source: any, target: any): string {
    const targetPath = this.getPath(target);

    /*
     * Cas problématique :
     *
     * coverage/lib/index.html est exposé sous /lib
     *
     * Istanbul produit normalement :
     *   href="download.ts.html"
     *
     * Le navigateur interprète alors ça depuis /lib comme :
     *   /download.ts.html
     *
     * Ici on génère :
     *   href="lib/download.ts.html"
     *
     * qui devient correctement :
     *   /lib/download.ts.html
     */
    if (
      typeof source !== 'string' &&
      source.isSummary() &&
      source.getQualifiedName()
    ) {
      const sourceRoute = source.getQualifiedName();
      const sourceDir = path.posix.dirname(sourceRoute);

      return path.posix.relative(
        sourceDir === '.' ? '' : sourceDir,
        targetPath,
      );
    }

    const sourcePath = this.getPath(source);
    const sourceDir = path.posix.dirname(sourcePath);

    return path.posix.relative(sourceDir, targetPath);
  },

  assetPath(node: any, name: string): string {
    return this.relativePath(this.getPath(node), name);
  },
};

export default defineConfig({
  test: {
    environment: 'node',

    include: [
      'tests/**/*.test.ts',
    ],

    coverage: {
      provider: 'v8',

      reporter: [
        'text',

        [
          'html',
          {
            linkMapper: coverageLinkMapper,
          },
        ],

        'json',
        'lcov',
        'cobertura',
      ],

      reportsDirectory: './coverage',

      include: [
        'src/lib/**/*.ts',
        'src/scripts/**/*.ts',
      ],

      exclude: [
        'src/lib/types.ts',
      ],

      thresholds: {
        statements: 70,
        branches: 65,
        functions: 70,
        lines: 70,
      },
    },
  },
});