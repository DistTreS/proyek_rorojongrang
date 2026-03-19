const toMetaString = (meta) => {
  if (!meta || typeof meta !== 'object') {
    return '';
  }

  try {
    return ` ${JSON.stringify(meta)}`;
  } catch (err) {
    return ' {"meta":"unserializable"}';
  }
};

const log = (level, scope, message, meta) => {
  const method = console[level] || console.log;
  method(`[${scope}] ${message}${toMetaString(meta)}`);
};

const logInfo = (scope, message, meta) => log('info', scope, message, meta);
const logWarn = (scope, message, meta) => log('warn', scope, message, meta);
const logError = (scope, message, meta) => log('error', scope, message, meta);

module.exports = {
  logError,
  logInfo,
  logWarn
};
