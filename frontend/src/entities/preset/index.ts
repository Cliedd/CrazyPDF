export type Preset = {country:string;label:string;width_mm:number;height_mm:number;width_px?:number;height_px?:number;dpi:number;max_kb?:number;head_min_mm?:number;head_max_mm?:number;head_min_ratio?:number;head_max_ratio?:number;no_retouch?:boolean;source:string;note:string;background:string;verified_on:string};

import { api } from '../../shared/api';
export let presets: Record<string, Preset> = {};
export async function loadPresets() { presets = await api('/presets'); }
