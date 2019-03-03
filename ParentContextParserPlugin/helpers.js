const NullFactory = require('webpack/lib/NullFactory')
const ConstDependency = require('webpack/lib/dependencies/ConstDependency')

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

const calleeParser = callee => {
  const parsedCallee = memberParser(callee)

  // calleeObject is either 'ParentContext' in 'ParentContext.get()'
  // or 'require' in 'require(...)'
  return parsedCallee && parsedCallee.split('.')[0]
}

const generateParentContext = (params, undefinedArgumentsBefore = 4) => {
  const filling = new Array(undefinedArgumentsBefore).fill('undefined').join(',')
  const wrappedFilling = filling ? `${filling},` : ''

  return `,${wrappedFilling}{ __parentContext: { ${params.join(', ')} } })`
}

const setDependencyTemplates = compilation => {
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
}

const getSource = parser => parser.state.current.originalSource().source()
const getCurrentFileRelativePath = parser => parser.state.current.userRequest.replace(parser.state.current.context, '.')

module.exports = {
  IGNORE_CALLEES,
  setDependencyTemplates,
  idParser,
  calleeParser,
  generateParentContext,
  getSource,
  getCurrentFileRelativePath,
}