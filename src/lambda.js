/* eslint-disable no-console */
import BunyanSlack from 'bunyan-slack';
import _ from 'lodash-firecloud';
import aws from 'aws-sdk';
import bunyan from 'bunyan';
import bunyanFormat from 'bunyan-format/lib/format-record';
import os from 'os';

export let awsLoggerRE =
  / *\[AWS ([^ ]+) ([^ ]+) ([^ ]+)s ([^ ]+) retries] ([^(]+)\(([^)]+)\).*/;

export let asyncHandler = function(fn) {
  return function(...args) {
    let next = args[args.length - 1];
    fn(...args).catch(next);
  };
};

export let inspect = async function({_e, ctx}) {
  if (ctx.log.level() > ctx.log.resolveLevel('TRACE')) {
    return;
  }

  // Added in: v6.1.0
  // let cpuUsage = process.cpuUsage(exports.inspect.previousCpuUsage);
  // exports.inspect.previousCpuUsage = cpuUsage;

  let inspection = {
    process: _.merge(_.pick(process, [
      'arch',
      'argv',
      'argv0',
      'config',
      'env',
      'execArgv',
      'pid',
      'platform',
      'release',
      'title',
      'version',
      'versions'
    ]), {
      // cpuUsage,
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime()
    }),
    os: _.mapValues(os, function(fn) {
      if (!_.isFunction(fn)) {
        return;
      }

      return fn();
    })
  };

  let {previousMemoryUsage} = exports.inspect;
  if (previousMemoryUsage) {
    inspection.process.memoryUsageDiff = {
      rss: previousMemoryUsage.rss - inspection.process.memoryUsage.rss,
      heapUsed: previousMemoryUsage.heapUsed - inspection.process.memoryUsage.heapUsed,
      time: previousMemoryUsage.uptime - inspection.process.uptime
    };
    exports.inspect.previousMemoryUsage = {
      rss: inspect.process.memoryUsage.rss,
      heapUsed: inspect.process.memoryUsage.heapUsed,
      uptime: inspect.process.uptime
    };
  }

  ctx.log.trace(inspection, 'Inspection');
};

// using console.log instead of the logger on purpose
export let bootstrap = function(fn, {pkg}) {
  return exports.asyncHandler(async function(e, ctx, next) {
    await _.consoleLogTime(
      'aws-util-firecloud.lambda.bootstrap: Merging env ctx...',
      async function() {
        await exports.mergeEnvCtx({e, ctx, pkg});
      }
    );

    await _.consoleLogTime(
      'aws-util-firecloud.lambda.bootstrap: Setting up logger...',
      async function() {
        exports.setupLogging({e, ctx});
      }
    );

    await _.consoleLogTime(
      'aws-util-firecloud.lambda.bootstrap: Inspecting...',
      async function() {
        await exports.inspect({e, ctx});
      }
    );

    await _.consoleLogTime(
      'aws-util-firecloud.lambda.bootstrap: Running fn...',
      async function() {
        await fn(e, ctx, next);
      }
    );

    if (global && global.gc) {
      await _.consoleLogTime(
        'aws-util-firecloud.lambda.bootstrap: Garbage collection on demand...',
        async function() {
          global.gc();
        }
      );
    }
  });
};

export let mergeEnvCtx = async function({e, ctx, pkg}) {
  console.log('mergeEnvCtx: Get env from event and context...');

  let AWS_ACCOUNT_ID =
      _.split(_.get(ctx, 'invokedFunctionArn', ''), ':')[4];
  AWS_ACCOUNT_ID =
    _.defaultTo(_.get(e, 'requestContext.accountId'), AWS_ACCOUNT_ID);

  let AWS_REGION =
      _.split(_.get(ctx, 'invokedFunctionArn', ''), ':')[3];

  let pkgNameRE = _.replace(pkg.name, /([.-])/, '\\$1');
  let ENV_NAME =
      _.split(_.get(ctx, 'invokedFunctionArn', ''), ':')[6];
  ENV_NAME = _.replace(ENV_NAME, new RegExp(`\\-${pkgNameRE}$`), '');

  let AWS_LAMBDA_FUNCTION_NAME =
      _.split(_.get(ctx, 'invokedFunctionArn', ''), ':')[6];

  let AWS_LAMBDA_FUNCTION_ALIAS =
      _.split(_.get(ctx, 'invokedFunctionArn', ''), ':')[7];
  AWS_LAMBDA_FUNCTION_ALIAS = _.defaultTo(AWS_LAMBDA_FUNCTION_ALIAS, '$LATEST');

  _.defaultsDeep(ctx, {
    env: e.stageVariables
  }, {
    env: {
      AWS_ACCOUNT_ID,
      AWS_LAMBDA_FUNCTION_ALIAS,
      AWS_LAMBDA_FUNCTION_NAME,
      AWS_REGION,
      ENV_NAME
    }
  }, {
    env: e.stageVariables
  }, {
    env: {
      // AWS does not allow empty-string stage variables...
      API_BASE_PATH: '',
      API_SECONDARY_BASE_PATH: ''
    }
  }, {
    env: process.env
  });

  console.log('mergeEnvCtx: Get env ctx from config bucket...');

  let envCtx = await exports.getEnvCtx({
    ctx,
    tags: [
      'lambdas',
      `lambdas/${pkg.name}`
    ]
  });
  _.defaultsDeep(ctx, envCtx);
};

