// TODO: comment1

const IGNORED_BY_PCP = {
  showParentContext (name, args) {
    const lastArgument = args.length && args[args.length - 1]
    if (lastArgument.__parentContext) {
      console.warn(`${name} received parentContext`, lastArgument)
    } else {
      console.warn(args)
    }
  }
}

function child(arg1, arg2, arg3) {
  console.log('child start')
  IGNORED_BY_PCP.showParentContext('child', arguments)
  console.log('child end')
}

// FIXME: comment2

function parent(arg1, arg2, arg3) {
  console.log('parent start')
  IGNORED_BY_PCP.showParentContext('parent', arguments)
  child('abc', 'def', 'ghi')
  console.log('parent end')
}

const arrow = (arg1) => {
  parent('parg1', 'parg2', { hello: 'hi' })
}

arrow('start')