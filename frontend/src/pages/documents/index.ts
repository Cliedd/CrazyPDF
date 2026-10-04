import template from '../../../pages/documents.html?raw';
import { setupVault } from '../../features/document-vault';
export function renderDocuments(root:HTMLElement){root.innerHTML=template;setupVault()}
