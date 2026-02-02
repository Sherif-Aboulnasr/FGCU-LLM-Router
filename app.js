/**
 * FGCU LLM Router
 * Frontend Application Logic
 */

// ============================================
// Theme Management
// ============================================

const ThemeManager = {
    init() {
        const savedTheme = localStorage.getItem('theme');
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        const theme = savedTheme || (prefersDark ? 'dark' : 'light');
        this.setTheme(theme);

        // Listen for system theme changes
        window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
            if (!localStorage.getItem('theme')) {
                this.setTheme(e.matches ? 'dark' : 'light');
            }
        });
    },

    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    },

    toggle() {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        this.setTheme(newTheme);
    }
};

// ============================================
// Custom Select Component
// ============================================

const ModelSelect = {
    state: {
        isOpen: false,
        selectedValue: 'gpt-5.2',
        selectedIcon: '●',
        selectedName: 'GPT-5.2'
    },

    elements: {
        container: null,
        trigger: null,
        dropdown: null,
        options: null,
        modelIcon: null,
        modelName: null
    },

    init() {
        this.elements.container = document.getElementById('modelSelect');
        this.elements.trigger = document.getElementById('selectTrigger');
        this.elements.dropdown = document.getElementById('selectDropdown');
        this.elements.options = this.elements.dropdown.querySelectorAll('.option');
        this.elements.modelIcon = this.elements.trigger.querySelector('.model-icon');
        this.elements.modelName = this.elements.trigger.querySelector('.model-name');

        this.bindEvents();
    },

    bindEvents() {
        // Toggle dropdown on trigger click
        this.elements.trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggle();
        });

        // Handle option selection
        this.elements.options.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                this.select(option);
            });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', () => {
            if (this.state.isOpen) {
                this.close();
            }
        });

        // Keyboard navigation
        this.elements.trigger.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                this.toggle();
            } else if (e.key === 'Escape' && this.state.isOpen) {
                this.close();
            }
        });
    },

    toggle() {
        this.state.isOpen ? this.close() : this.open();
    },

    open() {
        this.state.isOpen = true;
        this.elements.container.classList.add('open');
    },

    close() {
        this.state.isOpen = false;
        this.elements.container.classList.remove('open');
    },

    select(option) {
        // Update state
        this.state.selectedValue = option.dataset.value;
        this.state.selectedIcon = option.dataset.icon;
        this.state.selectedName = option.querySelector('.model-name').textContent;

        // Update trigger display
        this.elements.modelIcon.textContent = this.state.selectedIcon;
        this.elements.modelName.textContent = this.state.selectedName;

        // Update selected state
        this.elements.options.forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');

        // Close dropdown
        this.close();
    },

    getValue() {
        return {
            value: this.state.selectedValue,
            icon: this.state.selectedIcon,
            name: this.state.selectedName
        };
    }
};

// ============================================
// Prompt Interface
// ============================================

const PromptInterface = {
    elements: {
        input: null,
        charCount: null,
        executeBtn: null
    },

    init() {
        this.elements.input = document.getElementById('promptInput');
        this.elements.charCount = document.getElementById('charCount');
        this.elements.executeBtn = document.getElementById('executeBtn');

        this.bindEvents();
    },

    bindEvents() {
        // Character count
        this.elements.input.addEventListener('input', () => {
            this.updateCharCount();
        });

        // Execute button
        this.elements.executeBtn.addEventListener('click', () => {
            this.execute();
        });

        // Execute on Enter (Shift+Enter for new line)
        this.elements.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.execute();
            }
        });
    },

    updateCharCount() {
        const count = this.elements.input.value.length;
        this.elements.charCount.textContent = count.toLocaleString();
    },

    execute() {
        const prompt = this.elements.input.value.trim();
        if (!prompt) return;

        const model = ModelSelect.getValue();
        ResponseHandler.execute(prompt, model);
    },

    setLoading(loading) {
        if (loading) {
            this.elements.executeBtn.classList.add('loading');
            this.elements.executeBtn.disabled = true;
            this.elements.input.disabled = true;
        } else {
            this.elements.executeBtn.classList.remove('loading');
            this.elements.executeBtn.disabled = false;
            this.elements.input.disabled = false;
        }
    }
};

