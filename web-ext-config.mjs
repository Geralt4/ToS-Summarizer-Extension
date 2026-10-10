export default {
  ignoreFiles: [
    'tests',
    'coverage',
    'node_modules',
    'package.json',
    'package-lock.json',
    '*.md',
    '.github',
    '.git',
    '.gitignore',
    'web-ext-config.mjs',
    'web-ext-artifacts',
  ],
  build: { overwriteDest: true },
};
