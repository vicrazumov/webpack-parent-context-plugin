const ConstDependency = require('webpack/lib/dependencies/ConstDependency')
const NullFactory = require('webpack/lib/NullFactory')

const IGNORE_CALLEES = ['Array', 'console', 'Math']

const idParser = node => node ? `${node.name}` : 'null'

const leftRightParser = node => {
  return {
    left: memberParser(node.left),
    operator: node.operator,
    right: memberParser(node.right),
  }
}

const objPropertyParser = node => {
  switch (node.type) {
    case 'Identifier':
      return idParser(node)
    case 'BinaryExpression':
      const parsed = leftRightParser(node)
      return `[${parsed.left} ${parsed.operator} ${parsed.right}]`
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

const expressionParser = (node, params, parser) => {

  const { range } = node
  const { type, callee, arguments } = node.expression
  const parsedCallee = memberParser(callee)

  if (type === 'CallExpression' && !IGNORE_CALLEES.includes(parsedCallee.split('.')[0]) && params) {
    let expressionSource = parser.state.current.originalSource()._value.substring(range[0], range[1])
    const added = `,undefined,undefined,undefined,undefined, { __parentContext: { ${params.join(', ')} } })`
    expressionSource = expressionSource.substring(0, expressionSource.length - 1).concat(added)
    const dep = new ConstDependency(`${expressionSource}`, node.range)
    dep.loc = node.loc
    parser.state.current.addDependency(dep);
  }
}

const varInitParser = (node, parser) => {
  switch (node.type) {
    case 'LogicalExpression':
      return leftRightParser(node);
    case 'ArrowFunctionExpression':
      return functionParser(node, parser);
    default:
      return node
  }
}

const varParser = (node, parser) => {
  varInitParser(node.declarations[0].init, parser)
}

const ifParser = node => {
  objPropertyParser(node.test)
  programParser(node.consequent)
  node.alternate && programParser(node.alternate)
}

const functionParser = (node, parser) => {
  const params = node.params.map(param => idParser(param))
  programParser(node.body, params, parser)
}

const programParser = (node, params, parser) => {
  node.body.forEach(childNode => {
    switch (childNode.type) {
      case 'FunctionDeclaration':
        return functionParser(childNode, parser)
      case 'VariableDeclaration':
        return varParser(childNode, parser)
      case 'ExpressionStatement':
        return expressionParser(childNode, params, parser)
      case 'IfStatement':
        return ifParser(childNode)
      default:
        console.log(`\nNO PARSER FOUND FOR ${childNode.type}`, childNode)
    }
  })
}

class MyPlugin {
  constructor(options) {
    this.options = options
  }

  apply(compiler) {
    compiler.hooks.compilation.tap(
			'ParentContextPlugin',
			(compilation, { normalModuleFactory }) => {
        compilation.dependencyFactories.set(ConstDependency, new NullFactory());
				compilation.dependencyTemplates.set(
					ConstDependency,
					new ConstDependency.Template()
				);
        normalModuleFactory.hooks.parser.for('javascript/auto').tap('MyPlugin', (parser, options) => {
          parser.hooks.program.tap('ParentContextPlugin', (ast, comments) => {
            programParser(ast, undefined, parser)
          })
        })
      })
  }
}

module.exports = MyPlugin