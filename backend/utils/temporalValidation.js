const { serviceError } = require('./serviceError');

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const normalizeDateOnly = (value, fieldLabel = 'Tanggal') => {
  const text = String(value || '').trim();
  if (!DATE_ONLY_PATTERN.test(text)) {
    throw serviceError(400, `${fieldLabel} tidak valid`);
  }

  const [yearText, monthText, dayText] = text.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  const sameDate = (
    parsed.getUTCFullYear() === year
    && (parsed.getUTCMonth() + 1) === month
    && parsed.getUTCDate() === day
  );

  if (!sameDate) {
    throw serviceError(400, `${fieldLabel} tidak valid`);
  }

  return text;
};

const normalizeOptionalDateOnly = (value, fieldLabel = 'Tanggal') => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  return normalizeDateOnly(value, fieldLabel);
};

const ensureDateOrder = (
  startDate,
  endDate,
  {
    startLabel = 'Tanggal mulai',
    endLabel = 'Tanggal akhir',
    allowEqual = true,
    errorMessage = `${endLabel} harus setelah atau sama dengan ${startLabel.toLowerCase()}`
  } = {}
) => {
  const normalizedStartDate = normalizeDateOnly(startDate, startLabel);
  const normalizedEndDate = normalizeDateOnly(endDate, endLabel);

  const invalid = allowEqual
    ? normalizedStartDate > normalizedEndDate
    : normalizedStartDate >= normalizedEndDate;

  if (invalid) {
    throw serviceError(400, errorMessage);
  }

  return {
    startDate: normalizedStartDate,
    endDate: normalizedEndDate
  };
};

module.exports = {
  ensureDateOrder,
  normalizeDateOnly,
  normalizeOptionalDateOnly
};
