module.exports = ({ config }) => {
  const appConfig = require('./app.json').expo;

  return {
    ...appConfig,
  };
};
