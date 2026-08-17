module.exports = function configurar(api) {
  api.cache(true);
  return { presets: ['babel-preset-expo'] };
};
