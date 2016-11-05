import sourcemaps from 'rollup-plugin-sourcemaps';
import buble from 'rollup-plugin-buble';
import {join} from 'path';

const outBase = join(__dirname, 'build', 'lib');

export default {
  entry: join(outBase, 'index.js'),
  dest: join(__dirname, 'build', 'browserfs-zipfs-extras.js'),
  sourceMap: true,
  useStrict: true,
  format: 'iife',
  external: [
    'browserfs'
  ],
  globals: {
    'browserfs': 'BrowserFS'
  },
  plugins: [
    sourcemaps(),
    buble()
  ]
};
