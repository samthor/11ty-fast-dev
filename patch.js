/*
 * Copyright 2020 Sam Thorogood
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const http = require('http');
const {urlPrefix} = require('./const');

let eleventyTasks = {};
let previousEleventyTasks = {};

// This is used to monkeypatch 11ty's internals. Don't render templates, but
// instead store a closure that can be used to do it later.
function writeTemplate(mapEntry) {
  const {template, _pages: pages} = mapEntry;

  for (const page of pages) {
    const {outputPath} = page;
    if (outputPath === false) {
      continue;
    }

    let cache = undefined;
    const build = () => {
      if (!cache) {
        cache = template.renderPageEntry(mapEntry, page);
      }
      return cache;
    };
    eleventyTasks[outputPath] = build;
  }

  return Promise.resolve();
}

let alreadyBuilt = false;

function internalPatch() {
  const TemplateWriter = require('@11ty/eleventy/src/TemplateWriter.js');
  TemplateWriter.prototype._writeTemplate = writeTemplate;
}

/**
 * @param {number} port
 * @return {Promise<void>}
 */
async function prepareServer(port) {
  const server = http.createServer((req, res) => {
    if (!req.url || !req.url.startsWith(urlPrefix)) {
      res.statusCode = 404;
      return res.end();
    }
    const page = req.url.substr(urlPrefix.length);

    const p = eleventyTasks[page] || previousEleventyTasks[page];
    if (!p) {
      res.statusCode = 404;
      return res.end();
    }

    p()
      .then(content => {
        res.write(content);
        return res.end();
      })
      .catch(err => {
        console.warn('failed to render', page, err);
        res.statusCode = 500;
        return res.end();
      });
  });

  return new Promise((resolve, reject) => {
    server.listen(port);
    server.on('listening', () => resolve());
    server.on('error', reject);
  });
}

/**
 * @param {object} eleventyConfig
 * @param {{port?: number}|undefined} config
 * @return {function(): never[]}
 */
function buildConfig(eleventyConfig, config) {
  if (alreadyBuilt) {
    // Eleventy is rerun all the time.
    return () => [];
  }
  alreadyBuilt = true;

  const safeConfig = Object.assign(
    {
      port: 9999,
    },
    config
  );

  let pendingError;

  // Run an inline closure to do some async setup work. If this fails we just
  // set pendingError so it can be thrown.
  // TODO(samthor): This is currently kind of awkward as it will be thrown when
  // a collection is generated and might fail only after the 1st run.
  (async () => {
    await prepareServer(safeConfig.port);
    console.info(`11ty-fast-dev running on localhost:${safeConfig.port}...`);
  })().catch(err => (pendingError = err));

  const beforeWatchHandler = () => {
    // Move the tasks that were from our previous invocation to the 'previous'
    // slot. This basically means that after two builds, all references to old
    // tasks are removed. (We do this because 11ty doesn't seem to fire its
    // 'afterBuild' event correctly.)
    previousEleventyTasks = eleventyTasks;
    eleventyTasks = {};
  };
  eleventyConfig.on('beforeWatch', beforeWatchHandler);

  // We need to call this initially as we are likely only added during the
  // initial watch event.
  beforeWatchHandler();

  let patched = false;
  return () => {
    if (pendingError) {
      throw pendingError;
    }
    if (!patched) {
      internalPatch();
      patched = true;
    }
    return []; // in case we're used as a collection
  };
}

module.exports = {
  buildConfig,
};
