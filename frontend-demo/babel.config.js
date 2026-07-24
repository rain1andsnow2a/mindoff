module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // three（r160+）在源码里用了 static 初始化块，Metro/Hermes 默认不转换，
    // 会报「Static class blocks are not enabled」；显式加上该插件以支持 3D 场景。
    plugins: ['@babel/plugin-transform-class-static-block'],
  };
};
