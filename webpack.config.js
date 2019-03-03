const path = require('path')
const ParentContextParserPlugin = require('./ParentContextParserPlugin')

module.exports = {
  mode: 'production',
  plugins: [
    new ParentContextParserPlugin({
      ignoreCallees: ['IGNORED_BY_PCP'],
    }),
  ],
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist')
  }
}