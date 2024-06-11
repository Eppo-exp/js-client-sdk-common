/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');

const CopyPlugin = require('copy-webpack-plugin');
const TerserPlugin = require('terser-webpack-plugin');

module.exports = {
  entry: './src/index.ts',
  mode: 'production',
  devtool: 'inline-source-map',
  target: 'web',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  output: {
    filename: 'eppo-sdk.js',
    library: {
      name: 'eppo',
      type: 'var',
    },
    path: path.resolve(__dirname, 'dist'),
  },
  optimization: {
    minimize: true,
    minimizer: [new TerserPlugin()],
  },
  plugins: [
    new CopyPlugin({
      patterns: [
        {
          from: 'src/**/*.ts',
          to: path.resolve(__dirname, 'dist'),
          noErrorOnMissing: true,
          globOptions: {
            ignore: ['**/*.spec.ts'], // Exclude test and spec files
          },
        },
      ],
    }),
  ],
};
