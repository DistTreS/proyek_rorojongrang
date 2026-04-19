/**
 * tests/unit_test/helpers/mockResponse.js
 *
 * Membuat mock objek express `res` yang bisa digunakan di semua
 * unit test controller tanpa perlu supertest / koneksi DB.
 */

const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res); // chainable: res.status(404).json(...)
  res.json    = jest.fn().mockReturnValue(res);
  res.send    = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn().mockReturnValue(res);
  return res;
};

/**
 * Buat mock objek express `req` dengan nilai opsional.
 * @param {{ params?, query?, body?, user?, file? }} opts
 */
const mockRequest = (opts = {}) => ({
  params: opts.params || {},
  query:  opts.query  || {},
  body:   opts.body   || {},
  user:   opts.user   || null,
  file:   opts.file   || null,
  ...opts
});

module.exports = { mockRequest, mockResponse };