export let getEnvCtxResolver = function({ctx, tags = ['default']}) {
  let {env} = ctx;

  return [
    env.AWS_ACCOUNT_ID,
    env.AWS_LAMBDA_FUNCTION_ALIAS,
    env.AWS_LAMBDA_FUNCTION_NAME,
    env.AWS_REGION,
    env.ENV_NAME
  ].concat(tags).join();
};

export let getEnvCtx = async function({ctx, tags = ['default']}) { // eslint-disable-line no-unused-vars
  // eslint-disable-next-line fp/no-arguments
  let cacheKey = exports.getEnvCtxResolver(...arguments);
  let cachedResult = exports._getEnvCtx.cache[cacheKey];
  cachedResult = _.defaultTo(cachedResult, exports._getEnvCtx.oldCache[cacheKey]);
  cachedResult = _.defaultTo(cachedResult, {});
  let aMinuteAgo = Date.now() - 60 * 1000;

  if (!cachedResult.ctx) {
    console.log('getEnvCtx: Waiting for new env ctx...');
    // eslint-disable-next-line fp/no-arguments
    cachedResult = await exports._getEnvCtx(...arguments);
  }

  if (cachedResult.lastFetched < aMinuteAgo) {
    console.log('getEnvCtx: Refreshing env ctx for next call...');
    exports._getEnvCtx.oldCache.set(cacheKey, exports._getEnvCtx.cache[cacheKey]);
    exports._getEnvCtx.cache.delete(cacheKey);
    // eslint-disable-next-line fp/no-arguments
    exports._getEnvCtx(...arguments);
  }

  console.log('getEnvCtx: Return env ctx...');
  return cachedResult.ctx;
};

export let _getEnvCtx = _.memoize(async function({ctx: {env}, tags}) {
  // eslint-disable-next-line fp/no-arguments
  let cacheKey = exports.getEnvCtxResolver(...arguments);
  let s3 = new aws.S3({
    region: env.AWS_REGION,
    signatureVersion: 'v4'
  });

  let Body;
  let ETag;

  await _.consoleLogTime('_getEnvCtx: Fetching env ctx...', async function() {
    let result = await s3.getObject({
      Bucket: `config-${env.AWS_ACCOUNT_ID}-tobiicloud-com-${env.AWS_REGION}`,
      Key: `${env.ENV_NAME}.json`,
      IfMatch: (_.defaultTo(exports._getEnvCtx.oldCache[cacheKey], {})).etag
    }).promise();

    ({
      Body,
      ETag
    } = result);
  });
  Body = JSON.parse(Body.toString());

  let ctx = {};

  console.log('_getEnvCtx: Merging env ctx...');
  _.forEach(tags, function(tag) {
    ctx = _.merge(ctx, _.defaultTo(Body[tag], {}));
  });

  return {
    ctx,
    etag: ETag,
    lastFetched: Date.now()
  };
}, exports.getEnvCtxResolver);
_getEnvCtx.oldCache = new _.memoize.Cache();

export let setupLogging = function({e, ctx}) {
  let streams = [{
    stream: process.stdout
  }];

  let [, slackUser] = ctx.env.ENV_NAME.match(/^git-(keep-)?([a-z]{3})(?:-.+)?$/) || [];

  if (ctx.env.SLACK_WEBHOOK && slackUser) {
    streams.push({
      level: 'DEBUG',
      stream: new BunyanSlack({
        webhook_url: ctx.env.SLACK_WEBHOOK,
        channel: `@${slackUser}`, // to
        customFormatter: function(record, _levelName) {
          let invokedFunctionArn = _.get(ctx, 'invokedFunctionArn', '');
          let log = bunyanFormat(record, {
            outputMode: 'long',
            color: false
          });

          return {
            text: [
              '',
              `*${ctx.env.ENV_NAME}*`,
              `*${invokedFunctionArn}*`,
              log
            ].join('\n')
          };
        }
      })
    });
  }

  let logger = bunyan.createLogger({
    name: ctx.functionName,
    level: _.get(ctx, 'env.LOG_LEVEL', 'INFO'),
    serializers: bunyan.stdSerializers,
    src: true,
    req_id: ctx.awsRequestId,
    streams
  });

  logger.trace({e, ctx}, `Logger started. ${logger.level()}`);

  ctx.log = logger;

  if (ctx.log.level() <= ctx.log.resolveLevel('TRACE')) {
    Error.stackTraceLimit = Infinity;
    if (Promise.config) {
      Promise.config({
        warnings: true,
        longStackTraces: true
      });
    }
    ctx.log.trace('Long stack traces enabled');
  } else if (Error.stackTraceLimit === Infinity && /^prod/.test(process.env.NODE_ENV)) {
    ctx.log.error('Long stack traces cannot be disabled. New deployment is required!');
  }

  aws.config.logger = {
    isTTY: false,
    log: function(message) {
      if (ctx.log.level() > ctx.log.resolveLevel('TRACE')) {
        return;
      }

      let [
        serviceIdentifier,
        status,
        delta,
        retryCount,
        operation,
        params
      ] = exports.awsLoggerRE.exec(message).slice(1);
      params = eval(`(${params})`); // eslint-disable-line no-eval

      ctx.log.trace({
        aws: {
          serviceIdentifier,
          status,
          delta,
          retryCount,
          operation,
          params
        }
      }, 'Making an AWS SDK call.');
    }
  };
};

export let getRequestInstance = function(req) {
  let {ctx} = req;
  return `${ctx.invokedFunctionArn}#request:${ctx.awsRequestId}`;
};

export default bootstrap;
