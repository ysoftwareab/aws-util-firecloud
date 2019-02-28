/* eslint-disable jest/no-test-callback */

import ResponseError from '../../src/express/res-error';
import _ from 'lodash-firecloud';
import envCtx from '../../src/lambda/env-ctx';
import express from '../../src/express';

describe('express', function() {
  describe('bootstrap', function() {
    it("should call AWS' next with the handler's HTTP response", function(done) {
      let spyMergeEnvCtx = jest.spyOn(envCtx, 'merge')
        .mockImplementation(_.noop);

      let expectedResult = 'expected result';
      let handler = async function(app, _e, _ctx) {
        app.use(function(_req, res, _next) {
          res.send(expectedResult);
        });
      };

      let bHandler = express.bootstrap(handler, {
        pkg: {
          name: 'test'
        }
      });

      let e = {};
      let ctx = {};
      bHandler(e, ctx, function(err, result) {
        expect(err).toBeUndefined();
        expect(result).toMatchObject({
          statusCode: 200,
          headers: {
            'content-length': '15'
          },
          body: expectedResult
        });

        expect(spyMergeEnvCtx).toHaveBeenCalled();
        spyMergeEnvCtx.mockRestore();
        done();
      });
    });

    it("should call AWS' next with the handler's exception", async function() {
      let spyEnvCtxMerge = jest.spyOn(envCtx, 'merge')
        .mockImplementationOnce(_.noop);

      let expectedErr = new Error();
      // eslint-disable-next-line no-console
      let originalConsoleError = _.bind(console.error, console);
      let spyConsoleError = jest.spyOn(console, 'error')
        .mockImplementationOnce(function(...args) {
          let receivedErr = args[0];
          if (receivedErr !== expectedErr) {
            originalConsoleError(...args);
          }
          expect(receivedErr).toBe(expectedErr);
        });

      let spyExitResolve;
      let spyExitPromise = new Promise(function(resolve, _reject) {
        spyExitResolve = resolve;
      });
      let spyProcessExit = jest.spyOn(process, 'exit')
        .mockImplementationOnce(function(...args) {
          spyExitResolve(args);
        });

      let handler = async function(_e, _ctx) {
        throw expectedErr;
      };

      let bHandler = express.bootstrap(handler, {
        pkg: {
          name: 'test'
        }
      });

      let e = {};
      let ctx = {};
      bHandler(e, ctx, _.noop);

      let exitArgs = await spyExitPromise;
      expect(exitArgs).toStrictEqual([
        1
      ]);

      expect(spyConsoleError).toHaveBeenCalled();
      spyConsoleError.mockRestore();

      expect(spyProcessExit).toHaveBeenCalledTimes(1);
      spyProcessExit.mockRestore();

      expect(spyEnvCtxMerge).toHaveBeenCalled();
      spyEnvCtxMerge.mockRestore();
    });

    it("should call AWS' next with the (sync) middleware's exception", async function() {
      let spyEnvCtxMerge = jest.spyOn(envCtx, 'merge')
        .mockImplementationOnce(_.noop);

      let expectedErr = new Error();
      // eslint-disable-next-line no-console
      let originalConsoleError = _.bind(console.error, console);
      let spyConsoleError = jest.spyOn(console, 'error')
        .mockImplementationOnce(function(...args) {
          let receivedErr = args[0];
          if (receivedErr !== expectedErr) {
            originalConsoleError(...args);
          }
          expect(receivedErr).toBe(expectedErr);
        });

      let spyExitResolve;
      let spyExitPromise = new Promise(function(resolve, _reject) {
        spyExitResolve = resolve;
      });
      let spyProcessExit = jest.spyOn(process, 'exit')
        .mockImplementationOnce(function(...args) {
          spyExitResolve(args);
        });

      let handler = async function(app, _e, _ctx) {
        app.use(function(_req, _res, _next) {
          throw expectedErr;
        });
      };

      let bHandler = express.bootstrap(handler, {
        pkg: {
          name: 'test'
        }
      });

      let e = {};
      let ctx = {};
      bHandler(e, ctx, _.noop);

      let exitArgs = await spyExitPromise;
      expect(exitArgs).toStrictEqual([
        1
      ]);

      expect(spyConsoleError).toHaveBeenCalled();
      spyConsoleError.mockRestore();

      expect(spyProcessExit).toHaveBeenCalledTimes(1);
      spyProcessExit.mockRestore();

      expect(spyEnvCtxMerge).toHaveBeenCalled();
      spyEnvCtxMerge.mockRestore();
    });

    it("should call AWS' next with the (async) middleware's exception", async function() {
      let spyEnvCtxMerge = jest.spyOn(envCtx, 'merge')
        .mockImplementationOnce(_.noop);

      let expectedErr = new Error();
      // eslint-disable-next-line no-console
      let originalConsoleError = _.bind(console.error, console);
      let spyConsoleError = jest.spyOn(console, 'error')
        .mockImplementationOnce(function(...args) {
          let receivedErr = args[0];
          if (receivedErr !== expectedErr) {
            originalConsoleError(...args);
          }
          expect(receivedErr).toBe(expectedErr);
        });

      let spyExitResolve;
      let spyExitPromise = new Promise(function(resolve, _reject) {
        spyExitResolve = resolve;
      });
      let spyProcessExit = jest.spyOn(process, 'exit')
        .mockImplementationOnce(function(...args) {
          spyExitResolve(args);
        });

      let handler = async function(app, _e, _ctx) {
        app.use(async function(_req, _res, _next) {
          throw expectedErr;
        });
      };

      let bHandler = express.bootstrap(handler, {
        pkg: {
          name: 'test'
        }
      });

      let e = {};
      let ctx = {};
      bHandler(e, ctx, _.noop);

      let exitArgs = await spyExitPromise;
      expect(exitArgs).toStrictEqual([
        1
      ]);

      expect(spyConsoleError).toHaveBeenCalled();
      spyConsoleError.mockRestore();

      expect(spyProcessExit).toHaveBeenCalledTimes(1);
      spyProcessExit.mockRestore();

      expect(spyEnvCtxMerge).toHaveBeenCalled();
      spyEnvCtxMerge.mockRestore();
    });

    it("should call AWS' next with the (async) middleware's ResponseError", function(done) {
      let spyMergeEnvCtx = jest.spyOn(envCtx, 'merge')
        .mockImplementation(_.noop);

      let expectedStatusCode = 404;
      let expectedDetails = {
        test: true
      };
      let handler = async function(app, _e, _ctx) {
        app.use(async function(_req, _res, _next) {
          throw new ResponseError(expectedStatusCode, expectedDetails);
        });
      };

      let bHandler = express.bootstrap(handler, {
        pkg: {
          name: 'test'
        }
      });

      let e = {};
      let ctx = {};

      bHandler(e, ctx, function(err, result) {
        expect(err).toBeUndefined();
        expect(result).toMatchObject({
          statusCode: expectedStatusCode,
          headers: {
            'content-type': 'application/problem+json; charset=utf-8'
          }
        });
        expect(JSON.parse(result.body)).toMatchObject(expectedDetails);

        expect(spyMergeEnvCtx).toHaveBeenCalled();
        spyMergeEnvCtx.mockRestore();
        done();
      });
    });
  });
});