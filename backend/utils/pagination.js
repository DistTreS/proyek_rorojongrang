const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 250;

const parseBoolean = (value) => {
  if (typeof value === 'boolean') return value;
  if (value === undefined || value === null) return false;
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

const parsePositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const parsePagination = (query = {}) => {
  const all = parseBoolean(query.all);
  const page = parsePositiveInteger(query.page, 1);
  const requestedPageSize = parsePositiveInteger(query.pageSize, DEFAULT_PAGE_SIZE);
  const pageSize = Math.min(requestedPageSize, MAX_PAGE_SIZE);

  return {
    all,
    page,
    pageSize
  };
};

const paginateItems = (items, pagination = {}) => {
  const list = Array.isArray(items) ? items : [];
  if (pagination.all) {
    return list;
  }

  const pageSize = pagination.pageSize || DEFAULT_PAGE_SIZE;
  const totalItems = list.length;
  const totalPages = totalItems > 0 ? Math.ceil(totalItems / pageSize) : 1;
  const page = Math.min(Math.max(pagination.page || 1, 1), totalPages);
  const offset = (page - 1) * pageSize;

  return {
    items: list.slice(offset, offset + pageSize),
    page,
    pageSize,
    totalItems,
    totalPages
  };
};

module.exports = {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  paginateItems,
  parsePagination
};
