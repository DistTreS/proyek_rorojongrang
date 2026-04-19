/**
 * tests/unit_test/utils/logger.test.js
 * Unit test untuk utils/logger.js
 */

'use strict';

const { logInfo, logWarn, logError } = require('../../../utils/logger');

describe('logger', () => {
  let infoSpy, warnSpy, errorSpy, logSpy;

  beforeEach(() => {
    infoSpy  = jest.spyOn(console, 'info').mockImplementation(() => {});
    warnSpy  = jest.spyOn(console, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    logSpy   = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => jest.restoreAllMocks());

  test('logInfo → console.info dipanggil dengan format [scope] message', () => {
    logInfo('TEST', 'Helo dari test');
    expect(infoSpy).toHaveBeenCalledWith('[TEST] Helo dari test');
  });

  test('logWarn → console.warn dipanggil', () => {
    logWarn('TEST', 'Peringatan');
    expect(warnSpy).toHaveBeenCalledWith('[TEST] Peringatan');
  });

  test('logError → console.error dipanggil', () => {
    logError('TEST', 'Terjadi error');
    expect(errorSpy).toHaveBeenCalledWith('[TEST] Terjadi error');
  });

  test('dengan meta object → di-JSON stringify dan ditambahkan ke pesan', () => {
    logInfo('TEST', 'Data', { id: 1 });
    expect(infoSpy).toHaveBeenCalledWith('[TEST] Data {"id":1}');
  });

  test('meta null → tidak ada suffix', () => {
    logInfo('TEST', 'Pesan', null);
    expect(infoSpy).toHaveBeenCalledWith('[TEST] Pesan');
  });

  test('meta string (bukan object) → tidak ada suffix', () => {
    logInfo('TEST', 'Pesan', 'tidak-object');
    expect(infoSpy).toHaveBeenCalledWith('[TEST] Pesan');
  });

  test('meta dengan circular reference → fallback string unserializable', () => {
    const circular = {};
    circular.self = circular; // circular reference → JSON.stringify akan throw
    logInfo('TEST', 'Circular', circular);
    expect(infoSpy).toHaveBeenCalledWith('[TEST] Circular {"meta":"unserializable"}');
  });
});
