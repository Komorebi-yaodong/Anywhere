<script setup>
import { ref, onMounted, nextTick } from 'vue'
import { useI18n } from 'vue-i18n'

const { t, locale } = useI18n()

const defaultConfig = {
  config: {
    providers: {
      "0": {
        name: "default",
        url: "https://api.openai.com/v1",
        api_key: "",
        modelList: [],
        enable: true,
      },
    },
    providerOrder: ["0",],
    prompts: {
      Completion: {
        type: "over",
        prompt: `你是一个文本续写模型，用户会输入内容，请你根据用户提供的内容完成续写。续写的内容要求符合语境语义，与前文连贯。注意续写不要重复已经提供的内容，只执行续写操作，不要有任何多余的解释。`,
        showMode: "input",
        model: "",
        enable: true,
        icon:"",
        stream: true,
        isTemperature: false,
        temperature: 0.7,
      },
    },
    tags: {},
    stream: true,
    skipLineBreak: false,
    window_height: 520,
    window_width: 400,
    autoCloseOnBlur: false,
    CtrlEnterToSend: false,
    showNotification: true,
    isDarkMode: false,
    fix_position: false,
  }
};

const currentConfig = ref(JSON.parse(JSON.stringify(defaultConfig.config)));
const selectedLanguage = ref(locale.value);

// Setting.vue - onMounted
onMounted(async () => {
  try {
    const result = await window.api.getConfig();

    if (result && result.config) {
      currentConfig.value = result.config;
    } else {
      console.error("Failed to get valid config from API.");
      currentConfig.value = JSON.parse(JSON.stringify(defaultConfig.config));
    }
  } catch (error) {
    console.error("Error fetching config in Setting.vue:", error);
    currentConfig.value = JSON.parse(JSON.stringify(defaultConfig.config));
  }
  
  // 这部分是设置语言的逻辑，可以保留
  selectedLanguage.value = locale.value;
  await nextTick();
});

async function saveConfig() {
  try {
    const new_config = {
      config: JSON.parse(JSON.stringify(currentConfig.value))
    };
    if (window.api && window.api.updateConfig) {
      await window.api.updateConfig(new_config);
    } else {
      console.warn("window.api.updateConfig is not available. Settings not saved.");
    }
  } catch (error) {
    console.error("Error saving settings config:", error);
  }
}

function handleLanguageChange(lang) {
  locale.value = lang;
  localStorage.setItem('language', lang);
  selectedLanguage.value = lang;
}

async function exportConfig() {
  try {
    const configToExport = JSON.parse(JSON.stringify(currentConfig.value));
    const jsonString = JSON.stringify(configToExport, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Anywhere_config.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    console.log("Configuration exported successfully.");
  } catch (error) {
    console.error("Error exporting config:", error);
  }
}

function importConfig() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const importedData = JSON.parse(e.target.result);
          
          // 获取一份干净的默认配置作为基础/回退
          const baseConfig = JSON.parse(JSON.stringify(defaultConfig.config));
          
          // 将导入的数据作为主目标，用默认配置去补充它可能缺失的顶级键
          const newConfig = deepMerge(baseConfig, importedData);
          
          const finalConfig = deepMerge(baseConfig, importedData); // 先进行深度合并，保证所有键存在

          // 然后，强制用导入的数据替换掉集合类型的属性
          // 如果导入数据中没有这些键，就用一个空的默认值，而不是 baseConfig 的内容
          finalConfig.providers = importedData.providers || {};
          finalConfig.prompts = importedData.prompts || {};
          finalConfig.tags = importedData.tags || {};
          finalConfig.providerOrder = importedData.providerOrder || [];

          currentConfig.value = finalConfig;

          await saveConfig();
          await nextTick();
          console.log("Configuration imported and replaced successfully.");
          ElMessage.success(t('setting.alerts.importSuccess'));

        } catch (err) {
          console.error("Error importing configuration:", err);
          ElMessage.error(t('setting.alerts.importFailed'));
        }
      };
      reader.readAsText(file);
    }
  };
  input.click();
}
</script>

