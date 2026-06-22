let monacoEditor = null;
let openTabs = new Map(); // path -> { content, model, modified }
let activeTab = null;
let isRemoteUpdate = false;

const LANG_MAP = {
  js: 'javascript', ts: 'typescript', jsx: 'javascript', tsx: 'typescript',
  html: 'html', css: 'css', scss: 'scss', sass: 'scss',
  json: 'json', md: 'markdown', py: 'python', java: 'java',
  php: 'php', rb: 'ruby', go: 'go', rs: 'rust', cpp: 'cpp', c: 'c',
  sh: 'shell', bash: 'shell', sql: 'sql', xml: 'xml',
  yaml: 'yaml', yml: 'yaml', toml: 'ini', vue: 'html', svelte: 'html',
  txt: 'plaintext',
};

function getLang(filename) {
  const ext = filename.includes('.') ? filename.split('.').pop().toLowerCase() : '';
  return LANG_MAP[ext] || 'plaintext';
}

function initMonaco() {
  return new Promise((resolve) => {
    require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });
    require(['vs/editor/editor.main'], () => {
      // Catppuccin Mocha dark theme
      monaco.editor.defineTheme('codeflow-dark', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'comment', foreground: '6c7086', fontStyle: 'italic' },
          { token: 'keyword', foreground: 'cba6f7' },
          { token: 'string', foreground: 'a6e3a1' },
          { token: 'number', foreground: 'fab387' },
          { token: 'type', foreground: 'f9e2af' },
          { token: 'function', foreground: '89b4fa' },
          { token: 'variable', foreground: 'cdd6f4' },
          { token: 'operator', foreground: '89dceb' },
          { token: 'delimiter', foreground: '94e2d5' },
          { token: 'tag', foreground: 'f38ba8' },
          { token: 'attribute.name', foreground: 'fab387' },
          { token: 'attribute.value', foreground: 'a6e3a1' },
        ],
        colors: {
          'editor.background': '#1e1e2e',
          'editor.foreground': '#cdd6f4',
          'editorLineNumber.foreground': '#45475a',
          'editorLineNumber.activeForeground': '#cba6f7',
          'editor.lineHighlightBackground': '#181825',
          'editor.selectionBackground': '#45475a',
          'editor.inactiveSelectionBackground': '#313244',
          'editorCursor.foreground': '#f5c2e7',
          'editorWhitespace.foreground': '#313244',
          'editorIndentGuide.background': '#313244',
          'editorIndentGuide.activeBackground': '#45475a',
          'editorSuggestWidget.background': '#181825',
          'editorSuggestWidget.border': '#313244',
          'editorSuggestWidget.selectedBackground': '#313244',
          'editorWidget.background': '#181825',
          'editorWidget.border': '#313244',
          'input.background': '#11111b',
          'input.border': '#313244',
          'scrollbar.shadow': '#00000000',
          'scrollbarSlider.background': '#45475a80',
          'scrollbarSlider.hoverBackground': '#45475a',
          'minimap.background': '#181825',
        }
      });

      monacoEditor = monaco.editor.create(document.getElementById('monaco-editor'), {
        theme: 'codeflow-dark',
        language: 'plaintext',
        fontSize: 14,
        fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
        fontLigatures: true,
        lineNumbers: 'on',
        wordWrap: 'off',
        minimap: { enabled: true, scale: 1 },
        scrollBeyondLastLine: false,
        automaticLayout: true,
        tabSize: 2,
        insertSpaces: true,
        autoClosingBrackets: 'always',
        autoClosingQuotes: 'always',
        formatOnPaste: true,
        formatOnType: false,
        suggestOnTriggerCharacters: true,
        acceptSuggestionOnEnter: 'on',
        quickSuggestions: { other: true, comments: false, strings: true },
        parameterHints: { enabled: true },
        hover: { enabled: true },
        contextmenu: true,
        multiCursorModifier: 'alt',
        renderWhitespace: 'selection',
        bracketPairColorization: { enabled: true },
        guides: { bracketPairs: true, indentation: true },
        smoothScrolling: true,
        cursorSmoothCaretAnimation: 'on',
        scrollbar: {
          verticalScrollbarSize: 6,
          horizontalScrollbarSize: 6,
        },
        padding: { top: 8, bottom: 8 },
        glyphMargin: true,
        folding: true,
        renderLineHighlight: 'line',
      });

      // Track changes
      monacoEditor.onDidChangeModelContent((e) => {
        if (isRemoteUpdate) return;
        if (!activeTab) return;

        const content = monacoEditor.getValue();

        if (openTabs.has(activeTab)) {
          openTabs.get(activeTab).content = content;
          openTabs.get(activeTab).modified = true;
        }

        // Mark tab as modified
        const tabEl = document.querySelector(`.editor-tab[data-path="${CSS.escape(activeTab)}"]`);
        if (tabEl) tabEl.classList.add('modified');

        // Update save status
        setSaveStatus('unsaved');

        // Emit to socket
        if (socket && currentServerId) {
          socket.emit('code-change', {
            serverId: currentServerId,
            filePath: activeTab,
            content,
            cursorPosition: monacoEditor.getPosition()
          });
        }
      });

      // Cursor tracking
      monacoEditor.onDidChangeCursorPosition((e) => {
        document.getElementById('status-cursor').textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
        if (socket && currentServerId && activeTab) {
          socket.emit('typing', {
            serverId: currentServerId,
            filePath: activeTab,
            line: e.position.lineNumber,
            column: e.position.column
          });
        }
      });

      // Emmet abbreviation expansion on Tab key
      monacoEditor.addCommand(monaco.KeyCode.Tab, () => {
        const model = monacoEditor.getModel();
        const pos = monacoEditor.getPosition();
        const lang = model ? model.getLanguageId() : 'plaintext';
        if (['html', 'xml', 'css', 'javascript', 'typescript'].includes(lang)) {
          const lineContent = model.getLineContent(pos.lineNumber);
          const textBefore = lineContent.substring(0, pos.column - 1).trim();
          const expanded = expandEmmet(textBefore, lang);
          if (expanded) {
            const range = new monaco.Range(pos.lineNumber, pos.column - textBefore.length, pos.lineNumber, pos.column);
            monacoEditor.executeEdits(emmet, [{ range, text: expanded }]);
            return;
          }
        }
        monacoEditor.trigger('keyboard', 'type', { text: '	' });
      }, 'editorTextFocus \      // Ctrl+S to save\      // Ctrl+S to save !editorTabMovesFocus');

      // Ctrl+S to save
      monacoEditor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        saveCurrentFile();
      });

      resolve(monacoEditor);
    });
  });
}

