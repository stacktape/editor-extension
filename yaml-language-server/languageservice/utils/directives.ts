export const startsLikeDirective = (str: string) => {
  return /^\$(.*)\(/.test(str);
};

export const startsLikeDirectiveNotUsableInSub = (str: string) => {
  return str.startsWith('$CfFormat');
};

export const startsLikeGetParamDirective = (str: string) => {
  return str.startsWith('$GetParam');
};

export const getIsDirective = (node: any) => {
  if (typeof node !== 'string') {
    return false;
  }
  if (!startsLikeDirective(node)) {
    return false;
  }
  if (!node.includes(')')) {
    return false;
  }
  const firstPathCharacter = node[node.lastIndexOf(')') + 1];
  if (firstPathCharacter && firstPathCharacter !== '.') {
    return false;
  }
  // const directivePathToProp = getDirectivePathToProp(node);
  // @todo
  // if (directivePathToProp.length && !directivePathToProp.join('').match(/^[$A-Z_][0-9A-Z_$]*\$/i)) {
  //   console.log('node', node);
  //   return false;
  // }
  return true;
};

export const getDirectiveName = (str: string) => {
  return str.match(/(?<=\$)(.*?)(?=\()/)[0];
};
