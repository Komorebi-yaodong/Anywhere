'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const sentMessages = [];
const createdWindows = [];
const workArea = { x: 0, y: 0, width: 1000, height: 800 };

function createMockWindow(url, options, callback) {
  let bounds = {
    x: Number(options.x) || 0,
    y: Number(options.y) || 0,
    width: Number(options.width) || 580,
    height: Number(options.height) || 740,
  };
  let alwaysOnTop = options.alwaysOnTop === true;
  const win = {
    webContents: {
      send(channel, payload) {
        sentMessages.push({ channel, payload });
      },
      openDevTools() {},
    },
    show() {},
    focus() {},
    close() {},
    minimize() {},
    maximize() {},
    unmaximize() {},
    isMaximized: () => false,
    isMinimized: () => false,
    isDestroyed: () => false,
    isVisible: () => true,
    getBounds: () => ({ ...bounds }),
    setBounds(nextBounds) {
      bounds = { ...nextBounds };
    },
    isAlwaysOnTop: () => alwaysOnTop,
    setAlwaysOnTop(nextState) {
      alwaysOnTop = nextState === true;
    },
  };
  createdWindows.push({ options, win });
  queueMicrotask(callback);
  return win;
}

const originalLoad = Module._load;
Module._load = function patchedLoad(request, parent, isMain) {
  if (request === 'electron') {
    return {
      webFrame: { setZoomFactor() {} },
      nativeImage: {},
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

global.utools = {
  isDev: () => false,
  getPrimaryDisplay: () => ({ bounds: workArea, workArea }),
  getDisplayNearestPoint: () => ({ bounds: workArea, workArea }),
  getCursorScreenPoint: () => ({ x: 500, y: 100 }),
  createBrowserWindow: createMockWindow,
  getFeatures: () => [],
  setFeature() {},
  removeFeature() {},
};

async function main() {
  const dataPath = path.resolve(__dirname, '..', 'src', 'data.js');
  const store = require(dataPath);
  Module._load = originalLoad;

  const config = {
    isDarkMode: false,
    isAlwaysOnTop_global: true,
    fix_position: false,
    prompts: {
      AI: {
        window_width: 580,
        window_height: 740,
        position_x: 10,
        position_y: 20,
        isAlwaysOnTop: true,
      },
    },
  };
  const descriptor = {
    conversationId: 'fixture-conversation',
    dbFile: 'fixture.db',
    title: 'fixture',
  };
  const sessionData = {
    anywhere_history: true,
    CODE: 'AI',
    currentPromptConfig: {
      window_width: 720,
      window_height: 610,
      position_x: 700,
      position_y: 650,
      isAlwaysOnTop: false,
      zoom: 1.25,
      autoCloseOnBlur: false,
    },
    fullHistory: [],
    chat_show: [],
  };
  const message = {
    os: 'win',
    code: 'AI',
    originalCode: 'AI',
    type: 'conversation',
    payload: '',
    conversation: { descriptor, sessionData, storageMode: 'local' },
    conversationTitle: descriptor.title,
  };

  const senderId = await store.openWindow(config, message);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(createdWindows.length, 1);
  assert.equal(createdWindows[0].options.width, 720);
  assert.equal(createdWindows[0].options.height, 610);
  assert.equal(createdWindows[0].options.x, 140);
  assert.equal(createdWindows[0].options.y, 100);
  assert.equal(createdWindows[0].options.alwaysOnTop, false);


  const fixedConfig = {
    ...config,
    fix_position: true,
    prompts: {
      AI: {
        ...config.prompts.AI,
        position_x: 30,
        position_y: 40,
      },
    },
  };
  await store.openWindow(fixedConfig, {
    ...message,
    conversation: {
      ...message.conversation,
      sessionData: {
        ...sessionData,
        currentPromptConfig: {
          ...sessionData.currentPromptConfig,
          position_x: 800,
          position_y: 700,
        },
      },
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(createdWindows[1].options.x, 30);
  assert.equal(createdWindows[1].options.y, 40);


  const overlapSenderId = await store.openWindow(config, { ...message });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(createdWindows[2].options.x, 170);
  assert.equal(createdWindows[2].options.y, 130);
  const overlapApplied = store.applyConversationWindowState(overlapSenderId, {
    window_width: 720,
    window_height: 610,
    position_x: 700,
    position_y: 650,
    isAlwaysOnTop: false,
  });
  assert.deepEqual(overlapApplied.bounds, { x: 170, y: 130, width: 720, height: 610 });

  const initMessage = sentMessages.find((entry) => entry.channel === 'window')?.payload;
  assert.ok(initMessage);
  assert.equal(initMessage.type, 'conversation');
  assert.equal(initMessage.payload, '');
  assert.equal(initMessage.conversation.descriptor.conversationId, descriptor.conversationId);

  const applied = store.applyConversationWindowState(senderId, {
    window_width: 1500,
    window_height: 900,
    position_x: 950,
    position_y: 790,
    isAlwaysOnTop: false,
  });
  assert.deepEqual(applied, {
    ok: true,
    bounds: { x: 0, y: 0, width: 1000, height: 800 },
    isAlwaysOnTop: false,
  });
  assert.deepEqual(createdWindows[0].win.getBounds(), applied.bounds);
  assert.equal(createdWindows[0].win.isAlwaysOnTop(), false);

  const mainSource = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'Anywhere_main', 'src', 'components', 'Chats.vue'),
    'utf8'
  );
  const windowSource = fs.readFileSync(
    path.resolve(__dirname, '..', '..', 'Anywhere_window', 'src', 'App.vue'),
    'utf8'
  );
  assert.match(mainSource, /openConversationWindow\(\{[\s\S]*?descriptor: opened\.descriptor,[\s\S]*?sessionData: opened\.sessionData/);
  assert.doesNotMatch(mainSource, /conversationId: opened\.descriptor\.conversationId,[\s\S]{0,240}?format: 'sqlite'/);
  assert.match(windowSource, /type: 'conversation',[\s\S]{0,80}?payload: ''/);
  assert.match(windowSource, /sourcePromptConfig\.value = \{ \.\.\.currentPromptConfigFromLoad \}/);
  assert.match(windowSource, /applyConversationWindowState\(\{[\s\S]{0,220}?window_width:[\s\S]{0,220}?isAlwaysOnTop:/);
  assert.doesNotMatch(windowSource, /applyConversationWindowState\(\{[\s\S]{0,260}?position_[xy]:/);

  console.log(JSON.stringify({
    ok: true,
    senderId,
    cursorBounds: { x: 140, y: 100, width: 720, height: 610 },
    fixedBounds: { x: 30, y: 40, width: 720, height: 610 },
    overlapBounds: overlapApplied.bounds,
    clampedBounds: applied.bounds,
    alwaysOnTop: applied.isAlwaysOnTop,
  }));
}

main().catch((error) => {
  Module._load = originalLoad;
  console.error(error);
  process.exitCode = 1;
});
