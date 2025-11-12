const { join } = require('path');

/**
 * @type {import("puppeteer").Configuration}
 * 
 * Puppeteer configuration for Render.com deployment
 * Stores Chrome in project directory instead of system cache
 */
module.exports = {
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
};
