import path from 'node:path';
import webpack from 'webpack';

const config = (_env, argv) => {
  const isProd = argv.mode === 'production';
  return {
    mode: isProd ? 'production' : 'development',
    target: ['web', 'es2020'],
    entry: path.resolve('src/WBM/index.ts'),
    output: {
      path: path.resolve('dist'),
      filename: 'wbm3.js',
      library: {
        type: 'module',
      },
      clean: true,
    },
    experiments: {
      outputModule: true,
    },
    resolve: {
      extensions: ['.ts', '.js'],
      alias: {
        '@': path.resolve('src'),
        '@util': path.resolve('src/WBM/util'),
      },
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                transpileOnly: true,
              },
            },
          ],
          exclude: /node_modules/,
        },
      ],
    },
    devtool: isProd ? 'source-map' : 'eval-source-map',
    plugins: [
      new webpack.DefinePlugin({
        __WBM_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0-dev'),
      }),
    ],
    optimization: {
      minimize: isProd,
    },
  };
};

export default config;
