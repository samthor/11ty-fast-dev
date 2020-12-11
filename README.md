This makes 11ty more efficient when used behind a dev server, making it only compiles your pages when you actually want to see them.

This relies on you running your own dev server.
(This could be built into `eleventy --serve`, I don't know.)

⚠️ This is a crazy idea and perhaps not intended for production use just yet.
You're welcome!

## Usage

Your .eleventy.js should be updated like this:

**TODO(samthor): This should be flagged or only run in `--watch` mode.**

```js
const eleventyFastDev = require('11ty-fast-dev');

module.exports = eleventyConfig => {
  // We can't set up 11ty-fast-dev here, but instead need to do it later in
  // 11ty's lifecycle. Its calculation of collections is a great place, as this
  // is before any files are written.
  // TODO(samthor): We only want to do this when flagged or in watch mode and
  // so on.
  const config = eleventyFastDev.buildConfig(eleventyConfig);
  eleventyConfig.addCollection('_11ty-fast-dev', config);

  // ... the rest of your config
};
```

Add this handler to your web server (this uses Express):

```js
const {buildEleventyFastDevHandler} = require('../tools/11ty-fast-dev/handler');

const staticPaths = ['dist'];  // 11ty writes here by default
const eleventyFastDevHandler = buildEleventyFastDevHandler(staticPaths);

// Insert this _before_ your static handlers, so old dist files don't "win".
app.use(eleventyFastDevHandler);
```

Profit!

## Implementation

The eleventy side does two things:

* monkeypatches `TemplateWriter._writeTemplate` so that instead of writing a template, we store this ability into a closure
* opens a web server on "localhost:9999", and when the right page is requested, renders the file

On the server side, it's a pretty basic handler which then goes out and asks "localhost:9999" for the right page.

## Downsides

This will, as stated, only execute your templates and run transforms when you request a file.
If you have side effects in these places, then this won't work for you.
(This is generally considered a bad idea _anyway_).
