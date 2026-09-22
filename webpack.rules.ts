import type { ModuleOptions } from 'webpack';

// Rules for bundling native Node modules. The asset relocator loader emits a
// runtime module that references `__dirname`, so these only belong in the main
// process bundle — applying them to the renderer (which has no Node integration)
// throws `ReferenceError: __dirname is not defined` before the app can mount.
const nativeModuleRules: Required<ModuleOptions>['rules'] = [
  {
    // We're specifying native_modules in the test because the asset relocator loader generates a
    // "fake" .node file which is really a cjs file.
    test: /native_modules[/\\].+\.node$/,
    use: 'node-loader',
  },
  {
    test: /[/\\]node_modules[/\\].+\.(m?js|node)$/,
    parser: { amd: false },
    use: {
      loader: '@vercel/webpack-asset-relocator-loader',
      options: {
        outputAssetBase: 'native_modules',
      },
    },
  },
];

const typescriptRule: Required<ModuleOptions>['rules'][number] = {
  test: /\.tsx?$/,
  exclude: /(node_modules|\.webpack)/,
  use: {
    loader: 'ts-loader',
    options: {
      transpileOnly: true,
    },
  },
};

export const rules: Required<ModuleOptions>['rules'] = [
  ...nativeModuleRules,
  typescriptRule,
];

export const rendererRules: Required<ModuleOptions>['rules'] = [typescriptRule];