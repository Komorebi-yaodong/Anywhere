// ./Anywhere_window/src/utils/TextSearchUI.js

export default class TextSearchUI {
  constructor(options = {}) {
    this.options = Object.assign({
      theme: 'auto',
      scope: 'body',
      beforeShow: null
    }, options);

    this.container = null;
    this.input = null;
    this.matches = [];
    this.currentIndex = -1;
    this.isOpen = false;
    this.searchScope = null;
    
    // 保存绑定后的函数引用，以便销毁时移除监听
    this._handleResize = this._constrainToWindow.bind(this);

    this._init();
  }

  _init() {
    this._injectStyles();
    this._createUI();
    this._bindEvents();
    this.setTheme(this.options.theme);
    this.setScope(this.options.scope);
  }

  _injectStyles() {
    const styleId = 'text-search-ui-style';
    if (document.getElementById(styleId)) return;

    const css = `
      :root {
        --ts-bg: #ffffff;
        --ts-text: #333333;
        --ts-border: #e5e7eb;
        --ts-hover: #f3f4f6;
        --ts-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1);
        --ts-highlight: #ffeb3b;
        --ts-highlight-current: #ff9800;
        --ts-highlight-text: #000000;
      }
      
      [data-search-theme="dark"] {
        --ts-bg: #2a2a2a;
        --ts-text: #e5e7eb;
        --ts-border: #4b5563;
        --ts-hover: #374151;
        --ts-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5);
        --ts-highlight: #b45309;
        --ts-highlight-current: #f59e0b;
        --ts-highlight-text: #ffffff;
      }

      .text-search-container {
        position: fixed;
        top: 20px;
        right: 40px;
        z-index: 10000;
        background: var(--ts-bg);
        color: var(--ts-text);
        padding: 8px;
        border-radius: 6px;
        box-shadow: var(--ts-shadow);
        border: 1px solid var(--ts-border);
        display: flex;
        align-items: center;
        gap: 8px;
        font-family: system-ui, -apple-system, sans-serif;
        font-size: 14px;
        transition: opacity 0.2s;
        min-width: 300px;
      }

      .text-search-container.hidden {
        opacity: 0;
        pointer-events: none;
        /* 隐藏时不改变位置，避免动画乱跳，只改透明度和点击穿透 */
        visibility: hidden; 
      }

      .text-search-drag-handle {
        cursor: move;
        color: var(--ts-text);
        opacity: 0.5;
        padding: 0 4px;
        user-select: none;
      }

      .text-search-input {
        background: transparent;
        border: none;
        color: var(--ts-text);
        outline: none;
        flex-grow: 1;
        width: 120px;
        font-size: 14px;
      }

      .text-search-count {
        font-size: 12px;
        color: var(--ts-text);
        opacity: 0.7;
        white-space: nowrap;
        min-width: 40px;
        text-align: center;
        user-select: none;
      }

      .text-search-divider {
        width: 1px;
        height: 16px;
        background: var(--ts-border);
        margin: 0 4px;
      }

      .text-search-btn {
        background: transparent;
        border: none;
        color: var(--ts-text);
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background 0.1s;
      }

      .text-search-btn:hover {
        background: var(--ts-hover);
      }

      .text-search-btn:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }

      mark.search-highlight {
        background-color: var(--ts-highlight);
        color: var(--ts-highlight-text);
        border-radius: 2px;
        padding: 0 1px;
      }

      mark.search-highlight.current {
        background-color: var(--ts-highlight-current);
        color: var(--ts-highlight-text);
        outline: 2px solid rgba(255, 255, 255, 0.3);
      }
    `;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = css;
    document.head.appendChild(style);
  }

  _createUI() {
    this.container = document.createElement('div');
    this.container.className = 'text-search-container hidden';
    
    this.container.innerHTML = `
      <div class="text-search-drag-handle">⋮⋮</div>
      <input type="text" class="text-search-input" placeholder="查找消息..." />
      <span class="text-search-count">0/0</span>
      <div class="text-search-divider"></div>
      <button class="text-search-btn btn-prev" title="上一个 (Shift+Enter)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 15l-6-6-6 6"/></svg>
      </button>
      <button class="text-search-btn btn-next" title="下一个 (Enter)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <button class="text-search-btn btn-close" title="关闭 (Esc)">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
      </button>
    `;

    document.body.appendChild(this.container);

    this.input = this.container.querySelector('.text-search-input');
    this.countSpan = this.container.querySelector('.text-search-count');
    this.btnPrev = this.container.querySelector('.btn-prev');
    this.btnNext = this.container.querySelector('.btn-next');
    this.btnClose = this.container.querySelector('.btn-close');
  }

