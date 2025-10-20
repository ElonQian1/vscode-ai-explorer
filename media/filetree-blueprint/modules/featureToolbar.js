// media/filetree-blueprint/modules/featureToolbar.js
// 功能筛选工具条（CSP安全版）

/**
 * 创建功能筛选工具条
 * @param {object} config - 配置对象
 * @param {number} [config.relevanceThreshold=30] - 相关性阈值 (0-100)
 * @param {string[]} [config.keywords=[]] - 关键词列表
 * @param {number} [config.maxHops=3] - 最大跳数 (1-5)
 * @param {Function} config.onFilterChange - 筛选条件变化回调 (filters) => void
 * @returns {HTMLElement} 工具条DOM元素
 */
function createFeatureToolbar(config = {}) {
    const {
        relevanceThreshold = 30,
        keywords = [],
        maxHops = 3,
        onFilterChange = () => {}
    } = config;

    // 当前筛选状态
    const state = {
        relevanceThreshold,
        keywords: [...keywords],
        maxHops
    };

    // 🎨 创建工具条容器
    const toolbar = document.createElement('div');
    toolbar.className = 'feature-toolbar';

    // 📊 阈值滑块
    const thresholdSection = createThresholdSlider(state, onFilterChange);
    toolbar.appendChild(thresholdSection);

    // 🔖 关键词筛选
    const keywordsSection = createKeywordsChips(state, onFilterChange);
    toolbar.appendChild(keywordsSection);

    // 🔢 跳数选择器
    const hopsSection = createHopsSelector(state, onFilterChange);
    toolbar.appendChild(hopsSection);

    return toolbar;
}

/**
 * 创建阈值滑块
 */
function createThresholdSlider(state, onFilterChange) {
    const section = document.createElement('div');
    section.className = 'toolbar-section threshold-section';

    const label = document.createElement('label');
    label.className = 'toolbar-label';
    label.textContent = '相关性阈值:';
    section.appendChild(label);

    const sliderContainer = document.createElement('div');
    sliderContainer.className = 'slider-container';

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '0';
    slider.max = '100';
    slider.step = '5';
    slider.value = state.relevanceThreshold.toString();
    slider.className = 'threshold-slider';

    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'threshold-value';
    valueDisplay.textContent = state.relevanceThreshold.toString();

    // 🎯 滑块变化事件
    slider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value, 10);
        valueDisplay.textContent = value.toString();
        state.relevanceThreshold = value;
        onFilterChange({ ...state });
    });

    sliderContainer.appendChild(slider);
    sliderContainer.appendChild(valueDisplay);
    section.appendChild(sliderContainer);

    return section;
}

/**
 * 创建关键词chips
 */
function createKeywordsChips(state, onFilterChange) {
    const section = document.createElement('div');
    section.className = 'toolbar-section keywords-section';

    const label = document.createElement('label');
    label.className = 'toolbar-label';
    label.textContent = '关键词筛选:';
    section.appendChild(label);

    const chipsContainer = document.createElement('div');
    chipsContainer.className = 'keywords-chips';

    // 渲染现有关键词chips
    const renderChips = () => {
        chipsContainer.innerHTML = '';
        
        state.keywords.forEach((keyword, index) => {
            const chip = document.createElement('div');
            chip.className = 'keyword-chip';

            const chipText = document.createElement('span');
            chipText.className = 'chip-text';
            chipText.textContent = keyword;
            chip.appendChild(chipText);

            const removeBtn = document.createElement('button');
            removeBtn.className = 'chip-remove';
            removeBtn.textContent = '×';
            removeBtn.title = '移除关键词';
            
            // 🗑️ 移除关键词
            removeBtn.addEventListener('click', () => {
                state.keywords.splice(index, 1);
                renderChips();
                onFilterChange({ ...state });
            });
            
            chip.appendChild(removeBtn);
            chipsContainer.appendChild(chip);
        });

        // 添加输入框
        const inputWrapper = document.createElement('div');
        inputWrapper.className = 'chip-input-wrapper';

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'chip-input';
        input.placeholder = '添加关键词...';

        // ➕ 添加关键词
        const addKeyword = () => {
            const value = input.value.trim();
            if (value && !state.keywords.includes(value)) {
                state.keywords.push(value);
                input.value = '';
                renderChips();
                onFilterChange({ ...state });
            }
        };

        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addKeyword();
            }
        });

        input.addEventListener('blur', addKeyword);

        inputWrapper.appendChild(input);
        chipsContainer.appendChild(inputWrapper);
    };

    renderChips();
    section.appendChild(chipsContainer);

    return section;
}

/**
 * 创建跳数选择器
 */
function createHopsSelector(state, onFilterChange) {
    const section = document.createElement('div');
    section.className = 'toolbar-section hops-section';

    const label = document.createElement('label');
    label.className = 'toolbar-label';
    label.textContent = '最大跳数:';
    section.appendChild(label);

    const selectContainer = document.createElement('div');
    selectContainer.className = 'hops-select-container';

    const select = document.createElement('select');
    select.className = 'hops-select';

    // 生成1-5跳数选项
    for (let i = 1; i <= 5; i++) {
        const option = document.createElement('option');
        option.value = i.toString();
        option.textContent = `${i} 跳`;
        if (i === state.maxHops) {
            option.selected = true;
        }
        select.appendChild(option);
    }

    // 🔢 跳数变化事件
    select.addEventListener('change', (e) => {
        state.maxHops = parseInt(e.target.value, 10);
        onFilterChange({ ...state });
    });

    selectContainer.appendChild(select);
    section.appendChild(selectContainer);

    return section;
}

/**
 * 更新工具条状态
 * @param {HTMLElement} toolbar - 工具条元素
 * @param {object} newState - 新状态
 */
function updateToolbarState(toolbar, newState) {
    // 更新阈值滑块
    const slider = toolbar.querySelector('.threshold-slider');
    const valueDisplay = toolbar.querySelector('.threshold-value');
    if (slider && newState.relevanceThreshold !== undefined) {
        slider.value = newState.relevanceThreshold.toString();
        if (valueDisplay) {
            valueDisplay.textContent = newState.relevanceThreshold.toString();
        }
    }

    // 更新跳数选择器
    const select = toolbar.querySelector('.hops-select');
    if (select && newState.maxHops !== undefined) {
        select.value = newState.maxHops.toString();
    }

    // TODO: 更新关键词chips（需要重新渲染）
}

// 导出模块
if (typeof window !== 'undefined') {
    window.featureToolbar = {
        create: createFeatureToolbar,
        updateState: updateToolbarState
    };
}
