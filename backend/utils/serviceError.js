const serviceError = (status, message, details = null, code = null) => {
  const error = new Error(message);
  error.status = status;
  if (details && typeof details === 'object') {
    error.details = details;
  }
  if (code) {
    error.code = String(code);
  }
  return error;
};

module.exports = {
  serviceError
};
