const { runPESUDownloader, requestStop } = require('./downloader');

function createPESUAgent(defaults = {}) {
  return {
    requestStop,
    run(overrides = {}) {
      return runPESUDownloader({
        ...defaults,
        ...overrides,
      });
    },
  };
}

module.exports = {
  createPESUAgent,
};
