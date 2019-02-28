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

  if (type === 'CallExpression' && !options.ignoreCallees.includes(parsedCallee.split('.')[0]) && params) {
    const parentContext = generateParentContext(params, options.undefinedArgumentsBefore)

    let expressionSource = source.substring(range[0], range[1])
    expressionSource = expressionSource.substring(0, expressionSource.length - 1).concat(parentContext)

    const dep = new ConstDependency(`${expressionSource}`, range)
    dep.loc = node.loc
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
			'ParentContextPlugin',
			(compilation, { normalModuleFactory }) => {
        console.log(this.options)
        compilation.dependencyFactories.set(ConstDependency, new NullFactory());
				compilation.dependencyTemplates.set(
					ConstDependency,
					new ConstDependency.Template()
				);
        normalModuleFactory.hooks.parser.for('javascript/auto').tap('MyPlugin', (parser, options) => {
          parser.hooks.program.tap('ParentContextPlugin', (ast, comments) => {
            const originalSource = parser.state.current.originalSource()
            if (!originalSource) return
            const source = originalSource._value
            if (!source) return

            programParser(ast, undefined, parser, source, this.options)
          })
        })
      })
  }
}

module.exports = ParentContextPlugin