  _bindEvents() {
    // 输入事件
    this.input.addEventListener('input', (e) => {
      this.search(e.target.value);
    });

    this.input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (e.shiftKey) this.findPrevious();
        else this.findNext();
      }
    });

    // 按钮事件
    this.btnPrev.addEventListener('click', () => this.findPrevious());
    this.btnNext.addEventListener('click', () => this.findNext());
    this.btnClose.addEventListener('click', () => this.hide());

    // 全局快捷键
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        this.show();
      }
      if (e.key === 'Escape' && this.isOpen) {
        e.preventDefault();
        this.hide();
      }
    });

    // 窗口大小改变时，确保搜索框不跑出去
    window.addEventListener('resize', this._handleResize);

    // 拖拽逻辑
    const handle = this.container.querySelector('.text-search-drag-handle');
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    handle.addEventListener('mousedown', (e) => {
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = this.container.getBoundingClientRect();
      initialLeft = rect.left;
      initialTop = rect.top;
      
      // 切换到绝对定位并固定宽度，防止变形
      this.container.style.right = 'auto'; 
      this.container.style.width = rect.width + 'px'; 
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      
      let newLeft = initialLeft + dx;
      let newTop = initialTop + dy;

      // [关键修改] 边界限制计算
      const winWidth = window.innerWidth;
      const winHeight = window.innerHeight;
      const boxRect = this.container.getBoundingClientRect();
      
      // 限制 X 轴：0 <= Left <= 窗口宽度 - 盒子宽度
      if (newLeft < 0) newLeft = 0;
      else if (newLeft + boxRect.width > winWidth) newLeft = winWidth - boxRect.width;

      // 限制 Y 轴：0 <= Top <= 窗口高度 - 盒子高度
      if (newTop < 0) newTop = 0;
      else if (newTop + boxRect.height > winHeight) newTop = winHeight - boxRect.height;

      this.container.style.left = `${newLeft}px`;
      this.container.style.top = `${newTop}px`;
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  // [新增] 确保搜索框在窗口可见区域内
  _constrainToWindow() {
    if (!this.container) return;
    
    const rect = this.container.getBoundingClientRect();
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;
    
    let newLeft = rect.left;
    let newTop = rect.top;
    let needsUpdate = false;

    // 检查右边界 (如果超出屏幕右侧，向左移)
    if (rect.right > winWidth) {
        newLeft = winWidth - rect.width;
        if (newLeft < 0) newLeft = 0; // 防止窗口比盒子还窄
        needsUpdate = true;
    }
    
    // 检查下边界 (如果超出屏幕底部，向上移)
    if (rect.bottom > winHeight) {
        newTop = winHeight - rect.height;
        if (newTop < 0) newTop = 0;
        needsUpdate = true;
    }

    if (needsUpdate) {
        this.container.style.left = `${newLeft}px`;
        this.container.style.top = `${newTop}px`;
        this.container.style.right = 'auto'; // 确保清除 right 属性
    }
  }

  setScope(scope) {
    if (typeof scope === 'string') {
      this.searchScope = document.querySelector(scope);
    } else if (scope instanceof HTMLElement) {
      this.searchScope = scope;
    } else {
      this.searchScope = document.body;
    }
  }

  setTheme(theme) {
    if (theme === 'auto') {
      const isDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.body.setAttribute('data-search-theme', isDark ? 'dark' : 'light');
    } else {
      document.body.setAttribute('data-search-theme', theme);
    }
  }

  show() {
    if (this.options.beforeShow) this.options.beforeShow();
    this.container.classList.remove('hidden');
    this.isOpen = true;
    
    // 每次打开时都检查一下位置，防止上次关闭后窗口变小了
    this._constrainToWindow();
    
    setTimeout(() => this.input.focus(), 50);
    if (this.input.value) {
        this.search(this.input.value);
    }
  }

  hide() {
    this.container.classList.add('hidden');
    this.isOpen = false;
    this.clear();
    document.activeElement.blur();
  }

  clear() {
    const marks = this.searchScope.querySelectorAll('mark.search-highlight');
    marks.forEach(mark => {
      const parent = mark.parentNode;
      parent.replaceChild(document.createTextNode(mark.textContent), mark);
      parent.normalize();
    });
    this.matches = [];
    this.currentIndex = -1;
    this.updateCount();
  }

  search(text) {
    this.clear();
    if (!text) return;

    const regex = new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    const walker = document.createTreeWalker(
      this.searchScope,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          // 排除搜索框自己和脚本样式
          if (node.parentElement.closest('.text-search-container, script, style, .no-search')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    const textNodes = [];
    let node;
    while (node = walker.nextNode()) {
      textNodes.push(node);
    }

    for (const textNode of textNodes) {
      const content = textNode.nodeValue;
      let match;
      let lastIndex = 0;
      const fragments = [];
      let hasMatch = false;

      regex.lastIndex = 0;

      while ((match = regex.exec(content)) !== null) {
        hasMatch = true;
        if (match.index > lastIndex) {
          fragments.push(document.createTextNode(content.substring(lastIndex, match.index)));
        }
        
        const mark = document.createElement('mark');
        mark.className = 'search-highlight';
        mark.textContent = match[0];
        fragments.push(mark);
        this.matches.push(mark);

        lastIndex = regex.lastIndex;
      }

      if (hasMatch) {
        if (lastIndex < content.length) {
          fragments.push(document.createTextNode(content.substring(lastIndex)));
        }

        const parent = textNode.parentNode;
        fragments.forEach(frag => parent.insertBefore(frag, textNode));
        parent.removeChild(textNode);
      }
    }

    if (this.matches.length > 0) {
      this.jumpTo(0);
    }
    this.updateCount();
  }

  jumpTo(index) {
    if (this.matches.length === 0) return;

    if (this.currentIndex >= 0 && this.matches[this.currentIndex]) {
      this.matches[this.currentIndex].classList.remove('current');
    }

    this.currentIndex = (index + this.matches.length) % this.matches.length;

    const currentMark = this.matches[this.currentIndex];
    currentMark.classList.add('current');
    
    currentMark.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });

    this.updateCount();
  }

  findNext() {
    this.jumpTo(this.currentIndex + 1);
  }

  findPrevious() {
    this.jumpTo(this.currentIndex - 1);
  }

  updateCount() {
    const total = this.matches.length;
    const current = total === 0 ? 0 : this.currentIndex + 1;
    this.countSpan.textContent = `${current}/${total}`;
    
    this.btnPrev.disabled = total === 0;
    this.btnNext.disabled = total === 0;
  }
  
  destroy() {
      window.removeEventListener('resize', this._handleResize);
      if(this.container) {
          this.container.remove();
      }
  }
}