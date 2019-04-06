/* tslint:disable:max-line-length */

// We have to import babel traverse here to ensure their types are read first
import '@babel/traverse';
import { Identifier, Node } from '@babel/types';

declare module '@babel/traverse' {
  interface NodePath<T = Node> {
    /**
     * Babel's types specify that this method returns an array of nodes when it actually returns a
     * dictionary of identifiers keyed by their name.
     */
    getBindingIdentifiers(): { [k: string]: Identifier };
    getBindingIdentifiers(duplicates: false): { [k: string]: Identifier };
    getBindingIdentifiers(duplicates: true): { [k: string]: Identifier[] };
    getBindingIdentifiers(duplicates?: boolean): { [k: string]: Identifier | Identifier[] };

    /**
     * This method is missing entirely from babel's types. It is almost identical to
     * getBindingIdentifiers but returns paths instead of nodes.
     */
    getBindingIdentifierPaths(): { [k: string]: NodePath<Identifier> };
    getBindingIdentifierPaths(duplicates: false): { [k: string]: NodePath<Identifier> };
    getBindingIdentifierPaths(duplicates: true): { [k: string]: NodePath<Identifier[]> };
    getBindingIdentifierPaths(duplicates?: boolean): { [k: string]: NodePath<Identifier | Identifier[]> };
  }
}

