import webpack from 'webpack';
import loader from './loader';
import path from 'path';

describe('loader', () => {
  it('should generate output', (callback) => {
    const options: webpack.Configuration = {
      mode: 'development',
      entry: path.resolve(__dirname, './test-inputs/reader-monad-1.in.js'),
      output: {
        path: path.resolve(__dirname, './scratch'),
        filename: 'reader-monad-1.gen.js',
      },
      module: {
        rules: [
          {
            test: /\.js/,
            use: [
              {
                loader: path.resolve(__dirname, './loader.js'),
              },
            ],
          },
        ],
      },
    };
    webpack(options, (error) => {
      callback(error);
    });
  });
});
