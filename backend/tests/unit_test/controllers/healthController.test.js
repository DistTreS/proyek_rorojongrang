/**
 * tests/unit_test/controllers/healthController.test.js
 */

'use strict';

const healthController = require('../../../controllers/healthController');
const { mockRequest, mockResponse } = require('../helpers/mockResponse');

describe('healthController.health', () => {
  test('mengembalikan { status: "ok" }', () => {
    const req = mockRequest();
    const res = mockResponse();

    healthController.health(req, res);

    expect(res.json).toHaveBeenCalledWith({ status: 'ok' });
  });
});