<template>
  <div class="settings-page-container">
    <el-scrollbar class="settings-scrollbar-wrapper">
      <div class="settings-card">
        <h2 class="settings-card-title">{{ t('setting.title') }}</h2>

        <div class="setting-option-item">
          <div class="setting-text-content">
            <span class="setting-option-label">{{ t('setting.language.label') }}</span>
          </div>
          <el-select v-model="selectedLanguage" @change="handleLanguageChange" :placeholder="t('setting.language.selectPlaceholder')" size="small" style="width: 120px;">
            <el-option :label="t('setting.language.chinese')" value="zh"></el-option>
            <el-option :label="t('setting.language.english')" value="en"></el-option>
            <el-option :label="t('setting.language.japanese')" value="ja"></el-option>
            <el-option :label="t('setting.language.russian')" value="ru"></el-option>
          </el-select>
        </div>

        <div class="setting-option-item">
          <div class="setting-text-content">
            <span class="setting-option-label">{{ t('setting.stream.label') }}</span>
            <span class="setting-option-description">{{ t('setting.stream.description') }}</span>
          </div>
          <el-switch v-model="currentConfig.stream" @change="saveConfig" />
        </div>

        <div class="setting-option-item">
          <div class="setting-text-content">
            <span class="setting-option-label">{{ t('setting.darkMode.label') }}</span>
            <span class="setting-option-description">{{ t('setting.darkMode.description') }}</span>
          </div>
          <el-switch v-model="currentConfig.isDarkMode" @change="saveConfig" />
        </div>

        <div class="setting-option-item">
          <div class="setting-text-content">
            <span class="setting-option-label">{{ t('setting.autoClose.label') }}</span>
            <span class="setting-option-description">{{ t('setting.autoClose.description') }}</span>
          </div>
          <el-switch v-model="currentConfig.autoCloseOnBlur" @change="saveConfig" />
        </div>

        <div class="setting-option-item">
          <div class="setting-text-content">
            <span class="setting-option-label">{{ t('setting.skipLineBreak.label') }}</span>
            <span class="setting-option-description">{{ t('setting.skipLineBreak.description') }}</span>
          </div>
          <el-switch v-model="currentConfig.skipLineBreak" @change="saveConfig" />
        </div>

        <div class="setting-option-item">
          <div class="setting-text-content">
            <span class="setting-option-label">{{ t('setting.ctrlEnter.label') }}</span>
            <span class="setting-option-description">{{ t('setting.ctrlEnter.description') }}</span>
          </div>
          <el-switch v-model="currentConfig.CtrlEnterToSend" @change="saveConfig" />
        </div>

        <div class="setting-option-item">
          <div class="setting-text-content">
            <span class="setting-option-label">{{ t('setting.notification.label') }}</span>
            <span class="setting-option-description">{{ t('setting.notification.description') }}</span>
          </div>
          <el-switch v-model="currentConfig.showNotification" @change="saveConfig" />
        </div>

        <div class="setting-option-item">
          <div class="setting-text-content">
            <span class="setting-option-label">{{ t('setting.fixPosition.label') }}</span>
            <span class="setting-option-description">{{ t('setting.fixPosition.description') }}</span>
          </div>
          <el-switch v-model="currentConfig.fix_position" @change="saveConfig" />
        </div>

        <h2 class="settings-card-title section-divider">{{ t('setting.dataManagement.title') }}</h2>
         <div class="setting-option-item">
          <div class="setting-text-content">
            <span class="setting-option-label">{{ t('setting.dataManagement.exportLabel') }}</span>
            <span class="setting-option-description">{{ t('setting.dataManagement.exportDesc') }}</span>
          </div>
          <el-button @click="exportConfig" size="small">{{ t('setting.dataManagement.exportButton') }}</el-button>
        </div>
        <div class="setting-option-item">
          <div class="setting-text-content">
            <span class="setting-option-label">{{ t('setting.dataManagement.importLabel') }}</span>
            <span class="setting-option-description">{{ t('setting.dataManagement.importDesc') }}</span>
          </div>
          <el-button @click="importConfig" size="small">{{ t('setting.dataManagement.importButton') }}</el-button>
        </div>


        <h2 class="settings-card-title section-divider">{{ t('setting.dimensions.title') }}</h2>
        <div class="setting-option-item dimensions-group">
          <el-form-item :label="t('setting.dimensions.widthLabel')" class="dimension-config-item">
            <el-input-number v-model="currentConfig.window_width" :min="200" :max="1200" @change="saveConfig"
              controls-position="right" />
          </el-form-item>
          <el-form-item :label="t('setting.dimensions.heightLabel')" class="dimension-config-item">
            <el-input-number v-model="currentConfig.window_height" :min="150" :max="900" @change="saveConfig"
              controls-position="right" />
          </el-form-item>
        </div>

      </div>
    </el-scrollbar>
  </div>
</template>

<style scoped>
.settings-page-container {
  height: 100%;
  width: 100%;
  background-color: #f7f7f8;
  display: flex;
  justify-content: center;
  padding-top: 20px;
  padding-bottom: 20px;
  box-sizing: border-box;
}

.settings-scrollbar-wrapper {
  width: 100%;
  max-width: 700px;
}

.settings-card {
  background-color: #ffffff;
  padding: 28px 32px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.settings-card-title {
  font-size: 18px;
  font-weight: 600;
  color: #202123;
  margin: 0 0 18px 0;
  padding-bottom: 16px;
  border-bottom: 1px solid #ebeef5;
}

.section-divider {
  margin-top: 30px;
  margin-bottom: 20px;
}

.setting-option-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 0;
  border-bottom: 1px solid #f0f2f5;
}

.setting-option-item .el-select {
  width: 150px;
}

.setting-option-item .el-button {
  min-width: 80px;
}


.dimensions-group.setting-option-item {
  border-bottom: none;
  padding-bottom: 0;
}


.setting-text-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-right: 16px;
  flex-grow: 1; /* Allow text content to take available space */
  min-width: 0; /* Prevent overflow issues with long text */
}

.setting-option-label {
  font-size: 14px;
  font-weight: 500;
  color: #3c4043;
}

.setting-option-description {
  font-size: 12px;
  color: #70757a;
  word-break: break-word;
}

.el-switch {
  --el-switch-on-color: #1a73e8;
  --el-switch-off-color: #bdc1c6;
}

:deep(.el-switch.is-checked .el-switch__core) {
  background-color: #0070f3;
  border-color: #0070f3;
}

.dimensions-group {
  display: flex;
  flex-direction: column;
  gap: 15px;
  align-items: stretch;
}

.dimension-config-item {
  margin-bottom: 0;
}

.dimension-config-item :deep(.el-form-item__label) {
  font-size: 14px;
  font-weight: 500;
  color: #3c4043;
  padding-bottom: 6px !important;
  line-height: normal;
}

.dimension-config-item :deep(.el-input-number) {
  width: 100%;
}
</style>