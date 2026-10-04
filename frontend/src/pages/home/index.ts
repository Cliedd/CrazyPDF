import template from '../../../pages/home.html?raw';
import { setupHome } from '../../features/document-conversion';
export function renderHome(root:HTMLElement){root.innerHTML=template;setupHome()}
