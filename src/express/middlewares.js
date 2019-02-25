import ResponseError from './res-error';
import _ from 'lodash-firecloud';
import pkg from '../../package.json';
import reqMixins from './req-mixins';
import resMixins from './res-mixins';

import {
  getRequestInstance
} from '../lambda';

let _reqMixins = _.omit(reqMixins, 'default');
let _resMixins = _.omit(resMixins, 'default');

export let applyMixins = function() {
  return function(req, res, next) {
    _.forEach(_reqMixins, function(fn, name) {
      req[name] = _.bind(fn, req);
    });

    res.oldSend = res.send; // required by the res.send mixin
    res.oldType = res.type; // required by the res.type mixin
    _.forEach(_resMixins, function(fn, name) {
      res[name] = _.bind(fn, res);
    });

    next();
  };
};

export let xForward = function() {
  return function(req, _res, next) {
    req.headers = _.mapKeys(req.headers, function(_value, key) {
      return _.replace(key, /^X-Forward-/, '');
    });

    next();
  };
};

let _sendResponseError = function(res, err) {
  let {
    code: status,
    contentType,
    body
  } = err;

  body.instance = getRequestInstance(res.req);

  res.status(status);
  res.type(contentType);
  res.send(body);
};

export let handleResponseError = function() {
  return function(err, _req, res, next) {
    let {
      ctx
    } = res;

    ctx.log.error({err});

    if (res.headersSent) {
      ctx.log.error("Headers already sent. Can't send error.");
      return next(err);
    }

    if (err instanceof ResponseError) {
      ctx.log.error(`Responding with ${err.code} ${err.message}...`);
      _sendResponseError(res, err);
      return;
    }

    if (res.ctx.log._canTrace) {
      // preferrably we would like to respond with a stacktrace
      // and reset state (kill lambda), but it is impossible to do so:
      // AWS will freeze the lambda execution right after responding,
      // and kill the lambda on the subsequent request

      ctx.log.info('Responding with trace...');
      let internalErr = new ResponseError(500, {
        renderer: pkg.name,
        trace: err.stack ? _.split(err.stack, '\n') : err
      });
      _sendResponseError(res, internalErr);
      return;
    }

    // let API Gateway respond with 502 Bad Gateway,
    // and reset state (kill lambda)

    // NOTE: we cannot throw, because the error will be caught
    // by express' Layer.prototype.handle_error code

    // eslint-disable-next-line no-process-exit
    process.exit(1);
  };
};

export default exports;
