const serializeValidationResult = (validation) => {
  if (!validation || typeof validation !== 'object') {
    return validation;
  }

  const { data, ...payload } = validation;
  return payload;
};

const handleControllerError = (res, err, fallbackMessage) => {
  if (err?.validation) {
    return res.status(err.status || 422).json(serializeValidationResult(err.validation));
  }

  if (err?.status) {
    const payload = { message: err.message };
    if (err.code) payload.code = err.code;
    if (err.details && typeof err.details === 'object') payload.details = err.details;
    return res.status(err.status).json(payload);
  }

  return res.status(500).json({ message: fallbackMessage });
};

module.exports = {
  handleControllerError,
  serializeValidationResult
};
