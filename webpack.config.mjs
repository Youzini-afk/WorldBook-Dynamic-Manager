import path from 'node:path';
import webpack from 'webpack';
import { VueLoaderPlugin } from 'vue-loader';

function makePlugins() {
  return [
    new webpack.DefinePlugin({
      __WBM_VERSION__: JSON.stringify(process.env.npm_package_version ?? '0.0.0-dev'),
    }),
    new VueLoaderPlugin(),
  ];
}

function makeCommon(isProd) {
  return {
    mode: isProd ? 'production' : 'development',
    target: ['web', 'es2020'],
    resolve: {
      extensions: ['.ts', '.js', '.vue'],
      alias: {
        '@': path.resolve('src'),
        '@util': path.resolve('src/WBM/util'),
      },
    },
    module: {
      rules: [
        {
          test: /\.vue$/,
          use: 'vue-loader',
          exclude: /node_modules/,
        },
        {
          test: /\.ts$/,
          use: [
            {
              loader: 'ts-loader',
              options: {
                transpileOnly: true,
                appendTsSuffixTo: [/\.vue$/],
              },
            },
          ],
          exclude: /node_modules/,
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
      ],
    },
    devtool: isProd ? false : 'eval-source-map',
    plugins: makePlugins(),
    optimization: {
      minimize: isProd,
    },
  };
}

const config = (_env, argv) => {
  const isProd = argv.mode === 'production';
  const common = makeCommon(isProd);

  return [
    {
      ...common,
      name: 'wbm3-module',
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
    },
    {
      ...common,
      name: 'wbm3-single',
      entry: path.resolve('src/WBM/standalone.ts'),
      output: {
        path: path.resolve('dist'),
        filename: 'index.js',
        clean: false,
      },
    },
  ];
};

export default config;
