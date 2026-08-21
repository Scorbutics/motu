// The CJS twin of asset-stub.mjs — a `require('./x.css')` deep in a dependency needs an answer too.
module.exports = '';
module.exports.__motuAssetStub = true;
