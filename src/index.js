const ParentContext = require('__parentContext')

function child(arg1, arg2, arg3) {
  const parentContext = ParentContext.get()
  console.log(parentContext) // should print { parg1: 'pp1', parg2: 'pp2' }
}

function parent(parg1, parg2) {
  child('abc', 'def', 'ghi')
}

parent('pp1', 'pp2')