async function openFile(serverId, filePath) {
  document.getElementById('editor-placeholder').style.display = 'none';

  // If already open, just switch
  if (openTabs.has(filePath)) {
    switchTab_editor(filePath);
    return;
  }

  try {
    const data = await API.get(`/files/${serverId}/read?path=${encodeURIComponent(filePath)}`);
    const content = data.content || '';
    const lang = getLang(filePath);
    const model = monaco.editor.createModel(content, lang);

    openTabs.set(filePath, { content, model, modified: false });
    addTab(filePath);
    switchTab_editor(filePath);

    if (socket) socket.emit('open-file', { serverId, filePath });
  } catch (err) {
    toast('Failed to open file', 'error');
  }
}

function switchTab_editor(filePath) {
  if (!monacoEditor || !openTabs.has(filePath)) return;

  activeTab = filePath;
  const tabData = openTabs.get(filePath);
  isRemoteUpdate = true;
  monacoEditor.setModel(tabData.model);
  isRemoteUpdate = false;

  // Update tab UI
  document.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
  const tabEl = document.querySelector(`.editor-tab[data-path="${CSS.escape(filePath)}"]`);
  if (tabEl) tabEl.classList.add('active');

  // Update status bar
  document.getElementById('status-lang').textContent = getLang(filePath).replace(/^\w/, c => c.toUpperCase());

  if (socket && currentServerId) {
    socket.emit('open-file', { serverId: currentServerId, filePath });
  }
}

function addTab(filePath) {
  const tabsContainer = document.getElementById('tabs-container');
  const name = filePath.split('/').pop();
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
  const icon = getFileIcon(name, ext);

  const tab = document.createElement('div');
  tab.className = 'editor-tab';
  tab.dataset.path = filePath;
  tab.title = filePath;
  tab.innerHTML = `
    <span class="tab-icon ${getIconClass(ext)}">${icon}</span>
    <span class="tab-label">${escHtml(name)}</span>
    <button class="tab-close" onclick="event.stopPropagation(); closeTab('${filePath.replace(/'/g, "\\'")}')" title="Close">×</button>
  `;
  tab.addEventListener('click', () => switchTab_editor(filePath));
  tabsContainer.appendChild(tab);
}

function closeTab(filePath) {
  const tabEl = document.querySelector(`.editor-tab[data-path="${CSS.escape(filePath)}"]`);
  if (tabEl) tabEl.remove();

  const tabData = openTabs.get(filePath);
  if (tabData && tabData.model) tabData.model.dispose();
  openTabs.delete(filePath);

  if (activeTab === filePath) {
    activeTab = null;
    if (openTabs.size > 0) {
      switchTab_editor(openTabs.keys().next().value);
    } else {
      monacoEditor.setModel(null);
      document.getElementById('editor-placeholder').style.display = 'flex';
    }
  }
}

