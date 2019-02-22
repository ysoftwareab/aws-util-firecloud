/* eslint-disable no-invalid-this */
import _ from 'lodash-firecloud';
import _express from 'express';
import bearerToken from 'express-bearer-token';
import cors from 'cors';
import middlewares from './middlewares';
import responseTime from 'response-time';
import urlLib from 'url';

import {
  asyncHandler,
  bootstrap as bootstrapLambda
} from '../lambda';

import {
  bootstrap as bootstrapResponseError
} from './res-error';

import {
  LambdaHttp
} from 'http-lambda';


export let express = function(e, _ctx, _next) {
  let app = _express();

  app.disable('x-powered-by');
  app.disable('etag');
  app.enable('trust proxy');
  app.set('json spaces', 2);

  // FIXME hack!!!
  let host = _.get(e, 'headers.Host', _.get(e, 'headers.host'));
  if (_.startsWith(host, 'api-git.')) {
    // using the api-git apigateway-domainname (ci stack)
    let basePath = _.split(urlLib.parse(e.path).pathname, '/')[1];
    app.lazyrouter();
    app.use(`/${basePath}`, app._router);
  }

  app.oldUse = app.use;
  app.use = function(...args) {
    args = _.map(args, function(arg) {
      if (!_.isFunction(arg)) {
        return arg;
      }

      let fn = arg;
      return asyncHandler(async function(req, res, next) {
        bootstrapResponseError(async function() {
          let result = fn(req, res, next);
          return await _.alwaysPromise(result);
        }, res);
      });
    });

    app.oldUse(...args);
  };

  app.use(responseTime());
  app.use(cors({
    exposedHeaders: [
      'location',
      'x-response-time'
    ],
    maxAge: 24 * 60 * 60 // 24 hours
  }));
  app.use(bearerToken());
  app.use(middlewares.applyMixins());
  app.use(middlewares.xForward());

  app.use(async function(_req, res, next) {
    res.set('cache-control', 'max-age=0, no-store');
    next();
  });

  return app;
};

export let bootstrap = function(fn, {
  pkg
}) {
  return bootstrapLambda(async function(e, ctx, next) {
    let app;
    await ctx.log.trackTime(
      'aws-util-firecloud.express.bootstrap: Creating express app...',
      async function() {
        app = express(e, ctx, next);
      }
    );

    await ctx.log.trackTime(
      'aws-util-firecloud.express.bootstrap: Setting up custom express...',
      async function() {
        fn = bootstrapResponseError(fn, app.res);
        fn(app, e, ctx, next);
      }
    );

    ctx.log.info('aws-util-firecloud.express.bootstrap: Creating HTTP server (handling request)...');
    await ctx.log.trackTime(
      'aws-util-firecloud.express.bootstrap: Creating HTTP server (handling request)...',
      async function() {
        let http = new LambdaHttp(e, ctx, next);
        http.createServer(app);
      }
    );
  }, {
    pkg
  });
};

export default exports;