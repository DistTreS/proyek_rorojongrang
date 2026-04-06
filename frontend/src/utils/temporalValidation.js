const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

const isValidDateOnly = (value) => {
  const text = String(value || '').trim();
  if (!DATE_ONLY_PATTERN.test(text)) return false;

  const [yearText, monthText, dayText] = text.split('-');
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year
    && (parsed.getUTCMonth() + 1) === month
    && parsed.getUTCDate() === day
  );
};

const isValidDateRange = (startDate, endDate, { allowEqual = true } = {}) => {
  if (!startDate || !endDate) return false;
  if (!isValidDateOnly(startDate) || !isValidDateOnly(endDate)) return false;
  return allowEqual ? startDate <= endDate : startDate < endDate;
};

const normalizeTimeText = (value) => {
  const text = String(value || '').trim();
  const match = text.match(TIME_PATTERN);
  if (!match) return null;
  return `${match[1]}:${match[2]}:${match[3] || '00'}`;
};

const isValidTimeRange = (startTime, endTime, { allowEqual = false } = {}) => {
  const normalizedStartTime = normalizeTimeText(startTime);
  const normalizedEndTime = normalizeTimeText(endTime);
  if (!normalizedStartTime || !normalizedEndTime) return false;
  return allowEqual
    ? normalizedStartTime <= normalizedEndTime
    : normalizedStartTime < normalizedEndTime;
};

export {
  isValidDateOnly,
  isValidDateRange,
  isValidTimeRange
};
