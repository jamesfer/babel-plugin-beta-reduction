/* tslint:disable:max-line-length */

import { Node, Identifier } from '@babel/types';

declare module '@babel/types' {
  export const getBindingIdentifiers: {
    (node: Node): { [k: string]: Identifier };
    (node: Node, duplicates: false): { [k: string]: Identifier };
    (node: Node, duplicates: true): { [k: string]: Identifier[] };
    (node: Node, duplicates?: boolean): { [k: string]: Identifier | Identifier[] };

    keys: { [k: string]: string[] };
  };

  export function getOuterBindingIdentifiers(node: Node): { [k: string]: Identifier };
  export function getOuterBindingIdentifiers(node: Node, duplicates: false): { [k: string]: Identifier };
  export function getOuterBindingIdentifiers(node: Node, duplicates: true): { [k: string]: Identifier[] };
  export function getOuterBindingIdentifiers(node: Node, duplicates?: boolean): { [k: string]: Identifier | Identifier[] };
}
