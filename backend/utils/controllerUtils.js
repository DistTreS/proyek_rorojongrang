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
    return res.status(err.status).json({ message: err.message });
  }

  return res.status(500).json({ message: fallbackMessage });
};

module.exports = {
  handleControllerError,
  serializeValidationResult
};
