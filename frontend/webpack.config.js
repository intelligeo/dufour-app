const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');
const webpack = require('webpack');
const availableLanguages = require('./static/translations/tsconfig.json').languages;
const {BundleAnalyzerPlugin} = require('webpack-bundle-analyzer');

const today = new Date();
const buildDate = today.getFullYear() + "." + String(1 + today.getMonth()).padStart(2, '0') + "." + String(today.getDate()).padStart(2, '0');

const isQwcLts = 'qwc2-lts' in require('./package.json').dependencies;
const qwc2ModName = isQwcLts ? 'qwc2-lts' : 'qwc2';

module.exports = (env, argv) => {
    const isProd = argv.mode === "production";

    return {
        entry: {
            QWC2App:  path.resolve(__dirname, 'js', 'app.jsx'),
            AdminApp: path.resolve(__dirname, 'js', 'Admin.jsx')
        },
        output: {
            hashFunction: 'sha256',
            path: path.resolve(__dirname, 'prod'),
            filename: 'dist/[name].js',
            assetModuleFilename: 'dist/[hash][ext][query]',
            clean: true
        },
        watchOptions: {
            ignored: new RegExp(String.raw`node_modules(\\|\/)(?!${qwc2ModName})`)
        },
        devtool: isProd ? 'source-map' : 'inline-source-map',
        optimization: {
            minimize: isProd
        },
        devServer: {
            static: [
                {
                    directory: path.resolve(__dirname, 'static'),
                    publicPath: '/'
                }
            ],
            compress: true,
            hot: true,
            port: 8081,
            proxy: [
                {
                    context: ['/api'],
                    target: 'https://api.intelligeo.net',
                    changeOrigin: true,
                    secure: false
                },
                {
                    context: ['/themes.json'],
                    target: 'https://api.intelligeo.net',
                    changeOrigin: true,
                    secure: false
                }
            ]
        },
        resolve: {
            extensions: [".mjs", ".js", ".jsx"],
            alias: {
                "@giro3d/giro3d": "@sourcepole/qwc-giro3d",
                "qwc2": qwc2ModName
            },
            fallback: {
                path: require.resolve("path-browserify")
            }
        },
        snapshot: {
            managedPaths: [new RegExp(String.raw`(.*(\\|\/)node_modules(\\|\/)(?!${qwc2ModName}))`)]
        },
        plugins: [
            new webpack.DefinePlugin({
                'process.env': {
                    NODE_ENV: JSON.stringify(argv.mode),
                    BuildDate: JSON.stringify(buildDate),
                    AvailableLanguages: JSON.stringify(availableLanguages)
                }
            }),
            new webpack.NormalModuleReplacementPlugin(/openlayers$/, path.join(__dirname, "node_modules", qwc2ModName, "libs", "openlayers")),
            new HtmlWebpackPlugin({
                template: path.resolve(__dirname, "index.html"),
                filename: "index.html",
                chunks: ["QWC2App"],
                build: buildDate,
                hash: true
            }),
            new HtmlWebpackPlugin({
                template: path.resolve(__dirname, "admin.html"),
                filename: "admin.html",
                chunks: ["AdminApp"],
                build: buildDate,
                hash: true
            }),
            new CopyWebpackPlugin({
                patterns: [
                    {
                        from: 'static',
                        // themes.json is served dynamically by the backend at /themes.json.
                        // Excluding it from the bundle prevents nginx from finding it as a
                        // static file and bypassing the proxy_pass to api.intelligeo.net.
                        globOptions: { ignore: ['**/themes.json'] }
                    }
                ]
            }),
            env.ANALYZE === "1" ? new BundleAnalyzerPlugin({
                analyzerMode: 'server',
                openAnalyzer: true,
                generateStatsFile: true
            }) : null
        ].filter(Boolean),
        module: {
            rules: [
                {
                    test: /\.css$/,
                    use: [
                        {loader: 'style-loader'},
                        {loader: 'css-loader'}
                    ]
                },
                {
                    test: /(.woff|.woff2|.png|.jpg|.gif|.svg|.glb)/,
                    type: 'asset/inline'
                },
                {
                    test: /\.jsx?$/,
                    exclude: /node_modules(\\|\/)(?!qwc2)/,
                    use: {
                        loader: 'babel-loader',
                        options: { babelrcRoots: ['.', path.resolve(__dirname, 'node_modules', qwc2ModName)] }
                    }
                },
                {
                    test: /(.mjs|.js)$/,
                    type: 'javascript/auto'
                },
                {
                    test: /\.js$/,
                    enforce: "pre",
                    use: ["source-map-loader"]
                }
            ]
        }
    };
};
