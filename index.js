const {
  parseQuery
} = require('loader-utils');

const {
  parse: parseCode,
  print
} = require('recast');

const {
  visit
} = require('ast-types');

const {
  set,
  get
} = require('lodash');

function sanitize(str) {
  str = str.replace(/(["\\'])/g, '\\$1');
  return str.charAt(0) !== "." ? "./" + str : str;
}

function transformDecoratorProperties(source, config) {
  const ast = parseCode(source, {
    parser: {
      parse: function parse(source, options) {
        options = require("recast/parsers/_babylon_options.js")(options);
        options.plugins.push("typescript");
        return require("babylon").parse(source, options);
      }
    }
  });
  let hasDecorator = false;

  visit(ast, {
    visitClassDeclaration: function (nodePath) {
      const decoratorsPath = nodePath.get('decorators');
      const {value: decorators} = decoratorsPath;
      hasDecorator = !!decoratorsPath;

      if (!hasDecorator) {
        return false
      }

      this.traverse(decoratorsPath);
    },
    visitObjectExpression(nodePath) {
      let objectPropertiesPath;
      let objectProperties;

      let stylesPropertyIndex;
      let stylesPropertyPath;
      let stylesPath;

      let stylesUrlPropertyIndex;
      let styleUrlsPropertyPath;
      let styleUrlsPath;

      let templateUrlPropertyIndex;
      let templateUrlPropertyPath;
      let templateUrl;

      if (!hasDecorator) {
        return false;
      }

      objectPropertiesPath = nodePath.get('properties');
      objectProperties = objectPropertiesPath.value;

      if (!objectProperties || !Array.isArray(objectProperties) || objectProperties.length === 0) {
        return false;
      }

      stylesUrlPropertyIndex = objectProperties.findIndex(objProp => get(objProp, 'key.name', false) === 'styleUrls');
      stylesPropertyIndex = objectProperties.findIndex(objProp => get(objProp, 'key.name', false) === 'styles');
      templateUrlPropertyIndex = objectProperties.findIndex(objProp => get(objProp, 'key.name', false) === 'templateUrl');

      if (templateUrlPropertyIndex >= 0 ) {
        templateUrlPropertyPath = objectPropertiesPath.get(templateUrlPropertyIndex);
        templateUrl = get(templateUrlPropertyPath, 'value.value.value');
        templateUrlPropertyPath.get('value').replace(`require('${sanitize(templateUrl)}')`);

        if (!config.keepUrl) {
          set(templateUrlPropertyPath, 'value.key.name', 'template');
        }
      }

      if (stylesUrlPropertyIndex >= 0) {
        styleUrlsPropertyPath = objectPropertiesPath.get(stylesUrlPropertyIndex);
        styleUrlsPath = styleUrlsPropertyPath.get('value', 'elements');

        styleUrlsPath.value.forEach(({value: url}, idx) => {
          styleUrlsPath.get(idx).replace(`require('${sanitize(url)}')`)
        });
        if (!config.keepUrl) {
          set(styleUrlsPropertyPath, 'value.key.name', 'styles');
        }

        if (stylesPropertyIndex >= 0) {
          // maintain ref to preexisting styles property
          stylesPropertyPath = objectPropertiesPath.get(stylesPropertyIndex);
          stylesPath = stylesPropertyPath.get('value', 'elements');

          // drop prexiting `styles`
          objectPropertiesPath.get(stylesPropertyIndex).replace();

          // append dropped `styles` values to transformed `styleUrls` values
          styleUrlsPath.push(...stylesPath.value);
        }
      }

      return false;
    },
    visitDecorator: function (nodePath) {
      const decoratorArgsPath = nodePath.get('callee', 'arguments');
      const {value: decoratorArgs} = decoratorArgsPath;

      if (!decoratorArgs || decoratorArgs.length === 0) {
        return false;
      }

      this.traverse(decoratorArgsPath);
    }
  });

  const {code} = print(ast);

  return code;
}

module.exports = function (source, sourceMap) {
  const config = Object.assign(
    {parseModule: "recast/parsers/typescript"},
    this.options && (this.options['ng2TemplateLoader'] || this.options['angular2TemplateLoader']),
    parseQuery(this.query)
  );
  let newSource;

  try {
    newSource = transformDecoratorProperties(source, config);
  } catch (err) {
    console.warn(err);
    newSource = source;
  }

  // Not cacheable during unit tests;
  this.cacheable && this.cacheable();

  // Support for tests
  if (this.callback) {
    this.callback(null, newSource, sourceMap)
  } else {
    return newSource;
  }
};
