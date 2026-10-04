import template from '../../../pages/studio.html?raw';
import { setupStudio } from '../../features/photo-editor';
export function renderStudio(root:HTMLElement){root.innerHTML=template;setupStudio()}
