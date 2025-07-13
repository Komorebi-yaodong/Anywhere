import './assets/main.css'

import { createApp } from 'vue'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import App from './App.vue'
import { createI18n } from 'vue-i18n'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'

// 导入所有语言文件
import en from './locales/en.json'
import zh from './locales/zh.json'
import ja from './locales/ja.json'
import ru from './locales/ru.json'


// 获取初始语言
const getInitialLocale = () => {
  const savedLanguage = localStorage.getItem('language');
  if (savedLanguage && ['en', 'zh', 'ja', 'ru'].includes(savedLanguage)) {
    return savedLanguage;
  }
  const browserLanguage = navigator.language.split('-')[0];
  if (['zh', 'en', 'ja', 'ru'].includes(browserLanguage)) {
    return browserLanguage;
  }
  return 'zh'; // 默认回退到中文
};

const initialLocale = getInitialLocale();

const i18n = createI18n({
  legacy: false,
  locale: initialLocale,
  fallbackLocale: 'en',
  messages: {
    en: en,
    zh: zh,
    ja: ja,
    ru: ru
  }
});

const app = createApp(App)

// Element Plus 国际化配置 (App.vue 中使用 el-config-provider 实现动态切换)
// 这里不再直接 use ElementPlus locale，而是通过 App.vue 中的 ConfigProvider
app.use(ElementPlus);
app.use(i18n);
app.mount('#app');
