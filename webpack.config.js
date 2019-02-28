const path = require('path');
const ParentContextPlugin = require('./ParentContextPlugin')

module.exports = {
  mode: 'production',
  plugins: [
    new ParentContextPlugin(),
  ],
  output: {
    filename: 'main.js',
    path: path.resolve(__dirname, 'dist')
  }
};