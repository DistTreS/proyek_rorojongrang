/**
 * tests/unit_test/utils/pagination.test.js
 * Unit test untuk utils/pagination.js — cover 100% branch
 */

'use strict';

const { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, parsePagination, paginateItems } = require('../../../utils/pagination');

// ── constants ─────────────────────────────────────────────────────────────────
describe('constants', () => {
  test('DEFAULT_PAGE_SIZE adalah 25', () => expect(DEFAULT_PAGE_SIZE).toBe(25));
  test('MAX_PAGE_SIZE adalah 250',   () => expect(MAX_PAGE_SIZE).toBe(250));
});

// ── parsePagination ───────────────────────────────────────────────────────────
describe('parsePagination', () => {
  test('query kosong → defaults (page=1, pageSize=25, all=false)', () => {
    const result = parsePagination({});
    expect(result).toEqual({ all: false, page: 1, pageSize: 25 });
  });

  test('all=true (string) → all=true', () => {
    expect(parsePagination({ all: 'true' }).all).toBe(true);
  });

  test('all=1 (string) → all=true', () => {
    expect(parsePagination({ all: '1' }).all).toBe(true);
  });

  test('all=yes → all=true', () => {
    expect(parsePagination({ all: 'yes' }).all).toBe(true);
  });

  test('all=on → all=true', () => {
    expect(parsePagination({ all: 'on' }).all).toBe(true);
  });

  test('all=false (boolean) → all=false', () => {
    expect(parsePagination({ all: false }).all).toBe(false);
  });

  test('all=true (boolean) → all=true', () => {
    expect(parsePagination({ all: true }).all).toBe(true);
  });

  test('all=undefined → all=false', () => {
    expect(parsePagination({ all: undefined }).all).toBe(false);
  });

  test('all=null → all=false', () => {
    expect(parsePagination({ all: null }).all).toBe(false);
  });

  test('page=3 → page=3', () => {
    expect(parsePagination({ page: '3' }).page).toBe(3);
  });

  test('page=abc (invalid) → fallback ke 1', () => {
    expect(parsePagination({ page: 'abc' }).page).toBe(1);
  });

  test('page=0 (invalid, <=0) → fallback ke 1', () => {
    expect(parsePagination({ page: '0' }).page).toBe(1);
  });

  test('pageSize=50 → 50', () => {
    expect(parsePagination({ pageSize: '50' }).pageSize).toBe(50);
  });

  test('pageSize=999 → di-cap ke MAX_PAGE_SIZE (250)', () => {
    expect(parsePagination({ pageSize: '999' }).pageSize).toBe(250);
  });

  test('pageSize=abc → fallback ke DEFAULT_PAGE_SIZE', () => {
    expect(parsePagination({ pageSize: 'abc' }).pageSize).toBe(25);
  });

  test('pageSize=-5 → fallback ke DEFAULT_PAGE_SIZE', () => {
    expect(parsePagination({ pageSize: '-5' }).pageSize).toBe(25);
  });

  test('tanpa argument → defaults', () => {
    const result = parsePagination();
    expect(result).toEqual({ all: false, page: 1, pageSize: 25 });
  });
});

// ── paginateItems ─────────────────────────────────────────────────────────────
describe('paginateItems', () => {
  const makeItems = (n) => Array.from({ length: n }, (_, i) => i + 1);

  test('items bukan array → diperlakukan sebagai array kosong', () => {
    const result = paginateItems(null, { page: 1, pageSize: 10 });
    expect(result.items).toEqual([]);
    expect(result.totalItems).toBe(0);
  });

  test('pagination.all=true → kembalikan semua items (tanpa wrap)', () => {
    const items = makeItems(5);
    const result = paginateItems(items, { all: true });
    expect(result).toEqual(items);
  });

  test('halaman 1 dari 10 item dengan pageSize 3 → item[0..2]', () => {
    const result = paginateItems(makeItems(10), { page: 1, pageSize: 3 });
    expect(result.items).toEqual([1, 2, 3]);
    expect(result.totalItems).toBe(10);
    expect(result.totalPages).toBe(4);
    expect(result.page).toBe(1);
  });

  test('halaman 2 → item[3..5]', () => {
    const result = paginateItems(makeItems(10), { page: 2, pageSize: 3 });
    expect(result.items).toEqual([4, 5, 6]);
  });

  test('halaman terakhir (page > totalPages) → di-cap ke totalPages', () => {
    const result = paginateItems(makeItems(5), { page: 99, pageSize: 3 });
    expect(result.page).toBe(2);           // totalPages = 2
    expect(result.items).toEqual([4, 5]);
  });

  test('list kosong → totalPages = 1', () => {
    const result = paginateItems([], { page: 1, pageSize: 10 });
    expect(result.totalItems).toBe(0);
    expect(result.totalPages).toBe(1);
  });

  test('tanpa pagination arg → defaults digunakan', () => {
    const result = paginateItems(makeItems(3));
    expect(result.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(result.page).toBe(1);
  });
});
