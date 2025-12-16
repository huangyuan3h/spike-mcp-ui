import {NAME, OWNER_DOCUMENT, NodeType} from './constants.ts';
import {ParentNode} from './ParentNode.ts';

export class DocumentFragment extends ParentNode {
  nodeType = NodeType.DOCUMENT_FRAGMENT_NODE;
  [NAME] = '#document-fragment';
  [OWNER_DOCUMENT] = (typeof window !== 'undefined'
    ? window.document
    : null) as any;
}
