const { runPESUDownloader, discoverCatalog, requestStop } = require('./downloader');

function createPESUAgent(defaults = {}) {
  return {
    requestStop,
    run(overrides = {}) {
      return runPESUDownloader({
        ...defaults,
        ...overrides,
      });
    },
    discover(overrides = {}) {
      return discoverCatalog({
        ...defaults,
        ...overrides,
      });
    },
  };
}

module.exports = {
  createPESUAgent,
};
