import './assets/main.css'

import { createApp } from 'vue'
import App from './App.vue'
// import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
// import 'element-plus/theme-chalk/dark/css-vars.css'
import '@/assets/dark.css';

const app = createApp(App)


// app.use(ElementPlus)
app.mount('#app')