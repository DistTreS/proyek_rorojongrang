export const DEFAULT_PAGE_SIZE = 25;

export const normalizePaginatedResponse = (data) => {
  if (data && Array.isArray(data.items)) {
    return {
      items: data.items,
      page: data.page || 1,
      pageSize: data.pageSize || DEFAULT_PAGE_SIZE,
      totalItems: data.totalItems || 0,
      totalPages: data.totalPages || 1
    };
  }

  if (Array.isArray(data)) {
    return {
      items: data,
      page: 1,
      pageSize: data.length || DEFAULT_PAGE_SIZE,
      totalItems: data.length,
      totalPages: 1
    };
  }

  return {
    items: [],
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    totalItems: 0,
    totalPages: 1
  };
};

export const buildPageParams = ({ page = 1, pageSize = DEFAULT_PAGE_SIZE, ...filters } = {}) => {
  const params = { page, pageSize };
  Object.entries(filters).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params[key] = value;
  });
  return params;
};

export const fetchAllPages = async (api, url, params = {}) => {
  const { data } = await api.get(url, {
    params: {
      ...params,
      all: true
    }
  });

  return Array.isArray(data) ? data : normalizePaginatedResponse(data).items;
};
