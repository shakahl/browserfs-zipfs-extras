'use strict';
const detectBrowsers = require('detect-browsers');
const seenBrowsers = {};
const isTravis = process.env.TRAVIS;
// Browser detection does not work properly on Travis.
const installedBrowsers = isTravis ? ['Firefox'] : detectBrowsers.getInstalledBrowsers()
  .map(function(browser) { return browser.name; })
  .filter(function(browser) {
    if (seenBrowsers[browser]) {
      return false;
    } else {
      seenBrowsers[browser] = true;
      return true;
    }
  });

module.exports = function(configSetter) {
  configSetter.set({
    basePath: __dirname,
    frameworks: ['mocha'],
    files: [
      {pattern: 'test/fixtures/**/*', included: false},
      'node_modules/browserfs/dist/browserfs.js',
      'dist/browserfs-zipfs-extras.js',
      'node_modules/js-crc/build/crc.min.js',
      'build/test/index.js'
    ],
    exclude: [],
    reporters: ['progress'],
    port: 9876,
    colors: true,
    logLevel: 'INFO',
    autoWatch: true,
    concurrency: 1,
    browsers: installedBrowsers,
    captureTimeout: 60000,
    singleRun: true,
    urlRoot: '/',
    browserNoActivityTimeout: 30000,
    browserDisconnectTimeout: 10000,
    browserDisconnectTolerance: 3,
    client: {
      mocha: {
        // Stop tests after first failure.
        bail: true
      }
    }
  });
};