// ============================================
// Response Handler
// ============================================

const ResponseHandler = {
    elements: {
        section: null,
        modelIcon: null,
        modelName: null,
        content: null,
        text: null,
        cursor: null,
        copyBtn: null,
        clearBtn: null
    },

    state: {
        currentResponse: '',
        isStreaming: false
    },

    init() {
        this.elements.section = document.getElementById('responseSection');
        this.elements.modelIcon = document.getElementById('responseModelIcon');
        this.elements.modelName = document.getElementById('responseModelName');
        this.elements.text = document.getElementById('responseText');
        this.elements.cursor = document.getElementById('cursor');
        this.elements.copyBtn = document.getElementById('copyBtn');
        this.elements.clearBtn = document.getElementById('clearBtn');

        this.bindEvents();
    },

    bindEvents() {
        this.elements.copyBtn.addEventListener('click', () => {
            this.copyResponse();
        });

        this.elements.clearBtn.addEventListener('click', () => {
            this.clear();
        });
    },

    async execute(prompt, model) {
        // Update UI
        this.elements.modelIcon.textContent = model.icon;
        this.elements.modelName.textContent = model.name;

        // Show response section
        this.elements.section.classList.add('visible', 'has-content', 'streaming');
        this.elements.text.textContent = '';
        this.state.currentResponse = '';
        this.state.isStreaming = true;

        // Set loading state
        PromptInterface.setLoading(true);

        try {
            // Call the backend API
            const response = await this.callAPI(prompt, model.value);

            // Stream the response
            await this.streamResponse(response);
        } catch (error) {
            this.elements.text.textContent = `Error: ${error.message}`;
        } finally {
            this.state.isStreaming = false;
            this.elements.section.classList.remove('streaming');
            PromptInterface.setLoading(false);
        }
    },

    async callAPI(prompt, modelId) {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt,
                model: modelId
            })
        });

        if (!response.ok) {
            throw new Error('Failed to generate response');
        }

        return response;
    },

    async streamResponse(response) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const chunk = decoder.decode(value, { stream: true });
            this.appendText(chunk);
        }
    },

    appendText(text) {
        this.state.currentResponse += text;
        // Render markdown with sanitization
        const parseFunc = typeof marked.parse === 'function' ? marked.parse : marked;
        const rawHtml = parseFunc(this.state.currentResponse);
        this.elements.text.innerHTML = DOMPurify.sanitize(rawHtml);

        // Auto-scroll to bottom
        this.elements.section.scrollIntoView({ behavior: 'smooth', block: 'end' });
    },

    async copyResponse() {
        if (!this.state.currentResponse) return;

        try {
            await navigator.clipboard.writeText(this.state.currentResponse);

            // Visual feedback
            const btn = this.elements.copyBtn;
            btn.style.color = 'var(--accent-primary)';
            setTimeout(() => {
                btn.style.color = '';
            }, 1000);
        } catch (error) {
            console.error('Failed to copy:', error);
        }
    },

    clear() {
        this.state.currentResponse = '';
        this.elements.text.textContent = '';
        this.elements.section.classList.remove('has-content', 'streaming');
    }
};

// ============================================
// Initialize Application
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Configure marked for better rendering
    if (typeof marked !== 'undefined') {
        marked.setOptions({
            breaks: true,
            gfm: true
        });
    }

    ThemeManager.init();
    ModelSelect.init();
    PromptInterface.init();
    ResponseHandler.init();

    // Theme toggle button
    document.getElementById('themeToggle').addEventListener('click', () => {
        ThemeManager.toggle();
    });

    // Add entrance animations
    document.body.classList.add('loaded');
});
