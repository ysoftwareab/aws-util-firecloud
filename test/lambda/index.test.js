/* eslint-disable jest/no-test-callback */

import * as envCtx from '../../src/lambda/env-ctx';
import * as lambda from '../../src/lambda';
import _ from 'lodash-firecloud';

describe('lambda', function() {
  describe('bootstrap', function() {
    it("should call AWS' next with the handler's result", function(done) {
      let spyEnvCtxMerge = jest.spyOn(envCtx, 'merge');
      // @ts-ignore
      spyEnvCtxMerge.mockImplementationOnce(_.noop);

      let expectedResult = Symbol('result');
      let handler = async function(_e, _ctx) {
        return expectedResult;
      };

      let bHandler = lambda.bootstrap(handler, {
        pkg: {
          name: 'test'
        }
      });

      let e = {};
      let ctx = {};
      bHandler(e, ctx, function(err, result) {
        expect(err).toBeUndefined();
        expect(result).toBe(expectedResult);

        expect(spyEnvCtxMerge).toHaveBeenCalled();
        spyEnvCtxMerge.mockRestore();
        done();
      });
    });

    it('should call process.exit when the handler throws an exception', async function() {
      let spyEnvCtxMerge = jest.spyOn(envCtx, 'merge');
      // @ts-ignore
      spyEnvCtxMerge.mockImplementationOnce(_.noop);

      let expectedMsg = 'FATAL try-catch-lambda-bootstrap';
      let expectedErr = new Error();
      // eslint-disable-next-line no-console
      let originalConsoleError = _.bind(console.error, console);
      let spyConsoleError = jest.spyOn(console, 'error');
      spyConsoleError.mockImplementationOnce(function(...args) {
        if (args[0] !== expectedMsg) {
          originalConsoleError(...args);
        }
        expect(args[0]).toBe(expectedMsg);
      });
      spyConsoleError.mockImplementationOnce(function(...args) {
        if (args[0] !== expectedErr.stack) {
          originalConsoleError(...args);
        }
        expect(args[0]).toBe(expectedErr.stack);
      });

      let spyProcessExitD = _.deferred();
      let spyProcessExit = jest.spyOn(process, 'exit');
      // @ts-ignore
      spyProcessExit.mockImplementationOnce(function(...args) {
        // @ts-ignore
        spyProcessExitD.resolve(args);
      });

      let handler = async function(_e, _ctx) {
        throw expectedErr;
      };

      let bHandler = lambda.bootstrap(handler, {
        pkg: {
          name: 'test'
        }
      });

      let e = {};
      let ctx = {};
      bHandler(e, ctx, _.noop);

      let processExitArgs = await spyProcessExitD.promise;
      expect(processExitArgs).toStrictEqual([
        1
      ]);

      expect(spyConsoleError).toHaveBeenCalled();
      spyConsoleError.mockRestore();

      expect(spyProcessExit).toHaveBeenCalledTimes(1);
      spyProcessExit.mockRestore();

      expect(spyEnvCtxMerge).toHaveBeenCalled();
      spyEnvCtxMerge.mockRestore();
    });
  });
});
