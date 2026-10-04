import template from '../../../pages/background.html?raw';
import { setupBackground } from '../../features/background-removal';
export function renderBackground(root:HTMLElement){root.innerHTML=template;setupBackground()}
