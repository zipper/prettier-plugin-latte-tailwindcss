import type { Doc, Printer } from 'prettier'

export interface LatteAstNode {
  body: string
}

export const printer: Printer<LatteAstNode> = {
  print(path): Doc {
    const node = path.getValue() as LatteAstNode
    return node.body
  }
}
