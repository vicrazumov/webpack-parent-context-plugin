const path = require('path');
const ParentContextPlugin = require('./ParentContextPlugin')

module.exports = {
  mode: 'production',
  plugins: [
    new ParentContextPlugin({
      undefinedArgumentsBefore: 0,
      ignoreCallees: ['IGNORED_BY_PCP'],
    }),
  ],
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist')
  }
};