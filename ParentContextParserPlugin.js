const ConstDependency = require('webpack/lib/dependencies/ConstDependency')
const NullFactory = require('webpack/lib/NullFactory')
const WebpackError = require('webpack/lib/WebpackError')

const IGNORE_CALLEES = ['Array', 'console', 'Math', 'Object', 'JSON']

const idParser = node => node ? `${node.name}` : 'null'

const objPropertyParser = node => {
  switch (node.type) {
    case 'Identifier':
      return idParser(node)
    default:
      return memberParser(node)
  }
}

const literalParser = node => {
  return node.value || '[Object]'
}

const memberParser = node => {
  if (!node) return
  if (node.type === 'Literal') return literalParser(node)

  const { object, property } = node
  if (!object) return idParser(node)

  let parsedObject = objPropertyParser(object)
  let parsedProperty = objPropertyParser(property)

  return `${parsedObject}.${parsedProperty}`
}

const generateParentContext = (params, undefinedArgumentsBefore = 4) => {
  const filling = new Array(undefinedArgumentsBefore).fill('undefined').join(',')
  const wrappedFilling = filling ? `${filling},` : ''

  return `,${wrappedFilling}{ __parentContext: { ${params.join(', ')} } })`
}

class ParentContextParserPlugin {
  constructor(options) {
    const { ignoreCallees = [] } = options
    this.options = {
      ignoreCallees: [...ignoreCallees, ...IGNORE_CALLEES],
    }
  }

  apply(compiler) {
    // handle unresolved require('__parentContext') by replacing
    // it with require of the current file
    compiler.hooks.normalModuleFactory.tap(
			this.constructor.name,
			nmf => {
				nmf.hooks.beforeResolve.tap(this.constructor.name, result => {
					if (!result) return;
					if (result.request === '__parentContext') {
            result.request = this.currentFileRelativePath
					}
					return result;
				});
			}
		);

    compiler.hooks.compilation.tap(this.constructor.name, (compilation, { normalModuleFactory }) => {
      // defines how the JavascriptGenerator will treat the dependency
      // ConstDependency Template replaces source code with the one from dep
      //
      // this exact code is not necessary - another webpack plugins will already
      // have this factory and template added by this time
      compilation.dependencyFactories.set(ConstDependency, new NullFactory())
      compilation.dependencyTemplates.set(
        ConstDependency,
        new ConstDependency.Template()
      )

      normalModuleFactory.hooks.parser.for('javascript/auto').tap(this.constructor.name, (parser, options) => {
        this.parser = parser

        parser.hooks.program.tap(this.constructor.name, (ast, comments) => {
          try {
            const { current } = parser.state
            this.source = current.originalSource().source()
            this.currentFileRelativePath = current.userRequest.replace(current.context, '.')
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
    const parsedCallee = memberParser(callee)

    // calleeObject is either 'ParentContext' in 'ParentContext.get()'
    // or 'require' in 'require(...)'
    const calleeObject = parsedCallee && parsedCallee.split('.')[0]

    const parsedId = idParser(id)
    switch (calleeObject) {
      // get the variable name for require('__parentContext')
      case 'require': {
        if (args[0].value === '__parentContext') {
          this.contextGetterVarName = parsedId
        }
        return
      }
      // replace all the calls to methods of the variable obtained
      // in the previous case clause with the parent context
      // inserted as the last argument
      case this.contextGetterVarName: {
        const dep = new ConstDependency(`${kind} ${parsedId} = arguments.length && arguments[arguments.length - 1].__parentContext`, range)
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
    if (type !== 'CallExpression' || !params) return

    const parsedCallee = memberParser(callee)
    const calleeObject = parsedCallee && parsedCallee.split('.')[0]

    // ignore some callees, e.g., JSON, Object, etc
    // together with the ones from the options
    if (!this.options.ignoreCallees.includes(calleeObject)) {
      // wrap params from the parent function
      const parentContext = generateParentContext(params)

      // insert the object with parent params as the last argument
      // in the child call expression
      let expressionSource = this.source.substring(range[0], range[1])
      expressionSource = expressionSource.substring(0, expressionSource.length - 1).concat(parentContext)

      // addDependency is declared in DependenciesBlock
      // Module extends DependenciesBlock
      // dependencies then processed in JavascriptGenerator
      //(render templates in Compilation before saving files)
      const dep = new ConstDependency(`${expressionSource}`, range)
      dep.loc = loc
      this.parser.state.current.addDependency(dep)
    }
  }
}

class ParentContextParserPluginError extends WebpackError {
	constructor(message) {
		super()

		this.name = 'ParentContextParserPlugin'
		this.message = message

		Error.captureStackTrace(this, this.constructor)
	}
}

module.exports = ParentContextParserPlugin