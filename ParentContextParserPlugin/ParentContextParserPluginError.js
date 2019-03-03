const WebpackError = require('webpack/lib/WebpackError')

module.exports = class ParentContextParserPluginError extends WebpackError {
  constructor(message) {
    super()

    this.name = 'ParentContextParserPlugin'
    this.message = message

    Error.captureStackTrace(this, this.constructor)
  }
}