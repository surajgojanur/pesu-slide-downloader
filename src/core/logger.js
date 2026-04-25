const fs = require('fs');
const { ensureDir, now } = require('./fileUtils');

function createLogger({ logFile, onLog, secrets = [] }) {
  ensureDir(require('path').dirname(logFile));

  const redactions = secrets.filter(Boolean).map((secret) => String(secret));

  function redact(message) {
    return redactions.reduce((output, secret) => {
      if (!secret) {
        return output;
      }

      return output.split(secret).join('[redacted]');
    }, String(message || ''));
  }

  function emit(level, message) {
    const timestamp = now();
    const safeMessage = redact(message);
    const line = `[${timestamp}] ${safeMessage}`;
    fs.appendFileSync(logFile, `${line}\n`);
    if (level === 'error') {
      console.error(line);
    } else {
      console.log(line);
    }

    if (typeof onLog === 'function') {
      onLog({
        level,
        line,
        message: safeMessage,
        timestamp,
      });
    }
  }

  return {
    error(message) {
      emit('error', message);
    },
    log(message) {
      emit('info', message);
    },
  };
}

module.exports = {
  createLogger,
};
