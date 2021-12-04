import { transformAsync } from '@babel/core';
import { loader } from 'webpack';
import { memoize } from 'lodash';
// tslint:disable-next-line import-name
import plugin from './index';

const createPlugin = memoize(plugin);

export default async function loader(this: loader.LoaderContext, contents: string) {
  const callback = this.async();
  if (!callback) {
    throw new Error('This load must be asynchronous');
  }

  const result = await transformAsync(contents, {
    code: true,
    plugins: [createPlugin()],
  });
  if (!result) {
    callback(new Error('Babel transform failed'));
    return;
  }

  this.addDependency(this.resourcePath);
  this.cacheable(true);
  callback(null, result.code || undefined);
}
