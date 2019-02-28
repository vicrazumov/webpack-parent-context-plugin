const showParentContext = (name, arguments) => {
  const lastArgument = arguments.length && arguments[arguments.length - 1]
  if (lastArgument.__parentContext) {
    console.warn(`${name} received parentContext`, lastArgument)
  } else {
    console.warn(arguments)
  }
}

function child(arg1, arg2, arg3) {
  console.log('child start')
  showParentContext('child', arguments)
  console.log('child end')
}

function parent(arg1, arg2, arg3) {
  console.log('parent start')
  showParentContext('parent', arguments)
  child('abc', 'def', 'ghi')
  console.log('parent end')
}

const arrow = (arg1) => {
  parent('parg1', 'parg2', { hello: 'hi' })
}

arrow('start')