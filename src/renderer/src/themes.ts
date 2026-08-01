/**
 * 莫兰迪配色主题定义
 * 每套主题包含 10 个语义化色值
 */

export interface ThemeColors {
  name: string
  label: string
  description: string
  bg: string           // 页面底色
  surface: string      // 卡片/面板底色
  accent: string       // 主要强调色
  accentHover: string  // 强调色悬浮态
  secondary: string    // 辅助强调色
  secondaryHover: string
  text: string         // 主文字色
  textMuted: string    // 次要文字色
  border: string       // 边框色
  overlay: string      // 播放器覆盖层（始终深色）
  scrollThumb: string  // 滚动条滑块
  scrollHover: string  // 滚动条悬浮
}

const THEMES: Record<string, ThemeColors> = {
  'warm-oat': {
    name: 'warm-oat',
    label: '暖燕麦',
    description: '米白底 + 鼠尾草绿，温暖自然',
    bg: '#F5F0E8',
    surface: '#EBE5D9',
    accent: '#9CAF88',
    accentHover: '#859972',
    secondary: '#8EACBF',
    secondaryHover: '#7B9BB0',
    text: '#3D3A35',
    textMuted: '#8B8579',
    border: '#DDD6CB',
    overlay: '#1a1a1a',
    scrollThumb: '#C5BFB3',
    scrollHover: '#A8A093',
  },

  'cool-linen': {
    name: 'cool-linen',
    label: '冷亚麻',
    description: '冷灰底 + 雾霾蓝，沉静克制',
    bg: '#F0F2F4',
    surface: '#E4E8EC',
    accent: '#8EACBF',
    accentHover: '#7B9BB0',
    secondary: '#9CAF88',
    secondaryHover: '#859972',
    text: '#3A3D40',
    textMuted: '#8E9398',
    border: '#D5DAE0',
    overlay: '#1a1a1a',
    scrollThumb: '#C0C7CE',
    scrollHover: '#A3ABB4',
  },

  'rose-ash': {
    name: 'rose-ash',
    label: '玫瑰灰',
    description: '暖粉底 + 干枯玫瑰，柔和浪漫',
    bg: '#F4EEEC',
    surface: '#EBE2DE',
    accent: '#C4A0A0',
    accentHover: '#B38B8B',
    secondary: '#A8B5A0',
    secondaryHover: '#96A48E',
    text: '#3D3735',
    textMuted: '#8E807C',
    border: '#DDD0CB',
    overlay: '#1a1a1a',
    scrollThumb: '#C8BAB5',
    scrollHover: '#B0A09B',
  },

  'almond-cream': {
    name: 'almond-cream',
    label: '杏仁',
    description: '杏仁奶白 + 暖驼色，温润甜暖',
    bg: '#F6F1E8',
    surface: '#EDE6DA',
    accent: '#C4A882',
    accentHover: '#B69870',
    secondary: '#B0B8A0',
    secondaryHover: '#9EA88E',
    text: '#4A4238',
    textMuted: '#968878',
    border: '#DED6C8',
    overlay: '#1a1a1a',
    scrollThumb: '#C8C0B2',
    scrollHover: '#B0A898',
  },

  'sakura': {
    name: 'sakura',
    label: '樱',
    description: '淡樱粉 + 灰绿，温柔清新',
    bg: '#F5EEF0',
    surface: '#EDE2E5',
    accent: '#C4A0A8',
    accentHover: '#B38E98',
    secondary: '#A8B5A0',
    secondaryHover: '#96A48E',
    text: '#3D3538',
    textMuted: '#8E7E82',
    border: '#DDD0D4',
    overlay: '#1a1a1a',
    scrollThumb: '#C8BABE',
    scrollHover: '#B0A2A6',
  },

  'lavender-mist': {
    name: 'lavender-mist',
    label: '薰衣雾',
    description: '淡紫底 + 灰紫，优雅清新',
    bg: '#F2F0F5',
    surface: '#E7E4ED',
    accent: '#B0A4C0',
    accentHover: '#9E92B0',
    secondary: '#A0B0A8',
    secondaryHover: '#8E9E96',
    text: '#3C3A3F',
    textMuted: '#8E8B93',
    border: '#D8D4DE',
    overlay: '#1a1a1a',
    scrollThumb: '#C4BFCE',
    scrollHover: '#ADA7B8',
  },
}

export default THEMES

/** 默认主题名 */
export const DEFAULT_THEME = 'warm-oat'

/** 存储 key */
export const THEME_STORAGE_KEY = 'anibox-theme'
