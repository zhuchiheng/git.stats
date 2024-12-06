//@ts-check
'use strict';

const path = require('path');
const TerserPlugin = require('terser-webpack-plugin');

/** @type {import('webpack').Configuration} */
const config = {
  target: 'node',
  mode: 'production',
  entry: './src/extension.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'extension.js',
    libraryTarget: 'commonjs2',
    clean: true
  },
  externals: {
    vscode: 'commonjs vscode',
    'simple-git': 'commonjs simple-git',
    'moment': 'commonjs moment',
    'fs': 'commonjs fs',
    'path': 'commonjs path'
  },
  resolve: {
    extensions: ['.ts', '.js'],
    mainFields: ['module', 'main']
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              compilerOptions: {
                sourceMap: false
              }
            }
          }
        ]
      }
    ]
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          format: {
            comments: false,
          },
          compress: {
            drop_console: true,
            dead_code: true,
            unused: true
          }
        },
        extractComments: false
      })
    ]
  },
  performance: {
    hints: 'warning'
  },
  stats: {
    assets: true,
    colors: true,
    errors: true,
    errorDetails: true,
    modules: false
  },
  devtool: 'hidden-source-map'
};

module.exports = config;
