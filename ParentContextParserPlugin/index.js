const ConstDependency = require('webpack/lib/dependencies/ConstDependency')
const ParentContextParserPluginError = require('./ParentContextParserPluginError')

const {
  IGNORE_CALLEES,
  setDependencyTemplates,
  idParser,
  calleeParser,
  generateParentContext,
  getSource,
  getCurrentFileRelativePath,
} = require('./helpers')

class ParentContextParserPlugin {
  constructor(options) {
    const { ignoreCallees = [] } = options
    this.options = {
      // callees to ignore, e.g., JSON, Object, etc
      ignoreCallees: [...ignoreCallees, ...IGNORE_CALLEES],
    }
  }

  apply(compiler) {
    // 1. handle unresolved require('__parentContext') by replacing
    //    it with require of the current file to prevent "Can't be resolved" errors
    compiler.hooks.normalModuleFactory.tap(
      this.constructor.name,
      nmf => {
        nmf.hooks.beforeResolve.tap(this.constructor.name, result => {
          if (!result) return
          if (result.request === '__parentContext') {
            result.request = this.currentFileRelativePath
          }
          return result
        })
      }
    )

    // 2. once the AST is ready:
    //    a. pass caller params to every function call
    //    b. replace every call to require('__parentContext').get() with caller params
    compiler.hooks.compilation.tap(this.constructor.name, (compilation, { normalModuleFactory }) => {
      setDependencyTemplates(compilation)

      normalModuleFactory.hooks.parser.for('javascript/auto').tap(this.constructor.name, parser => {
        this.parser = parser

        parser.hooks.program.tap(this.constructor.name, ast => {
          // comments are available as the 2nd arg
          try {
            this.source = getSource(parser)
            this.currentFileRelativePath = getCurrentFileRelativePath(parser)
            this._walkBlock(ast)
          } catch (err) {
            parser.state.current.errors.push(
              new ParentContextParserPluginError(err)
            )
          }
        })
      })
    })
  }

  _walkBlock(node, params) {
    node.body.forEach(childNode => {
      switch (childNode.type) {
        case 'FunctionDeclaration':
          return this._walkFunctionDeclaration(childNode)
        case 'VariableDeclaration':
          return this._walkVariableDeclaration(childNode)
        case 'ExpressionStatement':
          return this._walkExpressionStatement(childNode, params)
        default:
      }
    })
  }

  _walkFunctionDeclaration(node) {
    const params = node.params.map(idParser)
    return this._walkBlock(node.body, params)
  }

  _walkVariableDeclaration(node) {
    const { declarations, range, loc, kind } = node
    const { id, init } = declarations[0]
    if (init.type !== 'CallExpression') return

    const { arguments: args, callee } = init

    // parsedCallee is either 'ParentContext' in 'ParentContext.get()'
    // or 'require' in 'require(...)'
    const parsedCallee = calleeParser(callee)
    const variableId = idParser(id)

    switch (parsedCallee) {
      // get the variable name for require('__parentContext')
      case 'require': {
        if (args[0].value === '__parentContext') {
          this.contextGetterVarName = variableId
        }
        return
      }
      // replace all the calls to methods of the variable obtained
      // in the previous case clause with the parent context
      // inserted as the last argument
      case this.contextGetterVarName: {
        const dep = new ConstDependency(`${kind} ${variableId} = arguments.length && arguments[arguments.length - 1].__parentContext`, range)
        dep.loc = loc
        this.parser.state.current.addDependency(dep)
        return
      }
      default:
    }
  }

  _walkExpressionStatement(node, params) {
    const { range, loc } = node
    const { type, callee } = node.expression
    if (type !== 'CallExpression' || !params || this._isIgnored(callee)) return

    // wrap params from the parent function in
    // `, { __parentContext: { param1, param2 } })`
    const parentContext = generateParentContext(params)

    // insert the parent context as the last
    // argument in the child call expression
    let expressionSource = this._getExpressionSource(range)
    expressionSource = expressionSource.substring(0, expressionSource.length - 1).concat(parentContext)

    // addDependency is declared in DependenciesBlock
    // Module extends DependenciesBlock
    // dependencies then processed in JavascriptGenerator
    //(render templates in Compilation before saving files)
    const dep = new ConstDependency(`${expressionSource}`, range)
    dep.loc = loc
    this.parser.state.current.addDependency(dep)
  }

  _isIgnored(callee) {
    // ignore some callees, e.g., JSON, Object, etc
    // together with the ones from the options
    const parsedCallee = calleeParser(callee)

    return this.options.ignoreCallees.includes(parsedCallee)
  }

  _getExpressionSource(range) {
    return this.source.substring(range[0], range[1])
  }
}

module.exports = ParentContextParserPlugin