async function saveCurrentFile() {
  if (!activeTab || !monacoEditor || !currentServerId) return;
  const content = monacoEditor.getValue();

  try {
    await API.post(`/files/${currentServerId}/write`, { filePath: activeTab, content });

    if (openTabs.has(activeTab)) openTabs.get(activeTab).modified = false;
    const tabEl = document.querySelector(`.editor-tab[data-path="${CSS.escape(activeTab)}"]`);
    if (tabEl) tabEl.classList.remove('modified');

    setSaveStatus('saved');

    if (socket) {
      socket.emit('save-file', { serverId: currentServerId, filePath: activeTab, content });
    }
  } catch (err) {
    toast('Failed to save', 'error');
  }
}

function setSaveStatus(state) {
  const el = document.getElementById('save-status');
  if (state === 'unsaved') {
    el.textContent = '● Unsaved changes';
    el.classList.add('unsaved');
  } else {
    el.textContent = 'All changes saved';
    el.classList.remove('unsaved');
  }
}

// Apply remote change from another user
function applyRemoteChange(filePath, content) {
  if (!openTabs.has(filePath)) return;
  const tabData = openTabs.get(filePath);
  if (activeTab === filePath) {
    const pos = monacoEditor.getPosition();
    isRemoteUpdate = true;
    tabData.model.setValue(content);
    monacoEditor.setPosition(pos);
    isRemoteUpdate = false;
  } else {
    tabData.model.setValue(content);
  }
  tabData.content = content;
}

// ===== EMMET EXPANDER =====
function expandEmmet(abbr, lang) {
  if (!abbr) return null;

  // HTML emmet
  if (['html', 'xml'].includes(lang)) {
    // Full boilerplate
    if (abbr === '!') return `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Document</title>\n</head>\n<body>\n  \n</body>\n</html>`;

    // tag with class: div.container
    const classMatch = abbr.match(/^([a-z][a-z0-9]*)((?:\.[a-zA-Z0-9_-]+)+)$/);
    if (classMatch) {
      const tag = classMatch[1];
      const classes = classMatch[2].replace(/\./g, ' ').trim();
      return `<${tag} class="${classes}"></${tag}>`;
    }

    // tag with id: div#app
    const idMatch = abbr.match(/^([a-z][a-z0-9]*)#([a-zA-Z0-9_-]+)$/);
    if (idMatch) return `<${idMatch[1]} id="${idMatch[2]}"></${idMatch[1]}>`;

    // tag with class and id: div#app.container
    const bothMatch = abbr.match(/^([a-z][a-z0-9]*)#([a-zA-Z0-9_-]+)((?:\.[a-zA-Z0-9_-]+)+)$/);
    if (bothMatch) {
      const tag = bothMatch[1], id = bothMatch[2], classes = bothMatch[3].replace(/\./g, ' ').trim();
      return `<${tag} id="${id}" class="${classes}"></${tag}>`;
    }

    // Simple void tags
    const voidTags = ['br','hr','img','input','link','meta','source','track','wbr'];
    if (voidTags.includes(abbr)) {
      const attrs = { img: ' src="" alt=""', input: ' type="text"', link: ' rel="stylesheet" href=""', meta: ' name="" content=""' };
      return `<${abbr}${attrs[abbr] || ''}>`;
    }

    // Simple tag
    if (/^[a-z][a-z0-9]*$/.test(abbr)) return `<${abbr}></${abbr}>`;

    // lorem
    if (abbr === 'lorem') return 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.';
  }

  // CSS emmet
  if (lang === 'css') {
    const cssSnippets = {
      'm': 'margin: ;', 'mt': 'margin-top: ;', 'mb': 'margin-bottom: ;', 'ml': 'margin-left: ;', 'mr': 'margin-right: ;',
      'p': 'padding: ;', 'pt': 'padding-top: ;', 'pb': 'padding-bottom: ;', 'pl': 'padding-left: ;', 'pr': 'padding-right: ;',
      'df': 'display: flex;', 'dg': 'display: grid;', 'dn': 'display: none;', 'db': 'display: block;',
      'w': 'width: ;', 'h': 'height: ;', 'mw': 'max-width: ;', 'mh': 'max-height: ;',
      'bg': 'background: ;', 'bgc': 'background-color: ;', 'c': 'color: ;',
      'fw': 'font-weight: ;', 'fs': 'font-size: ;', 'ff': 'font-family: ;',
      'pos': 'position: ;', 'posa': 'position: absolute;', 'posr': 'position: relative;', 'posf': 'position: fixed;',
      'ai': 'align-items: ;', 'jc': 'justify-content: ;', 'bd': 'border: ;', 'br': 'border-radius: ;',
      'op': 'opacity: ;', 'of': 'overflow: ;', 'ofa': 'overflow: auto;', 'ofh': 'overflow: hidden;',
      'cur': 'cursor: ;', 'z': 'z-index: ;', 'tac': 'text-align: center;', 'tar': 'text-align: right;',
      'fl': 'float: left;', 'fr': 'float: right;', 'tr': 'transition: ;', 'tf': 'transform: ;',
    };
    if (cssSnippets[abbr]) return cssSnippets[abbr];
  }

  return null;
}
