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

const fetch = require('node-fetch');
const path = require('path');
const {urlPrefix} = require('./const');

// Included for types only.
// eslint-disable-next-line no-unused-vars
const express = require('express');

async function loadFromDev(port, url) {
  const u = new URL(`http://localhost:${port}`);
  u.pathname = urlPrefix + url;

  let response;
  try {
    response = await fetch(u);
  } catch (e) {
    // Swallow network errors, in case the server is not running.
    return undefined;
  }

  if (response.status === 404) {
    return undefined;
  }
  return await response.text();
}

/**
 * @param {string[]} paths
 * @param {{port?: number}|undefined} config
 * @returns {express.RequestHandler}
 */
function buildEleventyFastDevHandler(paths, config) {
  const safeConfig = Object.assign({port: 9999, config});

  /**
   * @param {express.Request} req
   * @param {express.Response} res
   */
  async function task(req, res) {
    const {url} = req;
    let check = url;
    let redirToSlash = false;

    if (url.endsWith('/index.html')) {
      // do nothing
    } else if (url.endsWith('/')) {
      check += 'index.html';
    } else {
      check += '/index.html';
      redirToSlash = true;
    }
    for (const p of paths) {
      const c = path.join(p, check);
      const content = await loadFromDev(safeConfig.port, c);
      if (content === undefined) {
        continue;
      }

      console.info(`11ty-fast-dev hit: ${check}`);

      // We got a hit, but for an invalid URL (the naked folder above this file).
      // Since this folder likely doesn't really exist, we can't rely on the real
      // static folder to redirect us.
      if (redirToSlash) {
        res.redirect(url + '/');
        res.end();
        return true;
      }

      // Got a hit!
      res.setHeader('Content-Type', 'text/html');
      res.send(content);
      res.end();
      return true;
    }

    return false;
  }

  /** @type {express.RequestHandler} */
  return (req, res, next) => {
    // Check the dev server for a bunch of things.

    const p = task(req, res);
    p.then(handled => handled || next()).catch(err => {
      console.warn(err);
      res.sendStatus(500);
      return res.end();
    });
  };
}

module.exports = {buildEleventyFastDevHandler};
