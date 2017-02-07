'use strict';

const util = require('util');
const levels = require('./levels');
const layouts = require('./layouts');
const debug = require('debug')('log4js:configuration');

function not(thing) {
  return !thing;
}

function anObject(thing) {
  return thing && typeof thing === 'object' && !Array.isArray(thing);
}

class Configuration {

  throwExceptionIf(checks, message) {
    const tests = Array.isArray(checks) ? checks : [checks];
    tests.forEach((test) => {
      if (test) {
        throw new Error(
          `Problem with log4js configuration: (${util.inspect(this.candidate, { depth: 5 })}) - ${message}`
        );
      }
    });
  }

  tryLoading(path) {
    try {
      return require(path); //eslint-disable-line
    } catch (e) {
      // if the module was found, and we still got an error, then raise it
      this.throwExceptionIf(
        e.code !== 'MODULE_NOT_FOUND',
        `appender "${path}" could not be loaded (error was: ${e})`
      );
      return undefined;
    }
  }

  loadAppenderModule(type) {
    return this.tryLoading(`./appenders/${type}`) || this.tryLoading(type);
  }

  createAppender(name, config) {
    const appenderModule = this.loadAppenderModule(config.type);
    this.throwExceptionIf(
      not(appenderModule),
      `appender "${name}" is not valid (type "${config.type}" could not be found)`
    );
    if (appenderModule.appender) {
      debug(`DEPRECATION: Appender ${config.type} exports an appender function.`);
    }
    if (appenderModule.shutdown) {
      debug(`DEPRECATION: Appender ${config.type} exports a shutdown function.`);
    }
    return appenderModule.configure(config, layouts, this.configuredAppenders.get.bind(this.configuredAppenders));
  }

  get appenders() {
    return this.configuredAppenders;
  }

  set appenders(appenderConfig) {
    const appenderNames = Object.keys(appenderConfig);
    this.throwExceptionIf(not(appenderNames.length), 'must define at least one appender.');

    this.configuredAppenders = new Map();
    appenderNames.forEach((name) => {
      this.throwExceptionIf(
        not(appenderConfig[name].type),
        `appender "${name}" is not valid (must be an object with property "type")`
      );

      debug(`Creating appender ${name}`);
      this.configuredAppenders.set(name, this.createAppender(name, appenderConfig[name]));
    });
  }

  get categories() {
    return this.configuredCategories;
  }

  set categories(categoryConfig) {
    const categoryNames = Object.keys(categoryConfig);
    this.throwExceptionIf(not(categoryNames.length), 'must define at least one category.');

    this.configuredCategories = new Map();
    categoryNames.forEach((name) => {
      const category = categoryConfig[name];
      this.throwExceptionIf(
        [
          not(category.appenders),
          not(category.level)
        ],
        `category "${name}" is not valid (must be an object with properties "appenders" and "level")`
      );

      this.throwExceptionIf(
        not(Array.isArray(category.appenders)),
        `category "${name}" is not valid (appenders must be an array of appender names)`
      );

      this.throwExceptionIf(
        not(category.appenders.length),
        `category "${name}" is not valid (appenders must contain at least one appender name)`
      );

      const appenders = [];
      category.appenders.forEach((appender) => {
        this.throwExceptionIf(
          not(this.configuredAppenders.get(appender)),
          `category "${name}" is not valid (appender "${appender}" is not defined)`
        );
        appenders.push(this.appenders.get(appender));
      });

      this.throwExceptionIf(
        not(levels.toLevel(category.level)),
        `category "${name}" is not valid (level "${category.level}" not recognised;` +
        ` valid levels are ${levels.levels.join(', ')})`
      );

      debug(`Creating category ${name}`);
      this.configuredCategories.set(name, { appenders: appenders, level: levels.toLevel(category.level) });
    });

    this.throwExceptionIf(not(categoryConfig.default), 'must define a "default" category.');
  }

  constructor(candidate) {
    this.candidate = candidate;

    this.throwExceptionIf(not(anObject(candidate)), 'must be an object.');
    this.throwExceptionIf(not(anObject(candidate.appenders)), 'must have a property "appenders" of type object.');
    this.throwExceptionIf(not(anObject(candidate.categories)), 'must have a property "categories" of type object.');

    this.appenders = candidate.appenders;
    this.categories = candidate.categories;
  }
}

module.exports = Configuration;