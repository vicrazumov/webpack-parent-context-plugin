const ConstDependency = require('webpack/lib/dependencies/ConstDependency')
const NullFactory = require('webpack/lib/NullFactory')

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

const generateParentContext = (params, undefinedArgumentsBefore) => {
  const filling = new Array(undefinedArgumentsBefore).fill('undefined').join(',')
  const wrappedFilling = filling ? `${filling},` : ''

  return `,${wrappedFilling}{ __parentContext: { ${params.join(', ')} } })`
}

const expressionParser = (node, params, parser, source, options) => {
  const { range } = node
  const { type, callee } = node.expression
  const parsedCallee = memberParser(callee)
  const calleeObject = parsedCallee && parsedCallee.split('.')[0]

  if (type === 'CallExpression' && !options.ignoreCallees.includes(calleeObject) && params) {
    const parentContext = generateParentContext(params, options.undefinedArgumentsBefore)

    let expressionSource = source.substring(range[0], range[1])
    expressionSource = expressionSource.substring(0, expressionSource.length - 1).concat(parentContext)

    const dep = new ConstDependency(`${expressionSource}`, range)
    dep.loc = node.loc
    // addDependency is declared in DependenciesBlock
    // Module extends DependenciesBlock
    // dependencies then processed in JavascriptGenerator (render templates in Compilation before saving files)

    parser.state.current.addDependency(dep)
  }
}

const varInitParser = (node, parser, source, options) => {
  switch (node.type) {
    case 'FunctionExpression':
    case 'ArrowFunctionExpression':
      return functionParser(node, parser, source, options)
    default:
  }
}

const varParser = (node, parser, source, options) => {
  node.declarations.forEach(declaration =>
    varInitParser(node.declarations[0].init, parser, source, options))
}

const ifParser = node => {
  objPropertyParser(node.test)
  programParser(node.consequent)
  node.alternate && programParser(node.alternate)
}

const functionParser = (node, parser, source, options) => {
  const params = node.params.map(idParser)
  programParser(node.body, params, parser, source, options)
}

const programParser = (node, params, parser, source, options) => {
  node.body.forEach(childNode => {
    switch (childNode.type) {
      case 'FunctionDeclaration':
        return functionParser(childNode, parser, source, options)
      case 'VariableDeclaration':
        return varParser(childNode, parser, source, options)
      case 'ExpressionStatement':
        return expressionParser(childNode, params, parser, source, options)
      default:
    }
  })
}
class ParentContextPlugin {
  constructor(options) {
    const { undefinedArgumentsBefore = 4, ignoreCallees = [] } = options
    this.options = {
      undefinedArgumentsBefore,
      ignoreCallees: [...ignoreCallees, ...IGNORE_CALLEES],
    }
  }

  apply(compiler) {
    compiler.hooks.compilation.tap(
      this.constructor.name,
			(compilation, { normalModuleFactory }) => {
        // defines how the JavascriptGenerator will treat the dependency
        // ConstDependency Template replaces source code with the one from dep
        //
        // this exact code is not necessary - another webpack plugins will already
        // have this factory and template added by this time
        compilation.dependencyFactories.set(ConstDependency, new NullFactory());
				compilation.dependencyTemplates.set(
					ConstDependency,
					new ConstDependency.Template()
        );

        normalModuleFactory.hooks.parser.for('javascript/auto').tap(this.constructor.name, (parser, options) => {
          // TODO: process errors
          //
          // parser.state.module.warnings.push(
					// 	new CommentCompilationWarning(
					// 		`Compilation error while processing magic comment(-s): /*${
					// 			comment.value
					// 		}*/: ${e.message}`,
					// 		parser.state.module,
					// 		comment.loc
					// 	)
					// );

          parser.hooks.program.tap(this.constructor.name, (ast, comments) => {
            const originalSource = parser.state.current.originalSource()
            if (!originalSource) return
            const source = originalSource.source()
            if (!source) return

            programParser(ast, undefined, parser, source, this.options)
          })
        })
      })
  }
}

module.exports = ParentContextPlugin